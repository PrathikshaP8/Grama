import { Router } from 'express';
import { z } from 'zod';
import { Facility } from '../models/Facility.js';
import { Doctor } from '../models/Doctor.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { AppointmentSlot } from '../models/AppointmentSlot.js';
import { Patient } from '../models/Patient.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { rankFacilities } from '../services/recommend.js';
import { haversineKm, resolveRegisteredCoords, todayIso } from '../services/geo.js';

const router = Router();

async function resolveSearchOrigin(
  req: { user?: { id: string; role: string } },
  opts: { useCurrentLocation?: boolean; lat?: number; lng?: number }
): Promise<{ lat: number; lng: number; label: string; mode: 'registered' | 'override' | 'fallback' }> {
  if (opts.useCurrentLocation && typeof opts.lat === 'number' && typeof opts.lng === 'number') {
    return {
      lat: opts.lat,
      lng: opts.lng,
      label: 'temporary current location',
      mode: 'override',
    };
  }

  if (req.user?.role === 'patient') {
    const patient = await Patient.findById(req.user.id);
    if (patient) {
      if (typeof patient.lat === 'number' && typeof patient.lng === 'number') {
        return {
          lat: patient.lat,
          lng: patient.lng,
          label: `${patient.village}, ${patient.city} (ASHA-registered)`,
          mode: 'registered',
        };
      }
      const geo = resolveRegisteredCoords(patient.village, patient.city);
      return {
        lat: geo.lat,
        lng: geo.lng,
        label: `${patient.village}, ${patient.city} (ASHA-registered)`,
        mode: 'registered',
      };
    }
  }

  if (typeof opts.lat === 'number' && typeof opts.lng === 'number') {
    return { lat: opts.lat, lng: opts.lng, label: 'provided coordinates', mode: 'override' };
  }

  const geo = resolveRegisteredCoords('Belman', 'Mangalore');
  return { lat: geo.lat, lng: geo.lng, label: 'default Belman', mode: 'fallback' };
}

router.get('/', requireAuth, async (req, res) => {
  const type = req.query.type as 'government' | 'private' | undefined;
  const useCurrent = req.query.useCurrentLocation === '1' || req.query.useCurrentLocation === 'true';
  const origin = await resolveSearchOrigin(req, {
    useCurrentLocation: useCurrent,
    lat: req.query.lat ? Number(req.query.lat) : undefined,
    lng: req.query.lng ? Number(req.query.lng) : undefined,
  });

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
          const openSlots = await AppointmentSlot.find({ doctorId: d._id, date, status: 'open' }).sort({
            time: 1,
          });
          return {
            id: d.id,
            name: d.name,
            specialty: d.specialty,
            position: d.position,
            status: avail?.status ?? 'available',
            openSlots: openSlots.map((s) => ({ id: s.id, time: s.time, date: s.date })),
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
        distanceKm: haversineKm(origin.lat, origin.lng, f.lat, f.lng),
        doctors: availability,
      };
    })
  );

  result.sort((a, b) => a.distanceKm - b.distanceKm);
  res.json({
    facilities: result,
    searchOrigin: origin,
  });
});

const recommendSchema = z.object({
  specialty: z.string().optional(),
  type: z.enum(['government', 'private']).optional(),
  scheme: z.string().optional(),
  /** Temporary override only — does not overwrite ASHA-registered address. */
  useCurrentLocation: z.boolean().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

router.post('/recommend', requireAuth, validateBody(recommendSchema), async (req, res) => {
  const body = req.body as z.infer<typeof recommendSchema>;
  const origin = await resolveSearchOrigin(req, {
    useCurrentLocation: body.useCurrentLocation,
    lat: body.lat,
    lng: body.lng,
  });

  const ranked = await rankFacilities({
    lat: origin.lat,
    lng: origin.lng,
    specialty: body.specialty,
    type: body.type,
    scheme: body.scheme,
    locationLabel: origin.label,
  });

  const top = ranked[0];
  const alternative = ranked[1];

  const serialize = (r: (typeof ranked)[0] | undefined) =>
    r
      ? {
          facility: {
            id: r.facility.id,
            name: r.facility.name,
            type: r.facility.type,
            address: r.facility.address,
            rating: r.facility.rating,
            schemes: r.facility.schemes,
          },
          distanceKm: r.distanceKm,
          score: r.score,
          reasons: r.reasons,
          specialtyAvailable: r.specialtyAvailable,
          matchingDoctors: r.matchingDoctors,
          doctors: r.doctors,
          why: r.reasons.slice(0, 3).join('; '),
        }
      : null;

  res.json({
    searchOrigin: origin,
    recommendation: serialize(top),
    alternative: serialize(alternative),
    all: ranked.slice(0, 8).map((r) => ({
      id: r.facility.id,
      name: r.facility.name,
      score: r.score,
      distanceKm: r.distanceKm,
      specialtyAvailable: r.specialtyAvailable,
      matchingDoctors: r.matchingDoctors.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        openSlotCount: d.openSlots.length,
      })),
    })),
  });
});

export default router;
