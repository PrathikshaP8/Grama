import { Router } from 'express';
import { z } from 'zod';
import { Appointment } from '../models/Appointment.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { appendAudit } from '../services/audit.js';

const router = Router();

const createSchema = z.object({
  facilityId: z.string(),
  doctorId: z.string().optional(),
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

  const appt = await Appointment.create({
    patientId: req.user!.id,
    facilityId: body.facilityId,
    doctorId: body.doctorId,
    specialty: body.specialty,
    urgency: body.urgency,
    symptoms: body.symptoms,
    reason: body.reason,
    confirmedByPatient: true,
    status: 'confirmed',
    bookedVia: body.bookedVia,
  });

  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'patient',
    action: 'appointment.book',
    entityType: 'Appointment',
    entityId: appt.id,
    metadata: { facilityId: body.facilityId, via: body.bookedVia },
  });

  res.status(201).json({ appointment: appt });
});

router.get('/mine', requireAuth, requireRole('patient'), async (req, res) => {
  const appointments = await Appointment.find({ patientId: req.user!.id }).sort({ createdAt: -1 });
  res.json({ appointments });
});

router.post('/:id/cancel', requireAuth, requireRole('patient'), async (req, res) => {
  const appt = await Appointment.findOne({ _id: req.params.id, patientId: req.user!.id });
  if (!appt) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  appt.status = 'cancelled';
  await appt.save();
  await appendAudit({
    actorId: req.user!.id,
    actorRole: 'patient',
    action: 'appointment.cancel',
    entityType: 'Appointment',
    entityId: appt.id,
  });
  res.json({ appointment: appt });
});

export default router;
