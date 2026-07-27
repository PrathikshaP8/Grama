import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { PatientHome } from './pages/patient/PatientHome';
import { PatientManual } from './pages/patient/PatientManual';
import { PatientHistory } from './pages/patient/PatientHistory';
import { PatientHospitals } from './pages/patient/PatientHospitals';
import { PatientVoice } from './pages/patient/PatientVoice';
import { PatientAr } from './pages/patient/PatientAr';
import { AshaHome, AshaRegister } from './pages/asha/AshaDashboard';
import { HospitalHome } from './pages/hospital/HospitalDashboard';
import { AnalyticsPage } from './pages/AnalyticsPage';
import type { Role } from './auth/AuthContext';

function Protected({ role, children }: { role: Role | Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(user.role)) {
    const home = user.role === 'asha' ? '/asha' : user.role === 'hospital' ? '/hospital' : '/patient';
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate
              to={user.role === 'asha' ? '/asha' : user.role === 'hospital' ? '/hospital' : '/patient'}
              replace
            />
          ) : (
            <LandingPage />
          )
        }
      />

      <Route path="/patient" element={<Protected role="patient"><PatientHome /></Protected>} />
      <Route path="/patient/manual" element={<Protected role="patient"><PatientManual /></Protected>} />
      <Route path="/patient/history" element={<Protected role="patient"><PatientHistory /></Protected>} />
      <Route path="/patient/hospitals" element={<Protected role="patient"><PatientHospitals /></Protected>} />
      <Route path="/patient/voice" element={<Protected role="patient"><PatientVoice /></Protected>} />
      <Route path="/patient/ar" element={<Protected role="patient"><PatientAr /></Protected>} />

      <Route path="/asha" element={<Protected role="asha"><AshaHome /></Protected>} />
      <Route path="/asha/register" element={<Protected role="asha"><AshaRegister /></Protected>} />
      <Route path="/asha/analytics" element={<Protected role="asha"><AnalyticsPage base="/asha" /></Protected>} />

      <Route path="/hospital" element={<Protected role="hospital"><HospitalHome /></Protected>} />
      <Route
        path="/hospital/analytics"
        element={<Protected role="hospital"><AnalyticsPage base="/hospital" /></Protected>}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
