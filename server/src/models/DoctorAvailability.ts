import mongoose, { Schema, Document, Types } from 'mongoose';

export type AvailabilityStatus = 'available' | 'not_available' | 'on_leave' | 'in_procedure';

export interface IDoctorAvailability extends Document {
  doctorId: Types.ObjectId;
  facilityId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  status: AvailabilityStatus;
  updatedBy?: Types.ObjectId;
}

const doctorAvailabilitySchema = new Schema<IDoctorAvailability>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
    date: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['available', 'not_available', 'on_leave', 'in_procedure'],
      default: 'available',
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'HospitalMember' },
  },
  { timestamps: true }
);

doctorAvailabilitySchema.index({ doctorId: 1, date: 1 }, { unique: true });

export const DoctorAvailability = mongoose.model<IDoctorAvailability>(
  'DoctorAvailability',
  doctorAvailabilitySchema
);
