import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRoutes } from '../AppRoutes';
import { AuthProvider } from '../auth/AuthProvider';
import type { Broadcast } from '../broadcasts';
import type {
  CameraCapture,
  CameraCaptureState,
} from '../capture/cameraCapture';
import { startCameraCapture } from '../capture/cameraCapture';
import { startWhipPublish, type PublishEvent } from '../publish/whipPublisher';

vi.mock('../capture/cameraCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/cameraCapture')>()),
  startCameraCapture: vi.fn(),
}));
vi.mock('../publish/whipPublisher', () => ({ startWhipPublish: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const me = { id: 'u1', email: 'a@example.com', nickname: '불씨' };
const PUBLISH_URL = '/app/b1?direction=whip&transport=all&token=1.abc';

const broadcast: Broadcast = {
  id: 'b1',
  title: '첫 방송',
  description: '',
  status: 'READY',
  startedAt: null,
  endedAt: null,
  createdAt: '2026-11-09T00:00:00.000Z',
  streamer: { id: me.id, nickname: me.nickname },
};

type Reply = number | { status: number; body: unknown };

function stubApi(routes: Record<string, Reply>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push(key);
    const reply = routes[key] ?? 404;
    return Promise.resolve(
      typeof reply === 'number'
        ? new Response(null, { status: reply })
        : Response.json(reply.body, { status: reply.status }),
    );
  });
  return calls;
}

const TOKEN_OK = {
  status: 201,
  body: { publishUrl: PUBLISH_URL, expiresAt: '2026-11-09T00:05:00.000Z' },
};

function fakeCapture() {
  let state: CameraCaptureState = {
    status: 'live',
    facing: 'user',
    canSwitchCamera: false,
    switching: false,
    wakeLock: 'active',
  };
  const listeners = new Set<() => void>();
  const setState = (next: CameraCaptureState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const capture = {
    stream: {} as MediaStream,
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    switchCamera: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => setState({ status: 'ended', reason: 'stopped' })),
  } satisfies CameraCapture;
  return { capture, setState };
}

function fakePublisher() {
  const publisher = { stop: vi.fn() };
  let emit: (event: PublishEvent) => void = () => {};
  vi.mocked(startWhipPublish).mockImplementation((_stream, _url, onEvent) => {
    emit = onEvent;
    return publisher;
  });
  return { publisher, emit: (event: PublishEvent) => act(() => emit(event)) };
}

function renderPage(api: Record<string, Reply>) {
  const calls = stubApi({
    'GET /api/auth/me': { status: 200, body: me },
    'GET /api/broadcasts/b1': { status: 200, body: broadcast },
    ...api,
  });
  const fake = fakeCapture();
  vi.mocked(startCameraCapture).mockResolvedValue(fake.capture);
  const whip = fakePublisher();
  render(
    <MemoryRouter initialEntries={['/studio/broadcasts/b1']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { calls, ...fake, ...whip };
}

async function turnOnCameraAndStart() {
  fireEvent.click(await screen.findByRole('button', { name: '카메라 켜기' }));
  fireEvent.click(await screen.findByRole('button', { name: '방송 시작' }));
}

it('publishes the camera with a fresh token and stops on 송출 중지', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await turnOnCameraAndStart();
  expect(await screen.findByText('송출을 연결하는 중입니다.')).toBeDefined();
  expect(page.calls).toContain('POST /api/broadcasts/b1/publish-token');
  expect(startWhipPublish).toHaveBeenCalledWith(
    page.capture.stream,
    PUBLISH_URL,
    expect.any(Function),
  );

  page.emit({ kind: 'connected' });
  expect(
    screen.getByText('송출 중입니다. 시청자가 방송을 볼 수 있습니다.'),
  ).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: '송출 중지' }));
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(page.capture.stop).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '카메라 켜기' })).toBeDefined();
});

it('shows the API’s 409 message and keeps the preview', async () => {
  renderPage({
    'POST /api/broadcasts/b1/publish-token': {
      status: 409,
      body: { statusCode: 409, message: '기존 방송을 종료하세요.' },
    },
  });
  await turnOnCameraAndStart();
  expect((await screen.findByRole('alert')).textContent).toBe(
    '기존 방송을 종료하세요.',
  );
  expect(startWhipPublish).not.toHaveBeenCalled();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: '방송 시작' })
      .disabled,
  ).toBe(false);
});

it('says 권한이 없습니다 on a 403', async () => {
  renderPage({ 'POST /api/broadcasts/b1/publish-token': 403 });
  await turnOnCameraAndStart();
  expect((await screen.findByRole('alert')).textContent).toBe(
    '권한이 없습니다.',
  );
});

it('tells the streamer when OME refuses the publish', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await turnOnCameraAndStart();
  await screen.findByText('송출을 연결하는 중입니다.');
  page.emit({ kind: 'failed', status: 401 });
  expect(screen.getByRole('alert').textContent).toBe(
    '송출이 허가되지 않았습니다. 다시 시도하세요.',
  );
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(page.capture.stop).not.toHaveBeenCalled();
});

it('stops publishing when the camera is taken away', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await turnOnCameraAndStart();
  await screen.findByText('송출을 연결하는 중입니다.');
  page.emit({ kind: 'connected' });
  act(() => page.setState({ status: 'ended', reason: 'device-lost' }));
  expect(screen.getByRole('alert').textContent).toBe(
    '카메라나 마이크가 꺼져 송출을 멈췄습니다.',
  );
  expect(page.publisher.stop).toHaveBeenCalled();
});

it('stops the publish and the camera when the streamer leaves', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await turnOnCameraAndStart();
  await screen.findByText('송출을 연결하는 중입니다.');
  page.emit({ kind: 'connected' });
  cleanup();
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(page.capture.stop).toHaveBeenCalled();
});

it('refuses someone else’s broadcast', async () => {
  stubApi({
    'GET /api/auth/me': { status: 200, body: { ...me, id: 'u2' } },
    'GET /api/broadcasts/b1': { status: 200, body: broadcast },
  });
  render(
    <MemoryRouter initialEntries={['/studio/broadcasts/b1']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole('heading', { name: '권한이 없습니다' }),
  ).toBeDefined();
});
