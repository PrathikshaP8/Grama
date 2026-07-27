import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IHospitalMember extends Document {
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  facilityId: Types.ObjectId;
  active: boolean;
}

const hospitalMemberSchema = new Schema<IHospitalMember>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const HospitalMember = mongoose.model<IHospitalMember>('HospitalMember', hospitalMemberSchema);
