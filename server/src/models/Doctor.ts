import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDoctor extends Document {
  facilityId: Types.ObjectId;
  name: string;
  specialty: string;
  position: string;
  active: boolean;
}

const doctorSchema = new Schema<IDoctor>(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    position: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Doctor = mongoose.model<IDoctor>('Doctor', doctorSchema);
