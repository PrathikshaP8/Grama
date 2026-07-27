import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { connectRealtime, disconnectRealtime, onRealtime } from '../services/realtime';

interface Toast {
  id: number;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface RealtimeCtx {
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<RealtimeCtx | null>(null);

let toastSeq = 1;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (t: Omit<Toast, 'id'>) => {
    const id = toastSeq++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 12000);
  };

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  useEffect(() => {
    if (!user) {
      disconnectRealtime();
      return;
    }
    connectRealtime();
    return () => disconnectRealtime();
  }, [user?.id, user?.role]);

  return (
    <Ctx.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-xl border border-forest-800/20 bg-leaf-50 p-3 text-ink shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{t.title}</p>
                <p className="mt-1 text-xs text-muted">{t.body}</p>
              </div>
              <button type="button" className="text-xs text-muted" onClick={() => dismissToast(t.id)}>
                ✕
              </button>
            </div>
            {t.onAction && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-forest-800 underline"
                onClick={() => {
                  t.onAction?.();
                  dismissToast(t.id);
                }}
              >
                {t.actionLabel || 'View update'}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRealtime outside provider');
  return ctx;
}

/** Subscribe to a realtime event and call handler. */
export function useRealtimeEvent(event: string, handler: (payload: Record<string, unknown>) => void) {
  useEffect(() => onRealtime(event, handler), [event, handler]);
}
