import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api';

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
