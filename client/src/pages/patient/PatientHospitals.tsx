import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';
import { ConfirmGate } from '../../components/ConfirmGate';
import { api, ApiError } from '../../services/api';
import { onRealtime, watchSpecialty, unwatchSpecialty } from '../../services/realtime';
import { useRealtime } from '../../realtime/RealtimeProvider';

interface DoctorInfo {
  id: string;
  name: string;
  specialty: string;
  status: string;
  openSlots?: Array<{ id: string; time: string; date: string }>;
}

interface FacilityRow {
  id: string;
  name: string;
  type: string;
  distanceKm: number;
  rating: number;
  doctors: DoctorInfo[];
}

interface RecoResponse {
  searchOrigin: { label: string; mode: string };
  recommendation: {
    facility: { id: string; name: string };
    why: string;
    distanceKm: number;
    specialtyAvailable: boolean;
    matchingDoctors: DoctorInfo[];
  } | null;
  alternative: {
    facility: { id: string; name: string };
    why: string;
    distanceKm: number;
    specialtyAvailable: boolean;
  } | null;
  all: Array<{
    id: string;
    name: string;
    specialtyAvailable: boolean;
    distanceKm: number;
    matchingDoctors: Array<{ id: string; name: string; status: string; openSlotCount: number }>;
  }>;
}

interface AppointmentRow {
  _id: string;
  status: string;
  slotTime?: string;
  slotDate?: string;
  facilityId?: { name?: string } | string;
  doctorId?: { name?: string; specialty?: string } | string;
}

