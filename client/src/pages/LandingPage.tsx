import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { LanguageToggle } from '../components/LanguageToggle';
import { ApiError } from '../services/api';

type Mode = 'patient' | 'staff';

export function LandingPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('patient');
  const [step, setStep] = useState<'creds' | 'otp'>('creds');
  const [error, setError] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | undefined>();
  const [phoneHint, setPhoneHint] = useState<string | undefined>();

  // Patient
  const [name, setName] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  // Staff
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'asha' | 'hospital'>('asha');
  const [otp, setOtp] = useState('');

  async function onSubmitCreds(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'patient') {
        const res = await auth.loginPatient(name, aadhaar);
        setDemoOtp(res.demoOtp);
        setPhoneHint(res.phoneHint);
      } else {
        const res = await auth.loginStaff(email, password, role);
        setDemoOtp(res.demoOtp);
      }
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'patient') {
        await auth.verifyPatientOtp(name, aadhaar, otp);
        navigate('/patient');
      } else {
        const user = await auth.verifyStaffOtp(email, role, otp);
        navigate(user.role === 'asha' ? '/asha' : '/hospital');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="bg-atmosphere relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23e8f5ef\' fill-opacity=\'0.06\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />
      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6 sm:px-8">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-10 lg:flex-row lg:items-center lg:gap-16">
          <div className="max-w-xl text-leaf-50">
            <p className="font-display text-5xl leading-none tracking-tight sm:text-6xl md:text-7xl">
              {t('brand')}
            </p>
            <p className="mt-4 text-lg text-leaf-100/90 sm:text-xl">{t('tagline')}</p>
            <p className="mt-3 max-w-md text-base text-leaf-100/70">{t('subtitle')}</p>
          </div>

          <div className="bg-panel w-full max-w-md rounded-2xl p-6 text-ink shadow-xl shadow-black/20 sm:p-8">
            <div className="mb-5 flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-md py-2 text-sm font-semibold ${mode === 'patient' ? 'bg-forest-800 text-leaf-50' : 'bg-white/60'}`}
                onClick={() => {
                  setMode('patient');
                  setStep('creds');
                }}
              >
                {t('login.patient')}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-2 text-sm font-semibold ${mode === 'staff' ? 'bg-forest-800 text-leaf-50' : 'bg-white/60'}`}
                onClick={() => {
                  setMode('staff');
                  setStep('creds');
                }}
              >
                {t('login.staff')}
              </button>
            </div>

            {step === 'creds' ? (
              <form onSubmit={onSubmitCreds} className="space-y-3">
                {mode === 'patient' ? (
                  <>
                    <label className="block text-sm font-medium">
                      {t('login.name')}
                      <input
                        required
                        className="mt-1 w-full rounded-md border border-forest-800/15 bg-white px-3 py-2"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t('login.aadhaar')}
                      <input
                        required
                        inputMode="numeric"
                        className="mt-1 w-full rounded-md border border-forest-800/15 bg-white px-3 py-2"
                        value={aadhaar}
                        onChange={(e) => setAadhaar(e.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2 text-sm">
                      <button
                        type="button"
                        className={`rounded-md px-3 py-1 ${role === 'asha' ? 'bg-forest-700 text-white' : 'bg-white'}`}
                        onClick={() => setRole('asha')}
                      >
                        {t('login.roleAsha')}
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-3 py-1 ${role === 'hospital' ? 'bg-forest-700 text-white' : 'bg-white'}`}
                        onClick={() => setRole('hospital')}
                      >
                        {t('login.roleHospital')}
                      </button>
                    </div>
                    <label className="block text-sm font-medium">
                      {t('login.email')}
                      <input
                        required
                        type="email"
                        className="mt-1 w-full rounded-md border border-forest-800/15 bg-white px-3 py-2"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      {t('login.password')}
                      <input
                        required
                        type="password"
                        className="mt-1 w-full rounded-md border border-forest-800/15 bg-white px-3 py-2"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {error && <p className="text-sm text-red-700">{error}</p>}
                <button
                  type="submit"
                  className="w-full rounded-md bg-forest-800 py-2.5 font-semibold text-leaf-50 hover:bg-forest-700"
                >
                  {t('login.sendOtp')}
                </button>
              </form>
            ) : (
              <form onSubmit={onVerify} className="space-y-3">
                {phoneHint && <p className="text-sm text-muted">{phoneHint}</p>}
                {demoOtp && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {t('login.otpHint', { otp: demoOtp })}
                  </p>
                )}
                <label className="block text-sm font-medium">
                  {t('login.otp')}
                  <input
                    required
                    inputMode="numeric"
                    maxLength={6}
                    className="mt-1 w-full rounded-md border border-forest-800/15 bg-white px-3 py-2 tracking-widest"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </label>
                {error && <p className="text-sm text-red-700">{error}</p>}
                <button
                  type="submit"
                  className="w-full rounded-md bg-forest-800 py-2.5 font-semibold text-leaf-50"
                >
                  {t('login.verify')}
                </button>
                <button type="button" className="w-full text-sm text-muted" onClick={() => setStep('creds')}>
                  {t('common.back')}
                </button>
              </form>
            )}

            <p className="mt-5 text-xs leading-relaxed text-muted">{t('login.demoNote')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
