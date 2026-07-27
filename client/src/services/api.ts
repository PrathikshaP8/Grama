const API = '/api';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'error' in body ? String((body as { error: string }).error) : 'Request failed');
    this.status = status;
    this.body = body;
  }
}

function token(): string | null {
  return localStorage.getItem('gramcare-token');
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem('gramcare-token', t);
  else localStorage.removeItem('gramcare-token');
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
