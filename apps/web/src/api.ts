export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    // The API's own `message`, when it sent one meant for the user (a 409's
    // Korean explanation, for example).
    readonly serverMessage: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// A 401 from these means a wrong password or a rejected sign-up, not a lost
// session, so the screen shows its own message instead of logging out.
const CREDENTIAL_PATHS = new Set([
  '/auth/login',
  '/auth/signup',
  '/auth/test-login',
]);

const unauthorizedListeners = new Set<() => void>();

// AuthProvider subscribes here so any 401 turns the app logged out, wherever
// the request came from. Returns the unsubscribe function.
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  // A FormData body needs the multipart boundary, which only the browser
  // knows, so its Content-Type is left for fetch to set.
  if (
    init?.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401 && !CREDENTIAL_PATHS.has(path)) {
      for (const listener of unauthorizedListeners) listener();
    }
    throw new ApiError(
      res.status,
      `${init?.method ?? 'GET'} /api${path} failed with ${res.status}`,
      await serverMessageOf(res),
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function serverMessageOf(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return null;
  }
  return typeof body.message === 'string' ? body.message : null;
}
