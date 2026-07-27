import { type FormEvent, useEffect, useState, type InputHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';
import { api } from '../../services/api';

interface Coverage {
  village: string;
  registered: number;
  estimatedHouseholds: number;
  coveragePct: number;
}

interface PatientRow {
  _id: string;
  uniqueId: string;
  name: string;
  aadhaarLast4: string;
  bloodGroup: string;
}

export function AshaHome() {
  const { t } = useTranslation();
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [patients, setPatients] = useState<PatientRow[]>([]);

  useEffect(() => {
    void api<Coverage>('/asha/coverage').then(setCoverage);
    void api<{ patients: PatientRow[] }>('/asha/patients').then((r) => setPatients(r.patients));
  }, []);

  const links = [
    { to: '/asha', label: t('nav.home') },
    { to: '/asha/register', label: t('nav.register') },
    { to: '/asha/analytics', label: t('nav.analytics') },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('asha.title')}</h1>
      {coverage && (
        <div className="bg-panel mt-6 rounded-2xl p-5 text-ink">
          <p className="text-sm text-muted">{coverage.village}</p>
          <p className="font-display mt-1 text-2xl">
            {t('asha.coverage', {
              registered: coverage.registered,
              estimated: coverage.estimatedHouseholds,
            })}
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-forest-800/15">
            <div
              className="h-full rounded-full bg-forest-600 transition-all duration-700"
              style={{ width: `${Math.min(100, coverage.coveragePct)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">{coverage.coveragePct}% coverage</p>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Link
          to="/asha/register"
          className="rounded-xl bg-leaf-100 px-5 py-3 font-semibold text-forest-900"
        >
          {t('asha.registerResident')}
        </Link>
      </div>

      <h2 className="mt-8 font-display text-xl text-leaf-50">Registered residents</h2>
      <ul className="mt-3 space-y-2">
        {patients.map((p) => (
          <li key={p._id} className="flex justify-between rounded-lg bg-white/10 px-4 py-3 text-leaf-50">
            <span>
              {p.name} · {p.uniqueId}
            </span>
            <span className="text-sm text-leaf-100/70">
              {p.bloodGroup} · ****{p.aadhaarLast4}
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

export function AshaRegister() {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    fullName: '',
    aadhaar: '',
    phone: '',
    bloodGroup: 'O+',
    address: '',
    city: 'Mangalore',
    village: 'Belman',
    conditions: '',
    medications: '',
    bpSystolic: '',
    bpDiastolic: '',
    bloodSugar: '',
  });
  const [result, setResult] = useState<{ uniqueId: string; qrDataUrl?: string } | null>(null);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api<{ patient: { uniqueId: string; qrDataUrl?: string } }>('/asha/patients', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          aadhaar: form.aadhaar,
          phone: form.phone,
          bloodGroup: form.bloodGroup,
          address: form.address,
          city: form.city,
          village: form.village,
          baseline: {
            conditions: form.conditions
              ? form.conditions.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
            medications: form.medications
              ? form.medications.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
            bpSystolic: form.bpSystolic ? Number(form.bpSystolic) : undefined,
            bpDiastolic: form.bpDiastolic ? Number(form.bpDiastolic) : undefined,
            bloodSugar: form.bloodSugar ? Number(form.bloodSugar) : undefined,
          },
        }),
      });
      setResult({ uniqueId: res.patient.uniqueId, qrDataUrl: res.patient.qrDataUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const links = [
    { to: '/asha', label: t('nav.home') },
    { to: '/asha/register', label: t('nav.register') },
  ];

  const field = (key: keyof typeof form, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm font-medium text-ink">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-forest-800/15 bg-white px-3 py-2"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </label>
  );

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('asha.registerResident')}</h1>
      {result ? (
        <div className="bg-panel mt-6 max-w-md rounded-2xl p-6 text-ink">
          <p className="font-display text-xl">{t('asha.success', { id: result.uniqueId })}</p>
          {result.qrDataUrl && (
            <img src={result.qrDataUrl} alt={result.uniqueId} className="mx-auto mt-4 h-56 w-56" />
          )}
          <button
            type="button"
            className="mt-4 text-forest-800 underline"
            onClick={() => setResult(null)}
          >
            Register another
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="bg-panel mt-6 grid max-w-2xl gap-3 rounded-2xl p-5 sm:grid-cols-2">
          {field('fullName', t('asha.fullName'), { required: true })}
          {field('aadhaar', t('login.aadhaar'), { required: true, inputMode: 'numeric' })}
          {field('phone', t('asha.phone'), { required: true })}
          {field('bloodGroup', t('asha.bloodGroup'), { required: true })}
          {field('address', t('asha.address'), { required: true })}
          {field('city', t('asha.city'), { required: true })}
          {field('village', t('asha.village'))}
          <div className="sm:col-span-2">
            <p className="mb-2 font-semibold text-ink">{t('asha.baseline')}</p>
          </div>
          {field('conditions', t('asha.conditions'), { placeholder: 'comma-separated' })}
          {field('medications', t('asha.medications'), { placeholder: 'comma-separated' })}
          {field('bpSystolic', `${t('asha.bp')} (sys)`, { inputMode: 'numeric' })}
          {field('bpDiastolic', `${t('asha.bp')} (dia)`, { inputMode: 'numeric' })}
          {field('bloodSugar', t('asha.sugar'), { inputMode: 'numeric' })}
          {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            className="sm:col-span-2 rounded-md bg-forest-800 py-2.5 font-semibold text-leaf-50"
          >
            {t('asha.save')}
          </button>
        </form>
      )}
    </Shell>
  );
}
