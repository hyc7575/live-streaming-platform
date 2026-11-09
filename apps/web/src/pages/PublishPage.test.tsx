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
import type {
  AudioLevels,
  PcCapture,
  PcCaptureState,
} from '../capture/pcCapture';
import { PcCaptureError, startPcCapture } from '../capture/pcCapture';
import { currentScreenAudioSupport } from '../capture/screenAudioSupport';
import { startWhipPublish, type PublishEvent } from '../publish/whipPublisher';

vi.mock('../capture/cameraCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/cameraCapture')>()),
  startCameraCapture: vi.fn(),
}));
vi.mock('../capture/pcCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/pcCapture')>()),
  startPcCapture: vi.fn(),
}));
// jsdom has no getDisplayMedia, so by default the page offers the camera
// only, as on a phone.
vi.mock('../capture/screenAudioSupport', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../capture/screenAudioSupport')>();
  return {
    ...actual,
    currentScreenAudioSupport: vi.fn(actual.currentScreenAudioSupport),
  };
});
vi.mock('../publish/whipPublisher', () => ({ startWhipPublish: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.mocked(currentScreenAudioSupport).mockReset();
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

function fakeScreenCapture() {
  let state: PcCaptureState = {
    status: 'live',
    hasScreenAudio: true,
    micMuted: false,
    micLost: false,
    audioRunning: false,
  };
  const listeners = new Set<() => void>();
  const setState = (next: PcCaptureState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const patchLive = (
    patch: Partial<Extract<PcCaptureState, { status: 'live' }>>,
  ) => {
    if (state.status === 'live') setState({ ...state, ...patch });
  };
  const firstScreen = { id: 'screen-1' } as MediaStreamTrack;
  const nextScreen = { id: 'screen-2' } as MediaStreamTrack;
  let video = firstScreen;
  const stream = { getVideoTracks: () => [video] } as unknown as MediaStream;
  const capture = {
    stream,
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resumeAudio: vi.fn(() => Promise.resolve()),
    setMicMuted: vi.fn((micMuted: boolean) => patchLive({ micMuted })),
    readLevels: vi.fn<() => AudioLevels>(() => ({ mic: 0, screen: 0 })),
    reselectScreen: vi.fn(() => {
      video = nextScreen;
      return Promise.resolve();
    }),
    stop: vi.fn(() => setState({ status: 'ended', reason: 'stopped' })),
  } satisfies PcCapture;
  return { capture, setState, patchLive, nextScreen };
}

function renderDesktopPage(api: Record<string, Reply>) {
  vi.mocked(currentScreenAudioSupport).mockReturnValue('supported');
  const screenFake = fakeScreenCapture();
  vi.mocked(startPcCapture).mockResolvedValue(screenFake.capture);
  const page = renderPage(api);
  return { ...page, screen: screenFake };
}

async function shareScreen() {
  fireEvent.click(await screen.findByRole('button', { name: '화면 공유' }));
  await screen.findByRole('button', { name: '방송 시작' });
}

async function shareScreenAndGoLive(
  page: ReturnType<typeof renderDesktopPage>,
) {
  await shareScreen();
  fireEvent.click(screen.getByRole('button', { name: '방송 시작' }));
  await screen.findByText('송출을 연결하는 중입니다.');
  page.emit({ kind: 'connected' });
  await screen.findByText('송출 중입니다. 시청자가 방송을 볼 수 있습니다.');
}

it('offers only the camera where the browser cannot share a screen', async () => {
  renderPage({});
  await screen.findByRole('button', { name: '카메라 켜기' });
  expect(screen.queryByRole('button', { name: '화면 공유' })).toBeNull();
});

it('offers screen sharing first on a desktop browser', async () => {
  renderDesktopPage({});
  const share = await screen.findByRole('button', { name: '화면 공유' });
  const camera = screen.getByRole('button', { name: '카메라 켜기' });
  expect(
    share.compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('publishes the shared screen, resuming the mixer inside the start click', async () => {
  const page = renderDesktopPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await shareScreen();
  expect(page.screen.capture.resumeAudio).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '방송 시작' }));
  expect(page.screen.capture.resumeAudio).toHaveBeenCalledTimes(1);
  await screen.findByText('송출을 연결하는 중입니다.');
  expect(startWhipPublish).toHaveBeenCalledWith(
    page.screen.capture.stream,
    PUBLISH_URL,
    expect.any(Function),
  );
});

it('ends the broadcast when the screen share is stopped while live', async () => {
  const page = renderDesktopPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
    'POST /api/broadcasts/b1/end': ENDED,
  });
  await shareScreenAndGoLive(page);
  act(() => page.screen.setState({ status: 'ended', reason: 'share-stopped' }));
  expect(await screen.findByText('방송을 종료했습니다.')).toBeDefined();
  expect(page.calls).toContain('POST /api/broadcasts/b1/end');
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(
    screen.getByText('화면 공유를 중지해 방송을 종료했습니다.'),
  ).toBeDefined();
});

it('drops a connecting publish, without ending, when the screen share is stopped', async () => {
  const page = renderDesktopPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await shareScreen();
  fireEvent.click(screen.getByRole('button', { name: '방송 시작' }));
  await screen.findByText('송출을 연결하는 중입니다.');
  act(() => page.screen.setState({ status: 'ended', reason: 'share-stopped' }));
  expect(screen.getByText('화면 공유가 중지되었습니다.')).toBeDefined();
  expect(page.publisher.stop).toHaveBeenCalled();
  expect(page.calls).not.toContain('POST /api/broadcasts/b1/end');
  expect(screen.getByRole('button', { name: '화면 공유' })).toBeDefined();
});

it('says the share stopped before going live, without ending', async () => {
  const page = renderDesktopPage({});
  await shareScreen();
  act(() => page.screen.setState({ status: 'ended', reason: 'share-stopped' }));
  expect(screen.getByRole('alert').textContent).toBe(
    '화면 공유가 중지되었습니다.',
  );
  expect(page.calls).not.toContain('POST /api/broadcasts/b1/end');
});

it('mutes and unmutes the mic', async () => {
  const page = renderDesktopPage({});
  await shareScreen();
  fireEvent.click(screen.getByRole('button', { name: '마이크 끄기' }));
  expect(page.screen.capture.setMicMuted).toHaveBeenLastCalledWith(true);
  const unmute = screen.getByRole('button', { name: '마이크 켜기' });
  expect(unmute.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(unmute);
  expect(page.screen.capture.setMicMuted).toHaveBeenLastCalledWith(false);
});

it('sends the newly picked screen while live', async () => {
  const page = renderDesktopPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await shareScreenAndGoLive(page);
  fireEvent.click(screen.getByRole('button', { name: '다시 선택' }));
  await vi.waitFor(() =>
    expect(page.publisher.replaceTrack).toHaveBeenCalledWith(
      page.screen.nextScreen,
    ),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps the current screen when the streamer cancels reselecting', async () => {
  const page = renderDesktopPage({});
  await shareScreen();
  page.screen.capture.reselectScreen.mockRejectedValueOnce(
    new PcCaptureError('screen', new DOMException('', 'NotAllowedError')),
  );
  fireEvent.click(screen.getByRole('button', { name: '다시 선택' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    '화면을 바꾸지 않았습니다.',
  );
  expect(page.screen.capture.stop).not.toHaveBeenCalled();
});

it('offers to start over when the mic is lost before going live, not while live', async () => {
  const page = renderDesktopPage({
    'POST /api/broadcasts/b1/publish-token': TOKEN_OK,
  });
  await shareScreen();
  act(() => page.screen.patchLive({ micLost: true }));
  expect(screen.getByRole('button', { name: '처음부터 다시' })).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: '방송 시작' }));
  await screen.findByText('송출을 연결하는 중입니다.');
  page.emit({ kind: 'connected' });
  await screen.findByText('송출 중입니다. 시청자가 방송을 볼 수 있습니다.');
  expect(screen.queryByRole('button', { name: '처음부터 다시' })).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe(
    '마이크 연결이 끊겼습니다. 지금은 화면 소리만 송출합니다.',
  );
});

it('starts over with a new screen capture when asked after the mic is lost', async () => {
  const page = renderDesktopPage({});
  await shareScreen();
  act(() => page.screen.patchLive({ micLost: true }));
  fireEvent.click(screen.getByRole('button', { name: '처음부터 다시' }));
  expect(page.screen.capture.stop).toHaveBeenCalled();
  await vi.waitFor(() => expect(startPcCapture).toHaveBeenCalledTimes(2));
});

it('stops a screen capture that arrives after the streamer left', async () => {
  vi.mocked(currentScreenAudioSupport).mockReturnValue('supported');
  renderPage({});
  const late = fakeScreenCapture();
  let resolve: (capture: PcCapture) => void = () => {};
  vi.mocked(startPcCapture).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '화면 공유' }));
  cleanup();
  resolve(late.capture);
  await act(() => Promise.resolve());
  expect(late.capture.stop).toHaveBeenCalled();
});

it('warns before sharing on a browser that cannot share screen audio', async () => {
  vi.mocked(currentScreenAudioSupport).mockReturnValue('no-screen-audio');
  renderPage({});
  expect((await screen.findByRole('alert')).textContent).toContain(
    '이 브라우저는 화면 소리를 공유하지 못합니다',
  );
});
