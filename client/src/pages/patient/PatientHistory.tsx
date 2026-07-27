import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shell } from '../../components/Shell';
import { api } from '../../services/api';

export function PatientHistory() {
  const { t } = useTranslation();
  const [history, setHistory] = useState<
    Array<{ type: string; payload: Record<string, unknown>; notes?: string; createdAt: string }>
  >([]);

  useEffect(() => {
    void api<{ history: typeof history }>('/patients/me').then((d) => setHistory(d.history));
  }, []);

  const links = [
    { to: '/patient', label: t('nav.home') },
    { to: '/patient/history', label: t('nav.history') },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('nav.history')}</h1>
      <ol className="mt-6 space-y-3">
        {history.map((h, i) => (
          <li key={i} className="bg-panel rounded-xl px-4 py-3 text-ink">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold capitalize">{h.type.replace('_', ' ')}</span>
              <time className="text-xs text-muted">{new Date(h.createdAt).toLocaleString()}</time>
            </div>
            <pre className="mt-2 overflow-x-auto text-xs text-muted whitespace-pre-wrap">
              {JSON.stringify(h.payload, null, 2)}
            </pre>
            {h.notes && <p className="mt-1 text-sm">{h.notes}</p>}
          </li>
        ))}
      </ol>
    </Shell>
  );
}
