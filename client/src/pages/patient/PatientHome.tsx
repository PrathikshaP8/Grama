import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/api';

interface PatientMe {
  patient: {
    uniqueId: string;
    name: string;
    bloodGroup: string;
    aadhaarLast4: string;
    address: string;
    village: string;
    city: string;
    qrDataUrl?: string;
  };
  history: Array<{ type: string; payload: Record<string, unknown>; createdAt: string }>;
}

export function PatientHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<PatientMe | null>(null);

  useEffect(() => {
    void api<PatientMe>('/patients/me').then(setData).catch(console.error);
  }, []);

  const links = [
    { to: '/patient', label: t('nav.home') },
    { to: '/patient/voice', label: t('nav.voice') },
    { to: '/patient/manual', label: t('nav.manual') },
    { to: '/patient/hospitals', label: t('nav.hospitals') },
    { to: '/patient/history', label: t('nav.history') },
    { to: '/patient/ar', label: t('nav.ar') },
  ];

  return (
    <Shell links={links}>
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="text-leaf-50">
          <h1 className="font-display text-3xl sm:text-4xl">
            {t('patient.welcome', { name: user?.name ?? data?.patient.name ?? '' })}
          </h1>
          <p className="mt-3 text-leaf-100/75">{t('patient.choose')}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/patient/voice"
              className="rounded-xl bg-leaf-100 px-6 py-4 text-center font-semibold text-forest-900 transition hover:bg-white"
            >
              {t('patient.voiceCta')}
            </Link>
            <Link
              to="/patient/manual"
              className="rounded-xl border border-leaf-100/30 px-6 py-4 text-center font-semibold text-leaf-100 hover:bg-white/10"
            >
              {t('patient.manualCta')}
            </Link>
          </div>
          <p className="mt-6 max-w-lg text-sm text-leaf-100/60">{t('patient.disclaimer')}</p>
        </section>

        <section className="bg-panel rounded-2xl p-5 text-ink">
          <p className="text-sm font-medium text-muted">{t('patient.yourId')}</p>
          <p className="font-display mt-1 text-3xl tracking-wide text-forest-800">
            {data?.patient.uniqueId ?? '—'}
          </p>
          {data?.patient.qrDataUrl && (
            <img
              src={data.patient.qrDataUrl}
              alt={`QR ${data.patient.uniqueId}`}
              className="mt-4 mx-auto h-48 w-48 rounded-lg bg-white p-2"
            />
          )}
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('patient.bloodGroup')}</dt>
              <dd className="font-semibold">{data?.patient.bloodGroup}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Aadhaar</dt>
              <dd>{t('patient.aadhaarEnding', { last4: data?.patient.aadhaarLast4 ?? '****' })}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('asha.village')}</dt>
              <dd>{data?.patient.village}</dd>
            </div>
          </dl>
        </section>
      </div>
    </Shell>
  );
}
