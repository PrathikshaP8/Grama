import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AshaWorker } from '../models/AshaWorker.js';
import { HospitalMember } from '../models/HospitalMember.js';
import { Patient } from '../models/Patient.js';
import { hashAadhaar } from '../services/aadhaar.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { appendAudit } from '../services/audit.js';
import { decryptField } from '../services/crypto.js';
import { env } from '../config/env.js';
import {
  requireAuth,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  AuthUser,
  RefreshPayload,
} from '../middleware/auth.js';
import { loginLimiter, otpLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['asha', 'hospital']),
});

const staffOtpSchema = z.object({
  email: z.string().email(),
  role: z.enum(['asha', 'hospital']),
  otp: z.string().length(6),
});

const patientLoginSchema = z.object({
  name: z.string().min(2),
  aadhaar: z.string().min(12).max(14),
});

const patientOtpSchema = z.object({
  name: z.string().min(2),
  aadhaar: z.string().min(12).max(14),
  otp: z.string().length(6),
});

router.post('/staff/login', loginLimiter, validateBody(staffLoginSchema), async (req, res) => {
  const { email, password, role } = req.body as z.infer<typeof staffLoginSchema>;
  const account =
    role === 'asha'
      ? await AshaWorker.findOne({ email: email.toLowerCase() })
      : await HospitalMember.findOne({ email: email.toLowerCase() });

  if (!account || !(account as { active?: boolean }).active) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const ok = await bcrypt.compare(password, account.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const demo = await issueOtp(email.toLowerCase(), `staff-login:${role}`, {
    userId: account.id,
    role,
  });

  res.json({
    message: 'OTP sent to registered phone',
    requiresOtp: true,
    ...demo,
  });
});

router.post('/staff/verify-otp', otpLimiter, validateBody(staffOtpSchema), async (req, res) => {
  const { email, role, otp } = req.body as z.infer<typeof staffOtpSchema>;
  const result = await verifyOtp(email.toLowerCase(), `staff-login:${role}`, otp);
  if (!result.ok) {
    res.status(401).json({ error: result.reason ?? 'OTP failed' });
    return;
  }

  const account =
    role === 'asha'
      ? await AshaWorker.findOne({ email: email.toLowerCase() })
      : await HospitalMember.findOne({ email: email.toLowerCase() });

  if (!account) {
    res.status(401).json({ error: 'Account not found' });
    return;
  }

  const user: AuthUser = {
    id: account.id,
    role,
    email: account.email,
    name: account.name,
    facilityId: role === 'hospital' ? (account as InstanceType<typeof HospitalMember>).facilityId.toString() : undefined,
    village: role === 'asha' ? (account as InstanceType<typeof AshaWorker>).assignedVillage : undefined,
  };

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  setRefreshCookie(res, refreshToken);

  await appendAudit({
    actorId: account.id,
    actorRole: role,
    action: 'login',
    entityType: role === 'asha' ? 'AshaWorker' : 'HospitalMember',
    entityId: account.id,
  });

  res.json({ accessToken, user });
});

router.post('/patient/login', loginLimiter, validateBody(patientLoginSchema), async (req, res) => {
  const { name, aadhaar } = req.body as z.infer<typeof patientLoginSchema>;
  let aadhaarHash: string;
  try {
    aadhaarHash = hashAadhaar(aadhaar);
  } catch {
    res.status(400).json({ error: 'Invalid Aadhaar format' });
    return;
  }

  const patient = await Patient.findOne({
    aadhaarHash,
    name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });

  if (!patient) {
    res.status(401).json({ error: 'No matching resident record. Ask your ASHA worker to register you.' });
    return;
  }

  let phone: string;
  try {
    phone = decryptField(patient.phoneEncrypted);
  } catch {
    res.status(500).json({ error: 'Unable to resolve contact phone' });
    return;
  }

  const demo = await issueOtp(phone, 'patient-login', { patientId: patient.id });

  res.json({
    message: 'OTP sent to Aadhaar-linked phone',
    phoneHint: `******${patient.phoneLast4}`,
    requiresOtp: true,
    ...demo,
  });
});

router.post('/patient/verify-otp', otpLimiter, validateBody(patientOtpSchema), async (req, res) => {
  const { name, aadhaar, otp } = req.body as z.infer<typeof patientOtpSchema>;
  let aadhaarHash: string;
  try {
    aadhaarHash = hashAadhaar(aadhaar);
  } catch {
    res.status(400).json({ error: 'Invalid Aadhaar format' });
    return;
  }

  const patient = await Patient.findOne({
    aadhaarHash,
    name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (!patient) {
    res.status(401).json({ error: 'No matching resident' });
    return;
  }

  let phone: string;
  try {
    phone = decryptField(patient.phoneEncrypted);
  } catch {
    res.status(500).json({ error: 'Unable to resolve contact phone' });
    return;
  }

  const result = await verifyOtp(phone, 'patient-login', otp);
  if (!result.ok) {
    res.status(401).json({ error: result.reason ?? 'OTP failed' });
    return;
  }

  const user: AuthUser = {
    id: patient.id,
    role: 'patient',
    name: patient.name,
    village: patient.village,
  };

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  setRefreshCookie(res, refreshToken);

  await appendAudit({
    actorId: patient.id,
    actorRole: 'patient',
    action: 'login',
    entityType: 'Patient',
    entityId: patient.id,
  });

  res.json({
    accessToken,
    user: {
      ...user,
      uniqueId: patient.uniqueId,
      aadhaarLast4: patient.aadhaarLast4,
    },
  });
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refreshToken as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.jwtRefreshSecret) as RefreshPayload;
    if (payload.typ !== 'refresh') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const user: AuthUser = { id: payload.sub, role: payload.role };
    const accessToken = signAccessToken(user);
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
