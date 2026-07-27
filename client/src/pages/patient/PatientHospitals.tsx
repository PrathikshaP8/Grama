import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';
import { ConfirmGate } from '../../components/ConfirmGate';
import { api } from '../../services/api';

interface FacilityRow {
  id: string;
  name: string;
  type: string;
  distanceKm: number;
  rating: number;
  doctors: Array<{ name: string; specialty: string; status: string }>;
}

export function PatientHospitals() {
  const { t } = useTranslation();
  const [type, setType] = useState<'' | 'government' | 'private'>('');
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [specialty, setSpecialty] = useState('General Physician');
  const [reco, setReco] = useState<{
    recommendation: { facility: { id: string; name: string }; why: string; distanceKm: number } | null;
    alternative: { facility: { name: string }; why: string } | null;
  } | null>(null);
  const [bookFacilityId, setBookFacilityId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const q = type ? `?type=${type}` : '';
    const res = await api<{ facilities: FacilityRow[] }>(`/facilities${q}`);
    setFacilities(res.facilities);
  }

  useEffect(() => {
    void load();
  }, [type]);

  async function recommend(e: FormEvent) {
    e.preventDefault();
    const res = await api<typeof reco>('/facilities/recommend', {
      method: 'POST',
      body: JSON.stringify({
        lat: 13.0827,
        lng: 74.9959,
        specialty,
        type: type || undefined,
      }),
    });
    setReco(res);
  }

  async function book() {
    if (!bookFacilityId) return;
    await api('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        facilityId: bookFacilityId,
        specialty,
        bookedVia: 'manual',
        confirmed: true,
        urgency: 'soon',
      }),
    });
    setMessage('Appointment confirmed');
    setBookFacilityId(null);
  }

  const links = [
    { to: '/patient', label: t('nav.home') },
    { to: '/patient/hospitals', label: t('nav.hospitals') },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('facilities.title')}</h1>

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
          <p className="font-display text-xl">{reco.recommendation.facility.name}</p>
          <p className="mt-1 text-sm text-leaf-100/80">
            {t('facilities.why', { reason: reco.recommendation.why })}
          </p>
          <p className="text-sm">{t('facilities.distance', { km: reco.recommendation.distanceKm.toFixed(1) })}</p>
          {reco.alternative && (
            <p className="mt-2 text-sm text-leaf-100/70">
              Alternative: {reco.alternative.facility.name} — {reco.alternative.why}
            </p>
          )}
          <button
            type="button"
            className="mt-3 rounded-md bg-clay-600 px-3 py-1.5 text-sm font-medium"
            onClick={() => setBookFacilityId(reco.recommendation!.facility.id)}
          >
            {t('facilities.book')}
          </button>
          {bookFacilityId === reco.recommendation.facility.id && (
            <ConfirmGate onConfirm={() => void book()} />
          )}
        </div>
      )}

      {message && <p className="mt-3 text-sm text-leaf-100">{message}</p>}

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
              {f.doctors.map((d, i) => (
                <li key={i} className="rounded bg-forest-800/10 px-2 py-1">
                  {d.name} — {d.specialty} ({d.status.replace('_', ' ')})
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-3 text-sm font-medium text-forest-800 underline"
              onClick={() => setBookFacilityId(f.id)}
            >
              {t('facilities.book')}
            </button>
            {bookFacilityId === f.id && <ConfirmGate onConfirm={() => void book()} />}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
