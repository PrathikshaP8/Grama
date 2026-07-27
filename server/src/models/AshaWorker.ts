import mongoose, { Schema, Document } from 'mongoose';

export interface IAshaWorker extends Document {
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  assignedVillage: string;
  assignedCity: string;
  estimatedHouseholds: number;
  active: boolean;
}

const ashaWorkerSchema = new Schema<IAshaWorker>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    assignedVillage: { type: String, required: true, index: true },
    assignedCity: { type: String, required: true },
    estimatedHouseholds: { type: Number, required: true, default: 180 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const AshaWorker = mongoose.model<IAshaWorker>('AshaWorker', ashaWorkerSchema);
