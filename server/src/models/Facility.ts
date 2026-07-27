import mongoose, { Schema, Document } from 'mongoose';

export type FacilityType = 'government' | 'private';

export interface IFacility extends Document {
  name: string;
  type: FacilityType;
  address: string;
  city: string;
  village?: string;
  lat: number;
  lng: number;
  rating: number;
  schemes: string[];
  phone?: string;
}

const facilitySchema = new Schema<IFacility>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['government', 'private'], required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    village: { type: String },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    rating: { type: Number, default: 4.0, min: 0, max: 5 },
    schemes: [{ type: String }],
    phone: { type: String },
  },
  { timestamps: true }
);

export const Facility = mongoose.model<IFacility>('Facility', facilitySchema);
