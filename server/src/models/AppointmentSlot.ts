import mongoose, { Schema, Document, Types } from 'mongoose';

export type SlotStatus = 'open' | 'booked' | 'blocked';

export interface IAppointmentSlot extends Document {
  doctorId: Types.ObjectId;
  facilityId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: SlotStatus;
  appointmentId?: Types.ObjectId;
  bookedBy?: Types.ObjectId;
}

const appointmentSlotSchema = new Schema<IAppointmentSlot>(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['open', 'booked', 'blocked'], default: 'open', index: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    bookedBy: { type: Schema.Types.ObjectId, ref: 'Patient' },
  },
  { timestamps: true }
);

appointmentSlotSchema.index({ doctorId: 1, date: 1, time: 1 }, { unique: true });

export const AppointmentSlot = mongoose.model<IAppointmentSlot>('AppointmentSlot', appointmentSlotSchema);
