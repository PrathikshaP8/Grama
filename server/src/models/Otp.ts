import mongoose, { Schema, Document } from 'mongoose';

export interface IOtp extends Document {
  target: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  used: boolean;
  attempts: number;
  meta?: Record<string, unknown>;
}

const otpSchema = new Schema<IOtp>(
  {
    target: { type: String, required: true, index: true },
    purpose: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = mongoose.model<IOtp>('Otp', otpSchema);
