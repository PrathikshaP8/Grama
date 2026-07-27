import { env } from '../config/env.js';
import { Otp } from '../models/Otp.js';
import { hashOtp } from './crypto.js';

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}

/** Demo SMS — logs OTP; real Twilio can implement SmsProvider later. */
class DemoSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    console.log(`[otp:demo] to=${phone} code=${code}`);
  }
}

const sms: SmsProvider = new DemoSmsProvider();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function issueOtp(
  target: string,
  purpose: string,
  meta?: Record<string, unknown>
): Promise<{ demoOtp?: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + env.otpTtlSeconds * 1000);
  await Otp.create({
    target,
    purpose,
    codeHash: hashOtp(code),
    expiresAt,
    used: false,
    attempts: 0,
    meta,
  });
  await sms.sendOtp(target, code);
  return env.isDev ? { demoOtp: code } : {};
}

export async function verifyOtp(
  target: string,
  purpose: string,
  code: string
): Promise<{ ok: boolean; meta?: Record<string, unknown>; reason?: string }> {
  const record = await Otp.findOne({ target, purpose, used: false }).sort({ createdAt: -1 });
  if (!record) return { ok: false, reason: 'No OTP found' };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'OTP expired' };
  if (record.attempts >= 5) return { ok: false, reason: 'Too many attempts' };

  record.attempts += 1;
  if (record.codeHash !== hashOtp(code)) {
    await record.save();
    return { ok: false, reason: 'Invalid OTP' };
  }
  record.used = true;
  await record.save();
  return { ok: true, meta: record.meta as Record<string, unknown> | undefined };
}
