import { env } from '../config/env.js';
import { sha256 } from './crypto.js';

/** Demo/hackathon Aadhaar simulation — not UIDAI integration. */
export function normalizeAadhaar(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function hashAadhaar(aadhaar: string): string {
  const normalized = normalizeAadhaar(aadhaar);
  if (normalized.length !== 12) throw new Error('Aadhaar must be 12 digits');
  return sha256(`${env.aadhaarPepper}:${normalized}`);
}

export function aadhaarLast4(aadhaar: string): string {
  const normalized = normalizeAadhaar(aadhaar);
  return normalized.slice(-4);
}
