import { Router } from 'express';
import { z } from 'zod';
import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { AppointmentSlot } from '../models/AppointmentSlot.js';
import { Appointment } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { MedicalHistoryEntry } from '../models/MedicalHistoryEntry.js';
import { Facility } from '../models/Facility.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { appendAudit } from '../services/audit.js';
import { emitEvent } from '../realtime/io.js';
import { todayIso } from '../services/geo.js';

const router = Router();
router.use(requireAuth, requireRole('hospital'));

router.get('/facility', async (req, res) => {
  const facility = await Facility.findById(req.user!.facilityId);
  res.json({ facility });
});

router.get('/doctors', async (req, res) => {
  const facilityId = req.user!.facilityId;
  const date = (req.query.date as string) || todayIso();
  const doctors = await Doctor.find({ facilityId, active: true });
  const rows = await Promise.all(
    doctors.map(async (d) => {
      const avail = await DoctorAvailability.findOne({ doctorId: d._id, date });
      const slots = await AppointmentSlot.find({ doctorId: d._id, date }).sort({ time: 1 });
      return {
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        position: d.position,
        status: avail?.status ?? 'available',
        date,
        slots: slots.map((s) => ({
          id: s.id,
          time: s.time,
          status: s.status,
          appointmentId: s.appointmentId,
        })),
        openSlotCount: slots.filter((s) => s.status === 'open').length,
      };
    })
  );
  res.json({ doctors: rows, date });
});

const statusSchema = z.object({
  status: z.enum(['available', 'not_available', 'on_leave', 'in_procedure']),
  date: z.string().optional(),
});

router.patch('/doctors/:doctorId/availability', validateBody(statusSchema), async (req, res) => {
  const body = req.body as z.infer<typeof statusSchema>;
  const date = body.date || todayIso();
  const doctor = await Doctor.findOne({ _id: req.params.doctorId, facilityId: req.user!.facilityId });
  if (!doctor) {
    res.status(404).json({ error: 'Doctor not found at your facility' });
    return;
  }

  const avail = await DoctorAvailability.findOneAndUpdate(
    { doctorId: doctor._id, date },
    {
      doctorId: doctor._id,
      facilityId: doctor.facilityId,
      date,
      status: body.status,
      updatedBy: req.user!.id,
    },
    { upsert: true, new: true }
  );

  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'hospital',
    action: 'doctor.availability.update',
    entityType: 'DoctorAvailability',
    entityId: avail.id,
    metadata: { doctorId: doctor.id, status: body.status, date },
  });

  const facility = await Facility.findById(doctor.facilityId).select('name');
  const payload = {
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialty: doctor.specialty,
    facilityId: doctor.facilityId.toString(),
    facilityName: facility?.name,
    status: body.status,
    date,
    updatedAt: new Date().toISOString(),
  };

  emitEvent('doctor:availability_changed', payload, [
    `facility:${doctor.facilityId}`,
    `role:patient`,
    `role:asha`,
    `role:hospital`,
    `specialty:${doctor.specialty.toLowerCase()}`,
  ]);

  res.json({ availability: avail, doctor: payload });
});

const slotsSchema = z.object({
  date: z.string().optional(),
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
});

/** Replace/create open slots for a doctor on a date (does not wipe booked slots). */
router.put('/doctors/:doctorId/slots', validateBody(slotsSchema), async (req, res) => {
  const body = req.body as z.infer<typeof slotsSchema>;
  const date = body.date || todayIso();
  const doctor = await Doctor.findOne({ _id: req.params.doctorId, facilityId: req.user!.facilityId });
  if (!doctor) {
    res.status(404).json({ error: 'Doctor not found at your facility' });
    return;
  }

  const created = [];
  for (const time of body.times) {
    const existing = await AppointmentSlot.findOne({ doctorId: doctor._id, date, time });
    if (existing) {
      if (existing.status === 'blocked') {
        existing.status = 'open';
        await existing.save();
        created.push(existing);
      }
      continue;
    }
    created.push(
      await AppointmentSlot.create({
        doctorId: doctor._id,
        facilityId: doctor.facilityId,
        date,
        time,
        status: 'open',
      })
    );
  }

  emitEvent(
    'slot:updated',
    {
      doctorId: doctor.id,
      facilityId: doctor.facilityId.toString(),
      date,
      action: 'slots_upserted',
    },
    [`facility:${doctor.facilityId}`, `role:patient`, `specialty:${doctor.specialty.toLowerCase()}`]
  );

  const slots = await AppointmentSlot.find({ doctorId: doctor._id, date }).sort({ time: 1 });
  res.json({ slots });
});

router.get('/appointments', async (req, res) => {
  const facilityId = req.user!.facilityId;
  const appointments = await Appointment.find({ facilityId })
    .populate('patientId', 'name uniqueId village')
    .populate('doctorId', 'name specialty')
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ appointments });
});

const apptStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']),
});

