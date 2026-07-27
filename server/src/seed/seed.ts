import bcrypt from 'bcryptjs';
import { connectDb } from '../config/db.js';
import { LocationCode } from '../models/LocationCode.js';
import { AshaWorker } from '../models/AshaWorker.js';
import { HospitalMember } from '../models/HospitalMember.js';
import { Facility } from '../models/Facility.js';
import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { Patient } from '../models/Patient.js';
import { MedicalHistoryEntry } from '../models/MedicalHistoryEntry.js';
import { hashAadhaar, aadhaarLast4 } from '../services/aadhaar.js';
import { encryptField } from '../services/crypto.js';
import { allocateUniqueId } from '../services/uniqueId.js';
import { generateQrDataUrl } from '../services/qr.js';
import { appendAudit } from '../services/audit.js';

async function seed() {
  await connectDb();
  console.log('[seed] clearing collections…');
  await Promise.all([
    LocationCode.deleteMany({}),
    AshaWorker.deleteMany({}),
    HospitalMember.deleteMany({}),
    Facility.deleteMany({}),
    Doctor.deleteMany({}),
    DoctorAvailability.deleteMany({}),
    Patient.deleteMany({}),
    MedicalHistoryEntry.deleteMany({}),
  ]);

  await LocationCode.insertMany([
    { cityName: 'mangalore', code: 'MNG', nextSequence: 1 },
    { cityName: 'hassan', code: 'HSN', nextSequence: 1 },
    { cityName: 'mysore', code: 'MYS', nextSequence: 1 },
    { cityName: 'udupi', code: 'UDP', nextSequence: 1 },
    { cityName: 'bengaluru', code: 'BLR', nextSequence: 1 },
    { cityName: 'rural', code: 'RUR', nextSequence: 1 },
  ]);

  const passwordHash = await bcrypt.hash('GramCare@2026', 12);

  const asha = await AshaWorker.create({
    email: 'asha@gramcare.in',
    passwordHash,
    name: 'Lakshmi ASHA',
    phone: '9876500001',
    assignedVillage: 'Belman',
    assignedCity: 'Mangalore',
    estimatedHouseholds: 180,
    active: true,
  });

  const facilities = await Facility.insertMany([
    {
      name: 'Belman Primary Health Centre',
      type: 'government',
      address: 'Belman Main Road, Mangalore Taluk',
      city: 'Mangalore',
      village: 'Belman',
      lat: 13.0827,
      lng: 74.9959,
      rating: 4.2,
      schemes: ['Ayushman Bharat', 'Yeshasvini'],
      phone: '0824-2001001',
    },
    {
      name: 'KMC Hospital Attavar',
      type: 'private',
      address: 'Attavar, Mangalore',
      city: 'Mangalore',
      lat: 12.8698,
      lng: 74.843,
      rating: 4.6,
      schemes: ['Ayushman Bharat'],
      phone: '0824-2222200',
    },
    {
      name: 'Wenlock District Hospital',
      type: 'government',
      address: 'Hampankatta, Mangalore',
      city: 'Mangalore',
      lat: 12.8703,
      lng: 74.842,
      rating: 4.0,
      schemes: ['Ayushman Bharat', 'Yeshasvini', 'ESI'],
      phone: '0824-2412100',
    },
    {
      name: 'Father Muller Medical College Hospital',
      type: 'private',
      address: 'Kankanady, Mangalore',
      city: 'Mangalore',
      lat: 12.8795,
      lng: 74.859,
      rating: 4.7,
      schemes: ['Ayushman Bharat'],
      phone: '0824-2238000',
    },
  ]);

  const hospitalUser = await HospitalMember.create({
    email: 'hospital@gramcare.in',
    passwordHash,
    name: 'Reception Desk — PHC Belman',
    phone: '9876500002',
    facilityId: facilities[0]._id,
    active: true,
  });

  const doctorDefs = [
    { facility: facilities[0], name: 'Dr. Priya Shetty', specialty: 'General Physician', position: 'Medical Officer' },
    { facility: facilities[0], name: 'Dr. Anitha Rao', specialty: 'Gynecologist', position: 'Specialist' },
    { facility: facilities[1], name: 'Dr. Rohan Pai', specialty: 'Orthopedic', position: 'Consultant' },
    { facility: facilities[1], name: 'Dr. Meera Kamath', specialty: 'General Physician', position: 'Consultant' },
    { facility: facilities[1], name: 'Dr. Suresh Hegde', specialty: 'Cardiologist', position: 'Senior Consultant' },
    { facility: facilities[2], name: 'Dr. Kavitha Nair', specialty: 'General Physician', position: 'Civil Surgeon' },
    { facility: facilities[2], name: 'Dr. Imran Khan', specialty: 'Emergency Medicine', position: 'ER Physician' },
    { facility: facilities[3], name: 'Dr. Anita D’Souza', specialty: 'Gynecologist', position: 'Professor' },
    { facility: facilities[3], name: 'Dr. Vincent Fernandes', specialty: 'Orthopedic', position: 'HOD' },
  ];

  const doctors = await Doctor.insertMany(
    doctorDefs.map((d) => ({
      facilityId: d.facility._id,
      name: d.name,
      specialty: d.specialty,
      position: d.position,
      active: true,
    }))
  );

  const today = new Date().toISOString().slice(0, 10);
  await DoctorAvailability.insertMany(
    doctors.map((d, i) => ({
      doctorId: d._id,
      facilityId: d.facilityId,
      date: today,
      status: i === 4 ? 'on_leave' : i === 2 ? 'in_procedure' : 'available',
      updatedBy: hospitalUser._id,
    }))
  );

  // Sample residents for demo login
  const samples = [
    {
      name: 'Ramesh Kumar',
      aadhaar: '123456789012',
      phone: '9876511111',
      bloodGroup: 'B+',
      address: 'House 12, Belman',
      meds: ['Amlodipine 5mg'],
      conditions: ['Hypertension'],
      bp: { s: 138, d: 88 },
      sugar: 110,
    },
    {
      name: 'Savitha Bai',
      aadhaar: '234567890123',
      phone: '9876522222',
      bloodGroup: 'O+',
      address: 'Near temple, Belman',
      meds: [],
      conditions: [],
      bp: { s: 118, d: 76 },
      sugar: 95,
    },
  ];

  for (const s of samples) {
    const { uniqueId } = await allocateUniqueId('Mangalore');
    const qrDataUrl = await generateQrDataUrl(uniqueId);
    const patient = await Patient.create({
      uniqueId,
      name: s.name,
      aadhaarHash: hashAadhaar(s.aadhaar),
      aadhaarLast4: aadhaarLast4(s.aadhaar),
      phoneEncrypted: encryptField(s.phone),
      phoneLast4: s.phone.slice(-4),
      bloodGroup: s.bloodGroup,
      address: s.address,
      village: 'Belman',
      city: 'Mangalore',
      registeredBy: asha._id,
      qrDataUrl,
    });
    await MedicalHistoryEntry.create({
      patientId: patient._id,
      type: 'baseline',
      payload: {
        bloodGroup: s.bloodGroup,
        conditions: s.conditions,
        medications: s.meds,
        bp: { systolic: s.bp.s, diastolic: s.bp.d },
        bloodSugar: s.sugar,
      },
      recordedBy: asha._id,
      recordedByRole: 'asha',
    });
    if (s.meds.length) {
      await MedicalHistoryEntry.create({
        patientId: patient._id,
        type: 'medication',
        payload: { medications: s.meds },
        recordedBy: asha._id,
        recordedByRole: 'asha',
      });
    }
    if (s.conditions.length) {
      await MedicalHistoryEntry.create({
        patientId: patient._id,
        type: 'condition',
        payload: { conditions: s.conditions },
        recordedBy: asha._id,
        recordedByRole: 'asha',
      });
    }
    await MedicalHistoryEntry.create({
      patientId: patient._id,
      type: 'vitals',
      payload: {
        bpSystolic: s.bp.s,
        bpDiastolic: s.bp.d,
        bloodSugar: s.sugar,
        date: today,
      },
      recordedBy: asha._id,
      recordedByRole: 'asha',
    });
    await appendAudit({
      actorId: asha.id,
      actorRole: 'asha',
      action: 'patient.register',
      entityType: 'Patient',
      entityId: patient.id,
      metadata: { uniqueId, seed: true },
    });
    console.log(`[seed] patient ${s.name} → ${uniqueId} (Aadhaar demo ${s.aadhaar})`);
  }

  console.log(`
[seed] done.

Staff logins (password: GramCare@2026):
  ASHA:     asha@gramcare.in
  Hospital: hospital@gramcare.in

Patient demo (name + Aadhaar, OTP shown in API response in development):
  Ramesh Kumar / 123456789012
  Savitha Bai  / 234567890123

NOTE: Aadhaar flow is a hackathon simulation (salted hash only). Not UIDAI-integrated.
`);
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
