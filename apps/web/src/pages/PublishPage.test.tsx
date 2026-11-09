import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
  const publisher = { stop: vi.fn(), replaceTrack: vi.fn() };
  let emit: (event: PublishEvent) => void = () => {};
  vi.mocked(startWhipPublish).mockImplementation((_stream, _url, onEvent) => {
    emit = onEvent;
    return publisher;
  });
  return { publisher, emit: (event: PublishEvent) => act(() => emit(event)) };
}

// The returned `routes` can be changed mid-test to answer later calls
// differently.
function renderPage(api: Record<string, Reply>) {
  const routes: Record<string, Reply> = {
    'GET /api/auth/me': { status: 200, body: me },
    'GET /api/broadcasts/b1': { status: 200, body: broadcast },
    ...api,
  };
  const calls = stubApi(routes);
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
  return { calls, routes, ...fake, ...whip };
}

async function turnOnCameraAndStart() {
  fireEvent.click(await screen.findByRole('button', { name: '카메라 켜기' }));
  fireEvent.click(await screen.findByRole('button', { name: '방송 시작' }));
}

const ENDED = {
  status: 200,
  body: { ...broadcast, status: 'ENDED', endedAt: '2026-11-09T01:00:00.000Z' },
};

async function goLive(page: ReturnType<typeof renderPage>) {
  await turnOnCameraAndStart();
  await screen.findByText('송출을 연결하는 중입니다.');
  page.emit({ kind: 'connected' });
  await screen.findByText('송출 중입니다. 시청자가 방송을 볼 수 있습니다.');
}

it('publishes the camera with a fresh token', async () => {
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
  expect(screen.queryByRole('button', { name: '카메라 끄기' })).toBeNull();
});

it('ends the broadcast after the streamer confirms, stopping publish and camera', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
    'POST /api/broadcasts/b1/end': ENDED,
  });
  await goLive(page);

  fireEvent.click(screen.getByRole('button', { name: '방송 종료' }));
  expect(
    screen.getByText(
      '방송을 종료할까요? 종료하면 이 방송은 다시 시작할 수 없습니다.',
    ),
  ).toBeDefined();
  expect(page.calls).not.toContain('POST /api/broadcasts/b1/end');

  fireEvent.click(screen.getByRole('button', { name: '종료하기' }));
  const done = await screen.findByText('방송을 종료했습니다.');
  expect(page.calls).toContain('POST /api/broadcasts/b1/end');
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(page.capture.stop).toHaveBeenCalled();
  const endedScreen = within(done.parentElement as HTMLElement);
  expect(
    endedScreen
      .getByRole('link', { name: '시청 화면 보기' })
      .getAttribute('href'),
  ).toBe('/broadcasts/b1');
  expect(
    endedScreen.getByRole('link', { name: '내 방송' }).getAttribute('href'),
  ).toBe('/studio');
  expect(screen.queryByRole('button', { name: '카메라 켜기' })).toBeNull();
  expect(screen.queryByLabelText('미리보기')).toBeNull();
});

it('keeps publishing when the streamer cancels the end', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await goLive(page);
  fireEvent.click(screen.getByRole('button', { name: '방송 종료' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.getByRole('button', { name: '방송 종료' })).toBeDefined();
  expect(page.calls).not.toContain('POST /api/broadcasts/b1/end');
  expect(page.publisher.stop).not.toHaveBeenCalled();
});

it('offers a retry when ending fails, and ends on the retry', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
    'POST /api/broadcasts/b1/end': 502,
  });
  await goLive(page);
  fireEvent.click(screen.getByRole('button', { name: '방송 종료' }));
  fireEvent.click(screen.getByRole('button', { name: '종료하기' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    '방송을 종료하지 못했습니다. 다시 시도하세요.',
  );
  expect(page.publisher.stop).toHaveBeenCalled();

  page.routes['POST /api/broadcasts/b1/end'] = ENDED;
  fireEvent.click(screen.getByRole('button', { name: '다시 종료하기' }));
  expect(await screen.findByText('방송을 종료했습니다.')).toBeDefined();
  expect(
    page.calls.filter((call) => call === 'POST /api/broadcasts/b1/end'),
  ).toHaveLength(2);
  expect(page.capture.stop).toHaveBeenCalled();
});

