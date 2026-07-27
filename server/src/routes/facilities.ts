import { Router } from 'express';
import { z } from 'zod';
import { Facility } from '../models/Facility.js';
import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { rankFacilities } from '../services/recommend.js';

const router = Router();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get('/', requireAuth, async (req, res) => {
  const type = req.query.type as 'government' | 'private' | undefined;
  const lat = req.query.lat ? Number(req.query.lat) : 12.9141;
  const lng = req.query.lng ? Number(req.query.lng) : 74.856;
  const filter: Record<string, unknown> = {};
  if (type === 'government' || type === 'private') filter.type = type;

  const facilities = await Facility.find(filter);
  const date = todayIso();
  const result = await Promise.all(
    facilities.map(async (f) => {
      const doctors = await Doctor.find({ facilityId: f._id, active: true });
      const availability = await Promise.all(
        doctors.map(async (d) => {
          const avail = await DoctorAvailability.findOne({ doctorId: d._id, date });
          return {
            id: d.id,
            name: d.name,
            specialty: d.specialty,
            position: d.position,
            status: avail?.status ?? 'available',
          };
        })
      );
      return {
        id: f.id,
        name: f.name,
        type: f.type,
        address: f.address,
        city: f.city,
        rating: f.rating,
        schemes: f.schemes,
        lat: f.lat,
        lng: f.lng,
        distanceKm: haversineKm(lat, lng, f.lat, f.lng),
        doctors: availability,
      };
    })
  );

  result.sort((a, b) => a.distanceKm - b.distanceKm);
  res.json({ facilities: result });
});

const recommendSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  specialty: z.string().optional(),
  type: z.enum(['government', 'private']).optional(),
  scheme: z.string().optional(),
});

router.post('/recommend', requireAuth, validateBody(recommendSchema), async (req, res) => {
  const body = req.body as z.infer<typeof recommendSchema>;
  const ranked = await rankFacilities(body);
  const top = ranked[0];
  const alternative = ranked[1];

  res.json({
    recommendation: top
      ? {
          facility: {
            id: top.facility.id,
            name: top.facility.name,
            type: top.facility.type,
            address: top.facility.address,
            rating: top.facility.rating,
            schemes: top.facility.schemes,
          },
          distanceKm: top.distanceKm,
          score: top.score,
          reasons: top.reasons,
          specialtyAvailable: top.specialtyAvailable,
          doctors: top.doctors,
          why: top.reasons.slice(0, 3).join('; '),
        }
      : null,
    alternative: alternative
      ? {
          facility: {
            id: alternative.facility.id,
            name: alternative.facility.name,
            type: alternative.facility.type,
            address: alternative.facility.address,
            rating: alternative.facility.rating,
          },
          distanceKm: alternative.distanceKm,
          score: alternative.score,
          reasons: alternative.reasons,
          why: alternative.reasons.slice(0, 2).join('; '),
        }
      : null,
    all: ranked.slice(0, 8).map((r) => ({
      id: r.facility.id,
      name: r.facility.name,
      score: r.score,
      distanceKm: r.distanceKm,
      specialtyAvailable: r.specialtyAvailable,
    })),
  });
});

export default router;
