import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReferral extends Document {
  patientId: Types.ObjectId;
  fromFacilityId?: Types.ObjectId;
  toFacilityId: Types.ObjectId;
  reason: string;
  urgency: string;
  createdBy: Types.ObjectId;
  createdByRole: string;
  status: 'open' | 'accepted' | 'completed' | 'cancelled';
}

const referralSchema = new Schema<IReferral>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    fromFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility' },
    toFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
    reason: { type: String, required: true },
    urgency: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdByRole: { type: String, required: true },
    status: {
      type: String,
      enum: ['open', 'accepted', 'completed', 'cancelled'],
      default: 'open',
    },
  },
  { timestamps: true }
);

export const Referral = mongoose.model<IReferral>('Referral', referralSchema);
