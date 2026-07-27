import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import ashaRoutes from './routes/asha.js';
import patientRoutes from './routes/patients.js';
import hospitalRoutes from './routes/hospital.js';
import facilityRoutes from './routes/facilities.js';
import appointmentRoutes from './routes/appointments.js';
import analyticsRoutes from './routes/analytics.js';
import voiceRoutes from './routes/voice.js';

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'GramCare AI',
      version: '2.0.0',
      aadhaarMode: 'demo-hash-simulation',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/asha', ashaRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/hospital', hospitalRoutes);
  app.use('/api/facilities', facilityRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/voice', voiceRoutes);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
