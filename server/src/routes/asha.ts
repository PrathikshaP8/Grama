import { Router } from 'express';
import { z } from 'zod';
import { Patient } from '../models/Patient.js';
import { AshaWorker } from '../models/AshaWorker.js';
import { MedicalHistoryEntry } from '../models/MedicalHistoryEntry.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { hashAadhaar, aadhaarLast4 } from '../services/aadhaar.js';
import { encryptField } from '../services/crypto.js';
import { allocateUniqueId } from '../services/uniqueId.js';
import { generateQrDataUrl } from '../services/qr.js';
import { appendAudit } from '../services/audit.js';
import { resolveRegisteredCoords } from '../services/geo.js';
import { emitEvent } from '../realtime/io.js';

const router = Router();
router.use(requireAuth, requireRole('asha'));

const registerSchema = z.object({
  fullName: z.string().min(2),
  aadhaar: z.string().min(12).max(14),
  phone: z.string().min(10).max(15),
  bloodGroup: z.string().min(1),
  address: z.string().min(3),
  village: z.string().optional(),
  city: z.string().min(2),
  baseline: z
    .object({
      conditions: z.array(z.string()).optional(),
      bpSystolic: z.number().optional(),
      bpDiastolic: z.number().optional(),
      bloodSugar: z.number().optional(),
      medications: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

router.get('/coverage', async (req, res) => {
  const asha = await AshaWorker.findById(req.user!.id);
  if (!asha) {
    res.status(404).json({ error: 'ASHA not found' });
    return;
  }
  const registered = await Patient.countDocuments({ village: asha.assignedVillage });
  res.json({
    village: asha.assignedVillage,
    city: asha.assignedCity,
    registered,
    estimatedHouseholds: asha.estimatedHouseholds,
    coveragePct: asha.estimatedHouseholds
      ? Math.round((registered / asha.estimatedHouseholds) * 100)
      : 0,
  });
});

router.get('/patients', async (req, res) => {
  const asha = await AshaWorker.findById(req.user!.id);
  if (!asha) {
    res.status(404).json({ error: 'ASHA not found' });
    return;
  }
  const patients = await Patient.find({ village: asha.assignedVillage })
    .select('-aadhaarHash -phoneEncrypted')
    .sort({ createdAt: -1 });
  res.json({ patients });
});

router.post('/patients', validateBody(registerSchema), async (req, res) => {
  const body = req.body as z.infer<typeof registerSchema>;
  const asha = await AshaWorker.findById(req.user!.id);
  if (!asha) {
    res.status(404).json({ error: 'ASHA not found' });
    return;
  }

  let aadhaarHash: string;
  try {
    aadhaarHash = hashAadhaar(body.aadhaar);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const existing = await Patient.findOne({ aadhaarHash });
  if (existing) {
    res.status(409).json({ error: 'Resident already registered', uniqueId: existing.uniqueId });
    return;
  }

  const village = body.village?.trim() || asha.assignedVillage;
  const city = body.city.trim();
  const { uniqueId } = await allocateUniqueId(city);
  const qrDataUrl = await generateQrDataUrl(uniqueId);
  const phoneDigits = body.phone.replace(/\D/g, '');
  const geo = resolveRegisteredCoords(village, city);

  const patient = await Patient.create({
    uniqueId,
    name: body.fullName.trim(),
    aadhaarHash,
    aadhaarLast4: aadhaarLast4(body.aadhaar),
    phoneEncrypted: encryptField(phoneDigits),
    phoneLast4: phoneDigits.slice(-4),
    bloodGroup: body.bloodGroup,
    address: body.address,
    village,
    city,
    lat: geo.lat,
    lng: geo.lng,
    registeredBy: asha._id,
    qrDataUrl,
  });

  const baseline = body.baseline ?? {};
  await MedicalHistoryEntry.create({
    patientId: patient._id,
    type: 'baseline',
    payload: {
      bloodGroup: body.bloodGroup,
      conditions: baseline.conditions ?? [],
      medications: baseline.medications ?? [],
      bp:
        baseline.bpSystolic && baseline.bpDiastolic
          ? { systolic: baseline.bpSystolic, diastolic: baseline.bpDiastolic }
          : undefined,
      bloodSugar: baseline.bloodSugar,
      recordedAt: new Date().toISOString(),
    },
    notes: baseline.notes,
    recordedBy: asha._id,
    recordedByRole: 'asha',
  });

  if (baseline.bpSystolic && baseline.bpDiastolic) {
    await MedicalHistoryEntry.create({
      patientId: patient._id,
      type: 'vitals',
      payload: {
        bpSystolic: baseline.bpSystolic,
        bpDiastolic: baseline.bpDiastolic,
        bloodSugar: baseline.bloodSugar,
        date: new Date().toISOString().slice(0, 10),
      },
      recordedBy: asha._id,
      recordedByRole: 'asha',
    });
  }

  if (baseline.medications?.length) {
    await MedicalHistoryEntry.create({
      patientId: patient._id,
      type: 'medication',
      payload: { medications: baseline.medications },
      recordedBy: asha._id,
      recordedByRole: 'asha',
    });
  }

  if (baseline.conditions?.length) {
    await MedicalHistoryEntry.create({
      patientId: patient._id,
      type: 'condition',
      payload: { conditions: baseline.conditions },
      recordedBy: asha._id,
      recordedByRole: 'asha',
    });
  }

  await appendAudit({
    actorId: asha.id,
    actorRole: 'asha',
    action: 'patient.register',
    entityType: 'Patient',
    entityId: patient.id,
    metadata: { uniqueId },
  });

  emitEvent('patient:updated', { patientId: patient.id, uniqueId, reason: 'register' }, [
    `role:asha`,
    `role:hospital`,
  ]);

  res.status(201).json({
    patient: {
      id: patient.id,
      uniqueId: patient.uniqueId,
      name: patient.name,
      aadhaarLast4: patient.aadhaarLast4,
      phoneLast4: patient.phoneLast4,
      bloodGroup: patient.bloodGroup,
      address: patient.address,
      village: patient.village,
      city: patient.city,
      lat: patient.lat,
      lng: patient.lng,
      qrDataUrl: patient.qrDataUrl,
    },
  });
});

const historySchema = z.object({
  type: z.enum(['vitals', 'condition', 'medication', 'visit', 'baseline']),
  payload: z.record(z.unknown()),
  notes: z.string().optional(),
});

router.post('/patients/:id/history', validateBody(historySchema), async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }
  const asha = await AshaWorker.findById(req.user!.id);
  if (!asha || patient.village !== asha.assignedVillage) {
    res.status(403).json({ error: 'Not your assigned village' });
    return;
  }

  const body = req.body as z.infer<typeof historySchema>;
  const entry = await MedicalHistoryEntry.create({
    patientId: patient._id,
    type: body.type,
    payload: body.payload,
    notes: body.notes,
    recordedBy: asha._id,
    recordedByRole: 'asha',
  });

  await appendAudit({
    actorId: asha.id,
    actorRole: 'asha',
    action: 'history.update',
    entityType: 'MedicalHistoryEntry',
    entityId: entry.id,
    metadata: { patientId: patient.id, type: body.type },
  });

  res.status(201).json({ entry });
});

router.get('/patients/:id', async (req, res) => {
  const patient = await Patient.findById(req.params.id).select('-aadhaarHash -phoneEncrypted');
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }
  const history = await MedicalHistoryEntry.find({ patientId: patient._id }).sort({ createdAt: -1 });
  res.json({ patient, history });
});

export default router;