router.patch('/appointments/:id', validateBody(apptStatusSchema), async (req, res) => {
  const body = req.body as z.infer<typeof apptStatusSchema>;
  const appt = await Appointment.findOne({ _id: req.params.id, facilityId: req.user!.facilityId });
  if (!appt) {
    res.status(404).json({ error: 'Appointment not found' });
    return;
  }

  const prev = appt.status;
  appt.status = body.status;
  await appt.save();

  if (body.status === 'cancelled' && appt.slotId) {
    await AppointmentSlot.findOneAndUpdate(
      { _id: appt.slotId, status: 'booked' },
      { $set: { status: 'open' }, $unset: { appointmentId: 1, bookedBy: 1 } }
    );
    emitEvent(
      'slot:updated',
      {
        slotId: appt.slotId.toString(),
        facilityId: appt.facilityId.toString(),
        doctorId: appt.doctorId?.toString(),
        status: 'open',
      },
      [`facility:${appt.facilityId}`, `role:patient`]
    );
  }

  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'hospital',
    action: 'appointment.update',
    entityType: 'Appointment',
    entityId: appt.id,
    metadata: { from: prev, to: body.status },
  });

  emitEvent(
    'appointment:updated',
    {
      appointmentId: appt.id,
      facilityId: appt.facilityId.toString(),
      patientId: appt.patientId.toString(),
      status: body.status,
    },
    [`facility:${appt.facilityId}`, `user:${appt.patientId}`, `role:patient`, `role:hospital`]
  );

  res.json({ appointment: appt });
});

router.get('/scan/:uniqueId', async (req, res) => {
  const uniqueId = req.params.uniqueId.toUpperCase();
  const patient = await Patient.findOne({ uniqueId }).select('-aadhaarHash -phoneEncrypted');
  if (!patient) {
    res.status(404).json({ error: 'Patient not found for this QR ID' });
    return;
  }
  const history = await MedicalHistoryEntry.find({ patientId: patient._id }).sort({ createdAt: -1 }).limit(50);
  const meds = history.filter((h) => h.type === 'medication').flatMap((h) => (h.payload.medications as string[]) ?? []);
  const conditions = history
    .filter((h) => h.type === 'condition')
    .flatMap((h) => (h.payload.conditions as string[]) ?? []);
  const vitals = history.filter((h) => h.type === 'vitals').slice(0, 5);

  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'hospital',
    action: 'qr.scan',
    entityType: 'Patient',
    entityId: patient.id,
    metadata: { uniqueId, facilityId: req.user!.facilityId },
  });

  res.json({
    patient,
    summary: {
      bloodGroup: patient.bloodGroup,
      medications: [...new Set(meds)],
      conditions: [...new Set(conditions)],
      recentVitals: vitals.map((v) => v.payload),
    },
    history,
  });
});

const visitSchema = z.object({
  uniqueId: z.string().min(3),
  notes: z.string().optional(),
  vitals: z
    .object({
      bpSystolic: z.number().optional(),
      bpDiastolic: z.number().optional(),
      bloodSugar: z.number().optional(),
    })
    .optional(),
  medications: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
});

router.post('/visits', validateBody(visitSchema), async (req, res) => {
  const body = req.body as z.infer<typeof visitSchema>;
  const patient = await Patient.findOne({ uniqueId: body.uniqueId.toUpperCase() });
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }

  const entries = [];
  entries.push(
    await MedicalHistoryEntry.create({
      patientId: patient._id,
      type: 'visit',
      payload: {
        facilityId: req.user!.facilityId,
        notes: body.notes,
        date: todayIso(),
      },
      notes: body.notes,
      recordedBy: req.user!.id,
      recordedByRole: 'hospital',
    })
  );

  if (body.vitals) {
    entries.push(
      await MedicalHistoryEntry.create({
        patientId: patient._id,
        type: 'vitals',
        payload: { ...body.vitals, date: todayIso() },
        recordedBy: req.user!.id,
        recordedByRole: 'hospital',
      })
    );
  }
  if (body.medications?.length) {
    entries.push(
      await MedicalHistoryEntry.create({
        patientId: patient._id,
        type: 'medication',
        payload: { medications: body.medications },
        recordedBy: req.user!.id,
        recordedByRole: 'hospital',
      })
    );
  }
  if (body.conditions?.length) {
    entries.push(
      await MedicalHistoryEntry.create({
        patientId: patient._id,
        type: 'condition',
        payload: { conditions: body.conditions },
        recordedBy: req.user!.id,
        recordedByRole: 'hospital',
      })
    );
  }

  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'hospital',
    action: 'visit.record',
    entityType: 'Patient',
    entityId: patient.id,
    metadata: { uniqueId: patient.uniqueId },
  });

  emitEvent(
    'patient:updated',
    { patientId: patient.id, uniqueId: patient.uniqueId, reason: 'visit' },
    [`user:${patient.id}`, `role:patient`, `role:asha`]
  );

  res.status(201).json({ entries });
});

export default router;
