import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { Facility, IFacility } from '../models/Facility.js';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RecommendInput {
  lat: number;
  lng: number;
  specialty?: string;
  type?: 'government' | 'private';
  scheme?: string;
}

export interface RankedFacility {
  facility: IFacility;
  distanceKm: number;
  score: number;
  reasons: string[];
  specialtyAvailable: boolean;
  doctors: Array<{ name: string; specialty: string; status: string }>;
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
    const doctorRows = [];
    let specialtyAvailable = !input.specialty;

    for (const d of doctors) {
      const avail = await DoctorAvailability.findOne({ doctorId: d._id, date });
      const status = avail?.status ?? 'available';
      doctorRows.push({ name: d.name, specialty: d.specialty, status });
      if (
        input.specialty &&
        d.specialty.toLowerCase().includes(input.specialty.toLowerCase()) &&
        status === 'available'
      ) {
        specialtyAvailable = true;
      }
    }

    if (input.specialty && !specialtyAvailable) {
      // Still include but score poorly — recommendation engine prefers available specialty
    }

    const reasons: string[] = [];
    let score = 0;

    if (specialtyAvailable && input.specialty) {
      score += 40;
      reasons.push(`Has available ${input.specialty} today`);
    } else if (input.specialty) {
      score -= 20;
      reasons.push(`No available ${input.specialty} today`);
    }

    score += facility.rating * 8;
    reasons.push(`Rating ${facility.rating.toFixed(1)}/5`);

    const distScore = Math.max(0, 30 - distanceKm * 2);
    score += distScore;
    reasons.push(`${distanceKm.toFixed(1)} km away`);

    if (facility.type === 'government') {
      score += 5;
      reasons.push('Government facility');
    }
    if (input.scheme && facility.schemes.includes(input.scheme)) {
      score += 10;
      reasons.push(`Accepts ${input.scheme}`);
    }

    ranked.push({
      facility,
      distanceKm,
      score,
      reasons,
      specialtyAvailable: Boolean(input.specialty ? specialtyAvailable : true),
      doctors: doctorRows,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