export function PatientHospitals() {
  const { t } = useTranslation();
  const { pushToast } = useRealtime();
  const [type, setType] = useState<'' | 'government' | 'private'>('');
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [originLabel, setOriginLabel] = useState('');
  const [specialty, setSpecialty] = useState('General Physician');
  const [useCurrent, setUseCurrent] = useState(false);
  const [overrideCoords, setOverrideCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reco, setReco] = useState<RecoResponse | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorInfo | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [bookFacilityId, setBookFacilityId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [notifyBanner, setNotifyBanner] = useState<string | null>(null);

  const loadFacilities = useCallback(async () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (useCurrent && overrideCoords) {
      params.set('useCurrentLocation', '1');
      params.set('lat', String(overrideCoords.lat));
      params.set('lng', String(overrideCoords.lng));
    }
    const q = params.toString() ? `?${params}` : '';
    const res = await api<{ facilities: FacilityRow[]; searchOrigin: { label: string } }>(`/facilities${q}`);
    setFacilities(res.facilities);
    setOriginLabel(res.searchOrigin.label);
  }, [type, useCurrent, overrideCoords]);

  const runRecommend = useCallback(async () => {
    const body: Record<string, unknown> = {
      specialty,
      type: type || undefined,
    };
    if (useCurrent && overrideCoords) {
      body.useCurrentLocation = true;
      body.lat = overrideCoords.lat;
      body.lng = overrideCoords.lng;
    }
    const res = await api<RecoResponse>('/facilities/recommend', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setReco(res);
    setOriginLabel(res.searchOrigin.label);
    setNotifyBanner(null);
  }, [specialty, type, useCurrent, overrideCoords]);

  const loadAppointments = useCallback(async () => {
    const res = await api<{ appointments: AppointmentRow[] }>('/appointments/mine');
    setAppointments(res.appointments);
  }, []);

  useEffect(() => {
    void loadFacilities();
    void loadAppointments();
  }, [loadFacilities, loadAppointments]);

  useEffect(() => {
    watchSpecialty(specialty);
    return () => unwatchSpecialty(specialty);
  }, [specialty]);

  useEffect(() => {
    const offAvail = onRealtime('doctor:availability_changed', (payload) => {
      const docSpecialty = String(payload.specialty || '');
      const relevant =
        !specialty || docSpecialty.toLowerCase().includes(specialty.toLowerCase()) || specialty.toLowerCase().includes(docSpecialty.toLowerCase());
      void loadFacilities();
      if (relevant && reco) {
        const name = String(payload.doctorName || 'A doctor');
        const facility = String(payload.facilityName || 'a nearby hospital');
        const status = String(payload.status);
        setNotifyBanner(`Doctor availability updated — ${name} is now ${status.replace('_', ' ')} at ${facility}.`);
        pushToast({
          title: 'Doctor availability updated',
          body: `${name} is now ${status.replace('_', ' ')} at ${facility}.`,
          actionLabel: 'View updated recommendation',
          onAction: () => void runRecommend(),
        });
        void runRecommend();
      }
    });
    const offSlot = onRealtime('slot:updated', () => {
      void loadFacilities();
      if (reco) void runRecommend();
    });
    const offAppt = onRealtime('appointment:updated', () => {
      void loadAppointments();
    });
    const offCreated = onRealtime('appointment:created', () => {
      void loadAppointments();
    });
    return () => {
      offAvail();
      offSlot();
      offAppt();
      offCreated();
    };
  }, [specialty, reco, loadFacilities, loadAppointments, runRecommend, pushToast]);

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOverrideCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUseCurrent(true);
        setMessage('Using temporary current location (registered address unchanged).');
      },
      () => setError('Could not get current location')
    );
  }

  async function recommend(e: FormEvent) {
    e.preventDefault();
    setError('');
    await runRecommend();
  }

  function startBook(facilityId: string, doctor?: DoctorInfo) {
    setBookFacilityId(facilityId);
    setSelectedDoctor(doctor ?? null);
    setSelectedSlotId(doctor?.openSlots?.[0]?.id ?? null);
    setError('');
  }

  async function book() {
    if (!bookFacilityId || !selectedDoctor || !selectedSlotId) {
      setError('Select a doctor and time slot');
      return;
    }
    try {
      await api('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: bookFacilityId,
          doctorId: selectedDoctor.id,
          slotId: selectedSlotId,
          specialty,
          bookedVia: 'manual',
          confirmed: true,
          urgency: 'soon',
        }),
      });
      setMessage('Appointment requested — pending hospital confirmation');
      setBookFacilityId(null);
      setSelectedDoctor(null);
      setSelectedSlotId(null);
      await loadAppointments();
      await runRecommend();
      await loadFacilities();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; code?: string };
        setError(body.error || err.message);
        if (body.code === 'SLOT_TAKEN') {
          await runRecommend();
          await loadFacilities();
        }
      } else {
        setError(t('common.error'));
      }
    }
  }

  const links = [
    { to: '/patient', label: t('nav.home') },
    { to: '/patient/hospitals', label: t('nav.hospitals') },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('facilities.title')}</h1>
      <p className="mt-2 text-sm text-leaf-100/75">
        Searching near: <strong>{originLabel || 'ASHA-registered location'}</strong>
        {useCurrent ? ' (temporary override)' : ''}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${!useCurrent ? 'bg-leaf-100 text-forest-900' : 'bg-white/10 text-leaf-100'}`}
          onClick={() => {
            setUseCurrent(false);
            setOverrideCoords(null);
          }}
        >
          Use registered village
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${useCurrent ? 'bg-leaf-100 text-forest-900' : 'bg-white/10 text-leaf-100'}`}
          onClick={requestCurrentLocation}
        >
          I am somewhere else / use current location
        </button>
      </div>

      {notifyBanner && (
        <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-500/20 px-4 py-3 text-sm text-leaf-50">
          {notifyBanner}{' '}
          <button type="button" className="font-semibold underline" onClick={() => void runRecommend()}>
            View updated recommendation
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(['', 'government', 'private'] as const).map((opt) => (
          <button
            key={opt || 'all'}
            type="button"
            onClick={() => setType(opt)}
            className={`rounded-md px-3 py-1.5 text-sm ${type === opt ? 'bg-leaf-100 text-forest-900' : 'bg-white/10 text-leaf-100'}`}
          >
            {opt === '' ? t('facilities.all') : t(`facilities.${opt}`)}
          </button>
        ))}
      </div>

      <form onSubmit={recommend} className="bg-panel mt-6 flex flex-wrap items-end gap-3 rounded-xl p-4 text-ink">
        <label className="text-sm font-medium">
          {t('facilities.specialty')}
          <input
            className="mt-1 block rounded-md border border-forest-800/15 px-3 py-2"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          />
        </label>
        <button type="submit" className="rounded-md bg-forest-800 px-4 py-2 text-leaf-50">
          {t('facilities.recommend')}
        </button>
      </form>

      {reco?.recommendation && (
        <div className="mt-4 rounded-xl border border-leaf-100/20 bg-white/10 p-4 text-leaf-50">
          <p className="text-xs uppercase tracking-wide text-leaf-100/60">Best match</p>
          <p className="font-display text-xl">{reco.recommendation.facility.name}</p>
          <p className="mt-1 text-sm text-leaf-100/80">
            {t('facilities.why', { reason: reco.recommendation.why })}
          </p>
          <p className="text-sm">
            {t('facilities.distance', { km: reco.recommendation.distanceKm.toFixed(1) })} ·{' '}
            {reco.recommendation.specialtyAvailable ? 'Doctor available' : 'Matching doctor unavailable'}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {reco.recommendation.matchingDoctors.map((d) => (
              <li key={d.id}>
                {d.name} — {d.status.replace('_', ' ')}
                {d.openSlots?.length ? ` · ${d.openSlots.length} open slots` : ''}
              </li>
            ))}
          </ul>
          {reco.alternative && (
            <p className="mt-2 text-sm text-leaf-100/70">
              Alternative: {reco.alternative.facility.name} (
              {reco.alternative.distanceKm.toFixed(1)} km) —{' '}
              {reco.alternative.specialtyAvailable ? 'available' : 'unavailable'}
            </p>
          )}
          {reco.recommendation.specialtyAvailable && (
            <button
              type="button"
              className="mt-3 rounded-md bg-clay-600 px-3 py-1.5 text-sm font-medium"
              onClick={() =>
                startBook(
                  reco.recommendation!.facility.id,
                  reco.recommendation!.matchingDoctors.find((d) => d.status === 'available')
                )
              }
            >
              {t('facilities.book')}
            </button>
          )}
        </div>
      )}

      {bookFacilityId && selectedDoctor && (
        <div className="bg-panel mt-4 rounded-xl p-4 text-ink">
          <p className="font-semibold">
            Book {selectedDoctor.name} ({selectedDoctor.specialty})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(selectedDoctor.openSlots || []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSlotId(s.id)}
                className={`rounded-md px-2 py-1 text-sm ${selectedSlotId === s.id ? 'bg-forest-800 text-leaf-50' : 'bg-forest-800/10'}`}
              >
                {s.time}
              </button>
            ))}
          </div>
          <ConfirmGate onConfirm={() => void book()} />
        </div>
      )}

      {message && <p className="mt-3 text-sm text-leaf-100">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {appointments.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-xl text-leaf-50">My appointments</h2>
          <ul className="mt-3 space-y-2">
            {appointments.map((a) => (
              <li key={a._id} className="rounded-lg bg-white/10 px-4 py-3 text-sm text-leaf-50">
                {typeof a.facilityId === 'object' ? a.facilityId?.name : 'Facility'} ·{' '}
                {typeof a.doctorId === 'object' ? a.doctorId?.name : 'Doctor'} · {a.slotDate} {a.slotTime} ·{' '}
                <strong className="uppercase">{a.status}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {facilities.map((f) => (
          <li key={f.id} className="bg-panel rounded-xl px-4 py-3 text-ink">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{f.name}</h2>
              <span className="text-sm capitalize text-muted">
                {f.type} · {t('facilities.distance', { km: f.distanceKm.toFixed(1) })} · ★ {f.rating}
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {f.doctors.map((d) => (
                <li key={d.id} className="rounded bg-forest-800/10 px-2 py-1">
                  {d.name} — {d.specialty} ({d.status.replace('_', ' ')})
                  {d.status === 'available' && (
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => startBook(f.id, d)}
                    >
                      Book
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
