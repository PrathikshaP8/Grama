import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode } from 'html5-qrcode';
import { Shell } from '../../components/Shell';
import { api } from '../../services/api';

type Status = 'available' | 'not_available' | 'on_leave' | 'in_procedure';

interface DoctorRow {
  id: string;
  name: string;
  specialty: string;
  position: string;
  status: Status;
}

interface ScanResult {
  patient: {
    uniqueId: string;
    name: string;
    bloodGroup: string;
    aadhaarLast4: string;
    village: string;
  };
  summary: {
    bloodGroup: string;
    medications: string[];
    conditions: string[];
    recentVitals: Record<string, unknown>[];
  };
}

export function HospitalHome() {
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [facilityName, setFacilityName] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [manualId, setManualId] = useState('');
  const [scanning, setScanning] = useState(false);

  async function loadDoctors() {
    const [docs, fac] = await Promise.all([
      api<{ doctors: DoctorRow[] }>('/hospital/doctors'),
      api<{ facility: { name: string } | null }>('/hospital/facility'),
    ]);
    setDoctors(docs.doctors);
    setFacilityName(fac.facility?.name ?? '');
  }

  useEffect(() => {
    void loadDoctors();
  }, []);

  async function setStatus(doctorId: string, status: Status) {
    await api(`/hospital/doctors/${doctorId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    void loadDoctors();
  }

  async function resolveId(uniqueId: string) {
    const res = await api<ScanResult>(`/hospital/scan/${uniqueId}`);
    setScan(res);
  }

  useEffect(() => {
    if (!scanning) return;
    const scanner = new Html5Qrcode('qr-reader');
    void scanner
      .start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: 220 },
        (decoded) => {
          void resolveId(decoded.trim());
          void scanner.stop();
          setScanning(false);
        },
        () => undefined
      )
      .catch(console.error);
    return () => {
      void scanner.stop().catch(() => undefined);
    };
  }, [scanning]);

  const links = [
    { to: '/hospital', label: t('nav.home') },
    { to: '/hospital/analytics', label: t('nav.analytics') },
  ];

  const statuses: Status[] = ['available', 'not_available', 'on_leave', 'in_procedure'];

  return (
    <Shell links={links}>
      <h1 className="font-display text-3xl text-leaf-50">{t('hospital.title')}</h1>
      <p className="mt-1 text-leaf-100/70">{facilityName}</p>

      <h2 className="mt-8 font-display text-xl text-leaf-50">{t('hospital.availability')}</h2>
      <ul className="mt-3 space-y-3">
        {doctors.map((d) => (
          <li key={d.id} className="bg-panel flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-ink">
            <div>
              <p className="font-semibold">{d.name}</p>
              <p className="text-sm text-muted">
                {d.position} · {d.specialty}
              </p>
            </div>
            <select
              className="rounded-md border border-forest-800/20 bg-white px-2 py-1.5 text-sm"
              value={d.status}
              onChange={(e) => void setStatus(d.id, e.target.value as Status)}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {t(`hospital.${s}`)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 font-display text-xl text-leaf-50">{t('hospital.scanQr')}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="rounded-md bg-white px-3 py-2 text-ink"
          placeholder="e.g. MNG01"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
        />
        <button
          type="button"
          className="rounded-md bg-leaf-100 px-4 py-2 font-medium text-forest-900"
          onClick={() => void resolveId(manualId)}
        >
          Lookup ID
        </button>
        <button
          type="button"
          className="rounded-md bg-white/15 px-4 py-2 text-leaf-50"
          onClick={() => setScanning((s) => !s)}
        >
          {scanning ? 'Stop camera' : 'Open camera'}
        </button>
      </div>
      {scanning && <div id="qr-reader" className="mt-4 max-w-sm overflow-hidden rounded-xl" />}

      {scan && (
        <div className="bg-panel mt-6 rounded-2xl p-5 text-ink">
          <p className="font-display text-2xl">
            {scan.patient.name} · {scan.patient.uniqueId}
          </p>
          <p className="text-sm text-muted">
            {scan.patient.village} · Blood {scan.summary.bloodGroup} · Aadhaar ****
            {scan.patient.aadhaarLast4}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-muted">Medications</p>
              <p>{scan.summary.medications.join(', ') || 'None recorded'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted">Conditions</p>
              <p>{scan.summary.conditions.join(', ') || 'None recorded'}</p>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase text-muted">Recent vitals</p>
            <pre className="mt-1 text-xs whitespace-pre-wrap">
              {JSON.stringify(scan.summary.recentVitals, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Shell>
  );
}
