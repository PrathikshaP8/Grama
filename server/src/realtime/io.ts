import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AccessPayload } from '../middleware/auth.js';

export type RealtimeEvents =
  | 'doctor:availability_changed'
  | 'appointment:created'
  | 'appointment:updated'
  | 'patient:updated'
  | 'facility:updated'
  | 'slot:updated';

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      const payload = jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
      if (payload.typ !== 'access') {
        next(new Error('Unauthorized'));
        return;
      }
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const role = socket.data.role as string;
    const userId = socket.data.userId as string;
    socket.join(`role:${role}`);
    socket.join(`user:${userId}`);
    if (role === 'hospital') {
      // Facility room joined after client emits join:facility
    }
    socket.on('join:facility', (facilityId: string) => {
      if (role === 'hospital' || role === 'asha' || role === 'patient') {
        socket.join(`facility:${facilityId}`);
      }
    });
    socket.on('watch:specialty', (specialty: string) => {
      if (specialty) socket.join(`specialty:${specialty.toLowerCase()}`);
    });
    socket.on('unwatch:specialty', (specialty: string) => {
      if (specialty) socket.leave(`specialty:${specialty.toLowerCase()}`);
    });
  });

  console.log('[realtime] Socket.IO ready');
  return io;
}

export function getIo(): Server | null {
  return io;
}

/** Broadcast non-sensitive sync hints — clients refetch authoritative data. */
export function emitEvent(
  event: RealtimeEvents,
  payload: Record<string, unknown>,
  rooms?: string[]
): void {
  if (!io) return;
  if (rooms?.length) {
    for (const room of rooms) {
      io.to(room).emit(event, payload);
    }
  } else {
    io.emit(event, payload);
  }
}
