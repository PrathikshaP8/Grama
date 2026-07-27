import mongoose, { Schema, Document } from 'mongoose';

export interface ILocationCode extends Document {
  cityName: string;
  code: string;
  nextSequence: number;
}

const locationCodeSchema = new Schema<ILocationCode>(
  {
    cityName: { type: String, required: true, unique: true, lowercase: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, minlength: 3, maxlength: 3 },
    nextSequence: { type: Number, required: true, default: 1 },
  },
  { timestamps: true }
);

export const LocationCode = mongoose.model<ILocationCode>('LocationCode', locationCodeSchema);
