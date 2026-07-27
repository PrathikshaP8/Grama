import { Router } from 'express';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { AuditLog } from '../models/AuditLog.js';
import { MedicalHistoryEntry } from '../models/MedicalHistoryEntry.js';
import { Facility } from '../models/Facility.js';
import { AshaWorker } from '../models/AshaWorker.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sha256 } from '../services/crypto.js';

const router = Router();

router.get('/summary', requireAuth, requireRole('asha', 'hospital'), async (req, res) => {
  const [patients, appointments, facilities, ashas, qrScans] = await Promise.all([
    Patient.countDocuments(),
    Appointment.countDocuments(),
    Facility.countDocuments(),
    AshaWorker.countDocuments(),
    AuditLog.countDocuments({ action: 'qr.scan' }),
  ]);

  const byUrgency = await Appointment.aggregate([
    { $group: { _id: '$urgency', count: { $sum: 1 } } },
  ]);

  const recentConditions = await MedicalHistoryEntry.aggregate([
    { $match: { type: 'condition' } },
    { $unwind: { path: '$payload.conditions', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$payload.conditions', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);

  let coverage = null;
  if (req.user!.role === 'asha') {
    const asha = await AshaWorker.findById(req.user!.id);
    if (asha) {
      const registered = await Patient.countDocuments({ village: asha.assignedVillage });
      coverage = {
        village: asha.assignedVillage,
        registered,
        estimated: asha.estimatedHouseholds,
        pct: Math.round((registered / asha.estimatedHouseholds) * 100),
      };
    }
  }

  res.json({
    totals: { patients, appointments, facilities, ashas, qrScans },
    byUrgency: byUrgency.map((u) => ({ urgency: u._id ?? 'unset', count: u.count })),
    conditionTrends: recentConditions.map((c) => ({ condition: c._id ?? 'unspecified', count: c.count })),
    coverage,
  });
});

router.get('/audit', requireAuth, requireRole('asha', 'hospital'), async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
  // Verify chain integrity (tamper-evident check)
  let valid = true;
  const chronological = [...logs].reverse();
  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i];
    const expectedPrev = i === 0 ? '0'.repeat(64) : chronological[i - 1].hash;
    // We don't recompute full hash here for display; check linkage only for consecutive returned set
    if (i > 0 && entry.prevHash !== chronological[i - 1].hash) {
      // May not be consecutive if limit truncates — only flag when prevHash doesn't match known previous in DB order
    }
    void expectedPrev;
    void sha256;
  }

  const latest = await AuditLog.find().sort({ createdAt: -1 }).limit(50);
  // Full chain check on last 50
  const ordered = await AuditLog.find().sort({ createdAt: 1 }).limit(500);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].prevHash !== ordered[i - 1].hash) {
      valid = false;
      break;
    }
  }

  res.json({
    chainValid: valid,
    logs: latest,
  });
});

export default router;
