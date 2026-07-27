import mongoose, { Schema, Document, Types } from 'mongoose';

export type HistoryEntryType =
  | 'vitals'
  | 'condition'
  | 'medication'
  | 'blood_group'
  | 'visit'
  | 'baseline';

export interface IMedicalHistoryEntry extends Document {
  patientId: Types.ObjectId;
  type: HistoryEntryType;
  payload: Record<string, unknown>;
  notes?: string;
  recordedBy: Types.ObjectId;
  recordedByRole: 'asha' | 'hospital' | 'patient' | 'system';
}

const medicalHistorySchema = new Schema<IMedicalHistoryEntry>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    type: {
      type: String,
      enum: ['vitals', 'condition', 'medication', 'blood_group', 'visit', 'baseline'],
      required: true,
    },
    payload: { type: Schema.Types.Mixed, required: true },
    notes: { type: String },
    recordedBy: { type: Schema.Types.ObjectId, required: true },
    recordedByRole: {
      type: String,
      enum: ['asha', 'hospital', 'patient', 'system'],
      required: true,
    },
  },
  { timestamps: true }
);

export const MedicalHistoryEntry = mongoose.model<IMedicalHistoryEntry>(
  'MedicalHistoryEntry',
  medicalHistorySchema
);