it('ends the broadcast when the camera is taken away while live', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
    'POST /api/broadcasts/b1/end': ENDED,
  });
  await goLive(page);
  act(() => page.setState({ status: 'ended', reason: 'device-lost' }));
  expect(await screen.findByText('방송을 종료했습니다.')).toBeDefined();
  expect(page.calls).toContain('POST /api/broadcasts/b1/end');
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(
    screen.getByText('카메라나 마이크가 꺼져 방송을 종료했습니다.'),
  ).toBeDefined();
});

it('shows the ended screen when the server ended the broadcast meanwhile', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await goLive(page);
  page.routes['GET /api/broadcasts/b1'] = ENDED;
  page.emit({ kind: 'disconnected' });
  expect(await screen.findByText('방송이 종료되었습니다.')).toBeDefined();
  expect(page.capture.stop).toHaveBeenCalled();
  expect(page.calls).not.toContain('POST /api/broadcasts/b1/end');
});

it('shows the ended screen when the broadcast was deleted while live', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await goLive(page);
  page.routes['GET /api/broadcasts/b1'] = { status: 404, body: {} };
  page.emit({ kind: 'disconnected' });
  expect(await screen.findByText('방송이 종료되었습니다.')).toBeDefined();
  expect(page.capture.stop).toHaveBeenCalled();
});

it('says the connection dropped when the broadcast is still LIVE', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await goLive(page);
  page.routes['GET /api/broadcasts/b1'] = {
    status: 200,
    body: { ...broadcast, status: 'LIVE' },
  };
  page.emit({ kind: 'disconnected' });
  expect((await screen.findByRole('alert')).textContent).toBe(
    '송출 연결이 끊겼습니다. 다시 시작하세요.',
  );
  expect(page.capture.stop).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '방송 시작' })).toBeDefined();
  expect(screen.getByRole('button', { name: '방송 종료' })).toBeDefined();
});

it('lets the streamer end a LIVE broadcast this page is not publishing', async () => {
  const page = renderPage({
    'GET /api/broadcasts/b1': {
      status: 200,
      body: { ...broadcast, status: 'LIVE' },
    },
    'POST /api/broadcasts/b1/end': ENDED,
  });
  expect(
    await screen.findByText(
      '이 방송은 아직 LIVE입니다. 카메라를 켜서 송출을 이어 가거나 방송을 종료하세요.',
    ),
  ).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '방송 종료' }));
  fireEvent.click(screen.getByRole('button', { name: '종료하기' }));
  expect(await screen.findByText('방송을 종료했습니다.')).toBeDefined();
  expect(page.calls).toContain('POST /api/broadcasts/b1/end');
  expect(startWhipPublish).not.toHaveBeenCalled();
});

it('offers no end before the broadcast has started', async () => {
  renderPage({});
  await screen.findByRole('button', { name: '카메라 켜기' });
  expect(screen.queryByRole('button', { name: '방송 종료' })).toBeNull();
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
  expect((await screen.findByRole('alert')).textContent).toBe(
    '송출이 허가되지 않았습니다. 다시 시도하세요.',
  );
  expect(page.capture.stop).not.toHaveBeenCalled();
});

it('drops a connecting publish when the camera is taken away', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await turnOnCameraAndStart();
  await screen.findByText('송출을 연결하는 중입니다.');
  act(() => page.setState({ status: 'ended', reason: 'device-lost' }));
  expect(screen.getByRole('alert').textContent).toBe(
    '카메라나 마이크가 꺼져 송출을 멈췄습니다.',
  );
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(page.calls).not.toContain('POST /api/broadcasts/b1/end');
  expect(screen.getByRole('button', { name: '카메라 켜기' })).toBeDefined();
});

it('stops the publish and the camera, but does not end, when the streamer leaves', async () => {
  const page = renderPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await goLive(page);
  cleanup();
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(page.capture.stop).toHaveBeenCalled();
  expect(page.calls).not.toContain('POST /api/broadcasts/b1/end');
});

it('says an already ENDED broadcast cannot be published again', async () => {
  renderPage({ 'GET /api/broadcasts/b1': ENDED });
  expect(
    await screen.findByText('종료된 방송입니다. 새 방송을 만드세요.'),
  ).toBeDefined();
  expect(screen.queryByRole('button', { name: '카메라 켜기' })).toBeNull();
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
