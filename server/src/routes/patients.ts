import { Router } from 'express';
import { Patient } from '../models/Patient.js';
import { MedicalHistoryEntry } from '../models/MedicalHistoryEntry.js';
import { Appointment } from '../models/Appointment.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { appendAudit } from '../services/audit.js';

const router = Router();

/** Resolve patient by unique ID (QR payload). Authorized roles only. */
router.get('/by-id/:uniqueId', requireAuth, requireRole('asha', 'hospital', 'patient'), async (req, res) => {
  const uniqueId = req.params.uniqueId.toUpperCase();
  const patient = await Patient.findOne({ uniqueId }).select('-aadhaarHash -phoneEncrypted');
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return;
  }

  if (req.user!.role === 'patient' && req.user!.id !== patient.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const history = await MedicalHistoryEntry.find({ patientId: patient._id }).sort({ createdAt: -1 }).limit(50);

  await appendAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'qr.scan',
    entityType: 'Patient',
    entityId: patient.id,
    metadata: { uniqueId },
  });

  // Summarize current meds/conditions from latest entries
  const meds = history.filter((h) => h.type === 'medication').flatMap((h) => (h.payload.medications as string[]) ?? []);
  const conditions = history
    .filter((h) => h.type === 'condition')
    .flatMap((h) => (h.payload.conditions as string[]) ?? []);
  const vitals = history.filter((h) => h.type === 'vitals').slice(0, 5);

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

router.get('/me', requireAuth, requireRole('patient'), async (req, res) => {
  const patient = await Patient.findById(req.user!.id).select('-aadhaarHash -phoneEncrypted');
  if (!patient) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const history = await MedicalHistoryEntry.find({ patientId: patient._id }).sort({ createdAt: -1 });
  const appointments = await Appointment.find({ patientId: patient._id })
    .populate('facilityId', 'name type')
    .populate('doctorId', 'name specialty')
    .sort({ createdAt: -1 })
    .limit(20);
  res.json({
    patient,
    history,
    appointments,
    registeredLocation: {
      village: patient.village,
      city: patient.city,
      address: patient.address,
      lat: patient.lat,
      lng: patient.lng,
    },
  });
});

export default router;
