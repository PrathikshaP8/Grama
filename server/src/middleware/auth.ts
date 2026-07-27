import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AshaWorker } from '../models/AshaWorker.js';
import { HospitalMember } from '../models/HospitalMember.js';
import { Patient } from '../models/Patient.js';

export type Role = 'asha' | 'hospital' | 'patient';

export interface AuthUser {
  id: string;
  role: Role;
  email?: string;
  name?: string;
  facilityId?: string;
  village?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AccessPayload {
  sub: string;
  role: Role;
  typ: 'access';
}

export interface RefreshPayload {
  sub: string;
  role: Role;
  typ: 'refresh';
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role, typ: 'access' } satisfies AccessPayload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpires as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role, typ: 'refresh' } satisfies RefreshPayload, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpires as jwt.SignOptions['expiresIn'],
  });
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: !env.isDev,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
    if (payload.typ !== 'access') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }

    if (payload.role === 'asha') {
      const asha = await AshaWorker.findById(payload.sub);
      if (!asha?.active) {
        res.status(401).json({ error: 'Account inactive' });
        return;
      }
      req.user = {
        id: asha.id,
        role: 'asha',
        email: asha.email,
        name: asha.name,
        village: asha.assignedVillage,
      };
    } else if (payload.role === 'hospital') {
      const member = await HospitalMember.findById(payload.sub);
      if (!member?.active) {
        res.status(401).json({ error: 'Account inactive' });
        return;
      }
      req.user = {
        id: member.id,
        role: 'hospital',
        email: member.email,
        name: member.name,
        facilityId: member.facilityId.toString(),
      };
    } else if (payload.role === 'patient') {
      const patient = await Patient.findById(payload.sub);
      if (!patient) {
        res.status(401).json({ error: 'Patient not found' });
        return;
      }
      req.user = {
        id: patient.id,
        role: 'patient',
        name: patient.name,
        village: patient.village,
      };
    } else {
      res.status(401).json({ error: 'Unknown role' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
