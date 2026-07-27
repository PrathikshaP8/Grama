import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { AppointmentSlot } from '../models/AppointmentSlot.js';
import { Facility, IFacility } from '../models/Facility.js';
import { haversineKm, todayIso } from './geo.js';

export interface RecommendInput {
  lat: number;
  lng: number;
  specialty?: string;
  type?: 'government' | 'private';
  scheme?: string;
  locationLabel?: string;
}

export interface RankedFacility {
  facility: IFacility;
  distanceKm: number;
  score: number;
  reasons: string[];
  specialtyAvailable: boolean;
  matchingDoctors: Array<{
    id: string;
    name: string;
    specialty: string;
    status: string;
    openSlots: Array<{ id: string; time: string; date: string }>;
  }>;
  doctors: Array<{ id: string; name: string; specialty: string; status: string }>;
}

export async function rankFacilities(input: RecommendInput): Promise<RankedFacility[]> {
  const filter: Record<string, unknown> = {};
  if (input.type) filter.type = input.type;
  if (input.scheme) filter.schemes = input.scheme;

  const facilities = await Facility.find(filter);
  const date = todayIso();
  const ranked: RankedFacility[] = [];

  for (const facility of facilities) {
    const distanceKm = haversineKm(input.lat, input.lng, facility.lat, facility.lng);
    const doctors = await Doctor.find({ facilityId: facility._id, active: true });
    const doctorRows: RankedFacility['doctors'] = [];
    const matchingDoctors: RankedFacility['matchingDoctors'] = [];
    let specialtyAvailable = !input.specialty;

    for (const d of doctors) {
      const avail = await DoctorAvailability.findOne({ doctorId: d._id, date });
      const status = avail?.status ?? 'available';
      doctorRows.push({ id: d.id, name: d.name, specialty: d.specialty, status });

      const matchesSpecialty =
        !input.specialty || d.specialty.toLowerCase().includes(input.specialty.toLowerCase());

      if (matchesSpecialty) {
        const openSlots = await AppointmentSlot.find({
          doctorId: d._id,
          date,
          status: 'open',
        })
          .sort({ time: 1 })
          .limit(12);

        matchingDoctors.push({
          id: d.id,
          name: d.name,
          specialty: d.specialty,
          status,
          openSlots: openSlots.map((s) => ({ id: s.id, time: s.time, date: s.date })),
        });

        if (input.specialty && status === 'available') {
          specialtyAvailable = true;
        }
      }
    }

    const reasons: string[] = [];
    let score = 0;

    if (specialtyAvailable && input.specialty) {
      score += 50;
      reasons.push(`Suitable doctor currently available`);
    } else if (input.specialty) {
      score -= 40;
      reasons.push(`No available ${input.specialty} today`);
    }

    score += facility.rating * 8;
    reasons.push(`Rating ${facility.rating.toFixed(1)}/5`);

    const distScore = Math.max(0, 30 - distanceKm * 2);
    score += distScore;
    reasons.push(`${distanceKm.toFixed(1)} km from registered location`);

    if (facility.type === 'government') {
      score += 5;
      reasons.push('Government facility');
    }
    if (input.scheme && facility.schemes.includes(input.scheme)) {
      score += 10;
      reasons.push(`Accepts ${input.scheme}`);
    }

    // Prefer closer available over farther available
    if (specialtyAvailable) {
      score += Math.max(0, 15 - distanceKm);
    }

    ranked.push({
      facility,
      distanceKm,
      score,
      reasons,
      specialtyAvailable: Boolean(input.specialty ? specialtyAvailable : true),
      matchingDoctors,
      doctors: doctorRows,
    });
  }

  ranked.sort((a, b) => {
    // Available specialty first, then score
    if (a.specialtyAvailable !== b.specialtyAvailable) {
      return a.specialtyAvailable ? -1 : 1;
    }
    return b.score - a.score;
  });
  return ranked;
}
