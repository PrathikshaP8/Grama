import { Router } from 'express';
import { z } from 'zod';
import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { Patient } from '../models/Patient.js';
import { MedicalHistoryEntry } from '../models/MedicalHistoryEntry.js';
import { Facility } from '../models/Facility.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { appendAudit } from '../services/audit.js';

const router = Router();
router.use(requireAuth, requireRole('hospital'));

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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
      return {
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        position: d.position,
        status: avail?.status ?? 'available',
        date,
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

  res.json({ availability: avail });
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

  res.status(201).json({ entries });
});

export default router;
