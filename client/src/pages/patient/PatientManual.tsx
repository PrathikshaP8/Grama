import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';

export function PatientManual() {
  const { t } = useTranslation();
  const links = [
    { to: '/patient', label: t('nav.home') },
    { to: '/patient/voice', label: t('nav.voice') },
    { to: '/patient/manual', label: t('nav.manual') },
    { to: '/patient/hospitals', label: t('nav.hospitals') },
    { to: '/patient/history', label: t('nav.history') },
    { to: '/patient/ar', label: t('nav.ar') },
  ];

  const items = [
    { to: '/patient/hospitals', label: t('nav.hospitals'), desc: 'Find & book nearby care' },
    { to: '/patient/history', label: t('nav.history'), desc: 'Vitals, meds, visits' },
    { to: '/patient', label: t('nav.profile'), desc: 'Your ID & QR card' },
    { to: '/patient/ar', label: t('nav.ar'), desc: 'Capture visible symptoms' },
    { to: '/patient/voice', label: t('nav.voice'), desc: 'Switch to voice mode' },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('nav.manual')}</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="block rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-leaf-50 transition hover:bg-white/10"
            >
              <span className="font-semibold">{item.label}</span>
              <span className="mt-1 block text-sm text-leaf-100/65">{item.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
