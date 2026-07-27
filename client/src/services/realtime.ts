import { io, Socket } from 'socket.io-client';

type Handler = (payload: Record<string, unknown>) => void;

let socket: Socket | null = null;
const listeners = new Map<string, Set<Handler>>();

function getToken(): string | null {
  return localStorage.getItem('gramcare-token');
}

export function connectRealtime(): Socket | null {
  const token = getToken();
  if (!token) return null;
  if (socket?.connected) return socket;

  socket?.disconnect();
  socket = io('/', {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('[realtime] connected', socket?.id);
  });

  for (const [event, set] of listeners) {
    for (const handler of set) {
      socket.on(event, handler as (...args: unknown[]) => void);
    }
  }

  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function onRealtime(event: string, handler: Handler): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  socket?.on(event, handler as (...args: unknown[]) => void);
  return () => {
    listeners.get(event)?.delete(handler);
    socket?.off(event, handler as (...args: unknown[]) => void);
  };
}

export function watchSpecialty(specialty: string): void {
  socket?.emit('watch:specialty', specialty);
}

export function unwatchSpecialty(specialty: string): void {
  socket?.emit('unwatch:specialty', specialty);
}

export function joinFacility(facilityId: string): void {
  socket?.emit('join:facility', facilityId);
}
