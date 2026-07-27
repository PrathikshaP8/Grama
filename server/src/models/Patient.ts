import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPatient extends Document {
  uniqueId: string;
  name: string;
  aadhaarHash: string;
  aadhaarLast4: string;
  phoneEncrypted: string;
  phoneLast4: string;
  bloodGroup: string;
  address: string;
  village: string;
  city: string;
  /** Permanent registered coordinates from ASHA registration — not overwritten by temporary overrides. */
  lat?: number;
  lng?: number;
  registeredBy: Types.ObjectId;
  qrDataUrl?: string;
}

const patientSchema = new Schema<IPatient>(
  {
    uniqueId: { type: String, required: true, unique: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true },
    aadhaarHash: { type: String, required: true, unique: true, index: true },
    aadhaarLast4: { type: String, required: true, length: 4 },
    phoneEncrypted: { type: String, required: true },
    phoneLast4: { type: String, required: true },
    bloodGroup: { type: String, required: true },
    address: { type: String, required: true },
    village: { type: String, required: true, index: true },
    city: { type: String, required: true },
    lat: { type: Number },
    lng: { type: Number },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'AshaWorker', required: true },
    qrDataUrl: { type: String },
  },
  { timestamps: true }
);

patientSchema.index({ name: 1, aadhaarHash: 1 });

export const Patient = mongoose.model<IPatient>('Patient', patientSchema);
