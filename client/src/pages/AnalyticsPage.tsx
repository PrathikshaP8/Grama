import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Shell } from '../components/Shell';
import { api } from '../services/api';
import { useAuth } from '../auth/AuthContext';

interface Summary {
  totals: { patients: number; appointments: number; facilities: number; qrScans: number };
  byUrgency: Array<{ urgency: string; count: number }>;
  conditionTrends: Array<{ condition: string; count: number }>;
  coverage: { village: string; registered: number; estimated: number; pct: number } | null;
}

const COLORS = ['#1a5c45', '#2d8a68', '#c45c26', '#d9773a', '#3aa57c'];

export function AnalyticsPage({ base }: { base: '/asha' | '/hospital' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [audit, setAudit] = useState<{ chainValid: boolean; logs: Array<{ action: string; hash: string; createdAt: string }> } | null>(null);

  useEffect(() => {
    void api<Summary>('/analytics/summary').then(setSummary);
    void api<typeof audit>('/analytics/audit').then(setAudit);
  }, []);

  const links = [
    { to: base, label: t('nav.home') },
    { to: `${base}/analytics`, label: t('nav.analytics') },
  ];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('nav.analytics')}</h1>
      {summary && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(summary.totals).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/10 px-4 py-3 text-leaf-50">
                <p className="text-xs uppercase tracking-wide text-leaf-100/60">{k}</p>
                <p className="font-display text-2xl">{v}</p>
              </div>
            ))}
          </div>

          {summary.coverage && user?.role === 'asha' && (
            <p className="mt-4 text-leaf-100">
              {summary.coverage.village}: {summary.coverage.registered}/{summary.coverage.estimated} (
              {summary.coverage.pct}%)
            </p>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="bg-panel rounded-2xl p-4 text-ink">
              <h2 className="font-semibold">Condition mentions</h2>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.conditionTrends}>
                    <XAxis dataKey="condition" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1a5c45" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-panel rounded-2xl p-4 text-ink">
              <h2 className="font-semibold">Appointments by urgency</h2>
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.byUrgency}
                      dataKey="count"
                      nameKey="urgency"
                      outerRadius={80}
                      label
                    >
                      {summary.byUrgency.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {audit && (
        <div className="mt-8">
          <h2 className="font-display text-xl text-leaf-50">
            Audit chain {audit.chainValid ? '✓ intact' : '⚠ broken'}
          </h2>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs text-leaf-100/80">
            {audit.logs.map((l, i) => (
              <li key={i} className="font-mono">
                {l.action} · {l.hash.slice(0, 12)}… · {new Date(l.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}
