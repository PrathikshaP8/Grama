import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react';
import { api, setToken } from '../services/api';
import { connectRealtime, disconnectRealtime } from '../services/realtime';

export type Role = 'asha' | 'hospital' | 'patient';

export interface User {
  id: string;
  role: Role;
  name?: string;
  email?: string;
  uniqueId?: string;
  aadhaarLast4?: string;
  village?: string;
  facilityId?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  loginStaff: (email: string, password: string, role: 'asha' | 'hospital') => Promise<{ demoOtp?: string }>;
  verifyStaffOtp: (email: string, role: 'asha' | 'hospital', otp: string) => Promise<User>;
  loginPatient: (name: string, aadhaar: string) => Promise<{ demoOtp?: string; phoneHint?: string }>;
  verifyPatientOtp: (name: string, aadhaar: string, otp: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('gramcare-user');
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [loading] = useState(false);

  const persist = useCallback((u: User | null, accessToken?: string) => {
    setUser(u);
    if (u) localStorage.setItem('gramcare-user', JSON.stringify(u));
    else localStorage.removeItem('gramcare-user');
    if (accessToken !== undefined) setToken(accessToken || null);
    if (u && accessToken) connectRealtime();
    else if (!u) disconnectRealtime();
  }, []);

  const loginStaff = useCallback(async (email: string, password: string, role: 'asha' | 'hospital') => {
    const res = await api<{ demoOtp?: string }>('/auth/staff/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    });
    return { demoOtp: res.demoOtp };
  }, []);

  const verifyStaffOtp = useCallback(
    async (email: string, role: 'asha' | 'hospital', otp: string) => {
      const res = await api<{ accessToken: string; user: User }>('/auth/staff/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, role, otp }),
      });
      persist(res.user, res.accessToken);
      return res.user;
    },
    [persist]
  );

  const loginPatient = useCallback(async (name: string, aadhaar: string) => {
    const res = await api<{ demoOtp?: string; phoneHint?: string }>('/auth/patient/login', {
      method: 'POST',
      body: JSON.stringify({ name, aadhaar }),
    });
    return { demoOtp: res.demoOtp, phoneHint: res.phoneHint };
  }, []);

  const verifyPatientOtp = useCallback(
    async (name: string, aadhaar: string, otp: string) => {
      const res = await api<{ accessToken: string; user: User }>('/auth/patient/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ name, aadhaar, otp }),
      });
      persist(res.user, res.accessToken);
      return res.user;
    },
    [persist]
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    persist(null, '');
  }, [persist]);

  const value = useMemo(
    () => ({
      user,
      loading,
      loginStaff,
      verifyStaffOtp,
      loginPatient,
      verifyPatientOtp,
      logout,
      setUser: (u: User | null) => persist(u),
    }),
    [user, loading, loginStaff, verifyStaffOtp, loginPatient, verifyPatientOtp, logout, persist]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
