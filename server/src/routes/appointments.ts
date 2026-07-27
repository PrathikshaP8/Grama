import { Router } from 'express';
import { z } from 'zod';
import { Appointment } from '../models/Appointment.js';
import { AppointmentSlot } from '../models/AppointmentSlot.js';
import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { Facility } from '../models/Facility.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { appendAudit } from '../services/audit.js';
import { emitEvent } from '../realtime/io.js';
import { todayIso } from '../services/geo.js';

const router = Router();

const createSchema = z.object({
  facilityId: z.string(),
  doctorId: z.string(),
  slotId: z.string(),
  specialty: z.string().optional(),
  urgency: z.enum(['routine', 'soon', 'urgent', 'emergency']).optional(),
  symptoms: z.string().optional(),
  reason: z.string().optional(),
  bookedVia: z.enum(['voice', 'manual']).default('manual'),
  confirmed: z.boolean(),
});

router.post('/', requireAuth, requireRole('patient'), validateBody(createSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  if (!body.confirmed) {
    res.status(400).json({
      error: 'Explicit confirmation required before booking',
      code: 'CONFIRMATION_REQUIRED',
    });
    return;
  }

  const doctor = await Doctor.findById(body.doctorId);
  if (!doctor || doctor.facilityId.toString() !== body.facilityId) {
    res.status(400).json({ error: 'Doctor does not belong to this facility' });
    return;
  }

  const date = todayIso();
  const avail = await DoctorAvailability.findOne({ doctorId: doctor._id, date });
  const status = avail?.status ?? 'available';
  if (status !== 'available') {
    res.status(409).json({
      error: 'This doctor is not available today. Please choose another.',
      code: 'DOCTOR_UNAVAILABLE',
    });
    return;
  }

  // Atomic claim — prevents double-booking race
  const slot = await AppointmentSlot.findOneAndUpdate(
    { _id: body.slotId, doctorId: doctor._id, status: 'open' },
    {
      $set: {
        status: 'booked',
        bookedBy: req.user!.id,
      },
    },
    { new: true }
  );

  if (!slot) {
    const stillExists = await AppointmentSlot.findById(body.slotId);
    res.status(409).json({
      error: 'This slot was just booked. Please choose another available time.',
      code: 'SLOT_TAKEN',
      slotId: body.slotId,
      stillOpen: stillExists?.status === 'open',
    });
    return;
  }

  const appt = await Appointment.create({
    patientId: req.user!.id,
    facilityId: body.facilityId,
    doctorId: body.doctorId,
    slotId: slot._id,
    slotDate: slot.date,
    slotTime: slot.time,
    specialty: body.specialty || doctor.specialty,
    urgency: body.urgency,
    symptoms: body.symptoms,
    reason: body.reason,
    confirmedByPatient: true,
    status: 'pending',
    bookedVia: body.bookedVia,
  });

  slot.appointmentId = appt._id;
  await slot.save();

  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'patient',
    action: 'appointment.book',
    entityType: 'Appointment',
    entityId: appt.id,
    metadata: { facilityId: body.facilityId, doctorId: body.doctorId, slotTime: slot.time },
  });

  const payload = {
    appointmentId: appt.id,
    facilityId: body.facilityId,
    doctorId: body.doctorId,
    slotId: slot.id,
    status: appt.status,
    patientId: req.user!.id,
  };

  emitEvent('appointment:created', payload, [
    `facility:${body.facilityId}`,
    `role:hospital`,
    `user:${req.user!.id}`,
    `role:patient`,
  ]);
  emitEvent('slot:updated', { slotId: slot.id, facilityId: body.facilityId, doctorId: body.doctorId, status: 'booked' }, [
    `facility:${body.facilityId}`,
    `role:patient`,
    `specialty:${doctor.specialty.toLowerCase()}`,
  ]);

  res.status(201).json({ appointment: appt });
});

router.get('/mine', requireAuth, requireRole('patient'), async (req, res) => {
  const appointments = await Appointment.find({ patientId: req.user!.id })
    .populate('facilityId', 'name type address')
    .populate('doctorId', 'name specialty')
    .sort({ createdAt: -1 });
  res.json({ appointments });
});

router.post('/:id/cancel', requireAuth, requireRole('patient'), async (req, res) => {
  const appt = await Appointment.findOne({ _id: req.params.id, patientId: req.user!.id });
  if (!appt) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (appt.status === 'cancelled') {
    res.json({ appointment: appt });
    return;
  }

  appt.status = 'cancelled';
  await appt.save();

  if (appt.slotId) {
    await AppointmentSlot.findOneAndUpdate(
      { _id: appt.slotId, status: 'booked' },
      { $set: { status: 'open' }, $unset: { appointmentId: 1, bookedBy: 1 } }
    );
  }

  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'patient',
    action: 'appointment.cancel',
    entityType: 'Appointment',
    entityId: appt.id,
  });

  emitEvent(
    'appointment:updated',
    {
      appointmentId: appt.id,
      facilityId: appt.facilityId.toString(),
      status: 'cancelled',
      patientId: req.user!.id,
    },
    [`facility:${appt.facilityId}`, `role:hospital`, `user:${req.user!.id}`]
  );
  if (appt.slotId) {
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

  res.json({ appointment: appt });
});

/** Open slots for a doctor (live from DB). */
router.get('/slots', requireAuth, async (req, res) => {
  const doctorId = req.query.doctorId as string;
  const date = (req.query.date as string) || todayIso();
  if (!doctorId) {
    res.status(400).json({ error: 'doctorId required' });
    return;
  }
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    res.status(404).json({ error: 'Doctor not found' });
    return;
  }
  const avail = await DoctorAvailability.findOne({ doctorId, date });
  const status = avail?.status ?? 'available';
  const slots =
    status === 'available'
      ? await AppointmentSlot.find({ doctorId, date, status: 'open' }).sort({ time: 1 })
      : [];
  const facility = await Facility.findById(doctor.facilityId).select('name');
  res.json({
    doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty, status },
    facility,
    date,
    slots: slots.map((s) => ({ id: s.id, time: s.time, date: s.date, status: s.status })),
  });
});

export default router;
