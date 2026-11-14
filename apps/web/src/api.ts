export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    // API가 사용자에게 보여 줄 `message`를 보냈을 때 그 값이다(예: 409의
    // 한국어 설명).
    readonly serverMessage: string | null = null,
    // API가 기계가 읽는 `code`를 보냈을 때 그 값이다. 화면은 메시지를 비교하지
    // 않고도 409끼리 구분할 수 있다.
    readonly serverCode: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 이 요청들의 401은 세션이 끊긴 것이 아니라 비밀번호가 틀렸거나 가입이 거절된 것이다.
// 그래서 화면은 로그아웃하지 않고 자기 메시지를 보여 준다.
const CREDENTIAL_PATHS = new Set([
  '/auth/login',
  '/auth/signup',
  '/auth/test-login',
]);

const unauthorizedListeners = new Set<() => void>();

// AuthProvider가 여기를 구독해, 어느 요청에서 온 401이든 앱을 로그아웃 상태로
// 바꾼다. 구독 해제 함수를 돌려준다.
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
  // FormData 본문에는 multipart boundary가 필요하고, 이 값은 브라우저만
  // 안다. 그래서 Content-Type은 fetch가 정하도록 비워 둔다.
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
    const { message, code } = await serverErrorOf(res);
    throw new ApiError(
      res.status,
      `${init?.method ?? 'GET'} /api${path} failed with ${res.status}`,
      message,
      code,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function serverErrorOf(
  res: Response,
): Promise<{ message: string | null; code: string | null }> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return { message: null, code: null };
  }
  const field = (key: string) =>
    key in body && typeof (body as Record<string, unknown>)[key] === 'string'
      ? ((body as Record<string, unknown>)[key] as string)
      : null;
  return { message: field('message'), code: field('code') };
}
