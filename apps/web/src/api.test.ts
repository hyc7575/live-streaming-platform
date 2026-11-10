import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, onUnauthorized } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('sends the session cookie to the /api prefix and parses JSON', async () => {
  const fetchMock = vi.fn(() =>
    Promise.resolve(Response.json({ status: 'ok' })),
  );
  vi.stubGlobal('fetch', fetchMock);

  await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok' });
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/health',
    expect.objectContaining({ credentials: 'include' }),
  );
});

it('leaves the Content-Type of a FormData body to the browser', async () => {
  const fetchMock = vi.fn<
    (url: string, init: RequestInit) => Promise<Response>
  >(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchMock);

  await apiFetch('/upload', { method: 'PUT', body: new FormData() });
  await apiFetch('/json', { method: 'POST', body: '{}' });

  const contentType = (call: number) =>
    new Headers(fetchMock.mock.calls[call]?.[1].headers).get('Content-Type');
  expect(contentType(0)).toBeNull();
  expect(contentType(1)).toBe('application/json');
});

it('throws ApiError with the HTTP status on a non-2xx response', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(null, { status: 401 })),
  );

  await expect(apiFetch('/me')).rejects.toEqual(
    expect.objectContaining({ name: 'ApiError', status: 401 }),
  );
  await expect(apiFetch('/me')).rejects.toBeInstanceOf(ApiError);
});

it('keeps the API message of a non-2xx response for the user', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      Response.json(
        { message: '기존 방송을 종료하세요.', statusCode: 409 },
        { status: 409 },
      ),
    ),
  );

  await expect(apiFetch('/broadcasts/x/publish-token')).rejects.toEqual(
    expect.objectContaining({
      status: 409,
      serverMessage: '기존 방송을 종료하세요.',
    }),
  );
});

it('reports a lost session on 401, but not a wrong password or sign-up', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(null, { status: 401 })),
  );
  const listener = vi.fn();
  const unsubscribe = onUnauthorized(listener);

  for (const path of ['/auth/login', '/auth/signup', '/auth/test-login']) {
    await expect(apiFetch(path, { method: 'POST' })).rejects.toBeInstanceOf(
      ApiError,
    );
  }
  expect(listener).not.toHaveBeenCalled();

  await expect(apiFetch('/me/follows')).rejects.toBeInstanceOf(ApiError);
  expect(listener).toHaveBeenCalledTimes(1);

  unsubscribe();
  await expect(apiFetch('/me/follows')).rejects.toBeInstanceOf(ApiError);
  expect(listener).toHaveBeenCalledTimes(1);
});
