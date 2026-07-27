import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/gramcare'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production!!'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production!'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  aadhaarPepper: required('AADHAAR_PEPPER', 'dev-aadhaar-pepper-change-me!!!!!!!!'),
  fieldEncryptionKey: required(
    'FIELD_ENCRYPTION_KEY',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  ),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
  isDev: (process.env.NODE_ENV ?? 'development') !== 'production',
};
