import mongoose, { Schema, Document, Types } from 'mongoose';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type UrgencyBand = 'routine' | 'soon' | 'urgent' | 'emergency';

export interface IAppointment extends Document {
  patientId: Types.ObjectId;
  facilityId: Types.ObjectId;
  doctorId?: Types.ObjectId;
  specialty?: string;
  status: AppointmentStatus;
  urgency?: UrgencyBand;
  symptoms?: string;
  reason?: string;
  confirmedByPatient: boolean;
  bookedVia: 'voice' | 'manual';
}

const appointmentSchema = new Schema<IAppointment>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    specialty: { type: String },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed'],
      default: 'pending',
    },
    urgency: { type: String, enum: ['routine', 'soon', 'urgent', 'emergency'] },
    symptoms: { type: String },
    reason: { type: String },
    confirmedByPatient: { type: Boolean, default: false },
    bookedVia: { type: String, enum: ['voice', 'manual'], default: 'manual' },
  },
  { timestamps: true }
);

export const Appointment = mongoose.model<IAppointment>('Appointment', appointmentSchema);
