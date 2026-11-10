import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECT_TIMEOUT_MS, startWhipPublish } from './whipPublisher';

interface Callbacks {
  connected?: () => void;
  connectionClosed?: (type: string) => void;
  iceStateChange?: (state: RTCIceConnectionState) => void;
  error?: (error: unknown) => void;
}

const RESOURCE_URL = 'http://localhost/app/b1/whip-resource';

interface FakeTrack {
  kind: 'audio' | 'video';
  readyState: 'live' | 'ended';
  stop: () => void;
  clone: () => FakeTrack;
}

interface FakeSender {
  track: FakeTrack | null;
  replaceTrack: (track: FakeTrack | null) => Promise<void>;
}

interface FakeTransceiver {
  sender: FakeSender;
  receiver: { track: { kind: FakeTrack['kind'] } };
}

class FakeMediaStream {
  private tracks: FakeTrack[];
  constructor(tracks: FakeTrack[]) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return [...this.tracks];
  }
  addTrack(track: FakeTrack) {
    this.tracks.push(track);
  }
  removeTrack(track: FakeTrack) {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}

const kit = vi.hoisted(() => {
  const callbacks: Callbacks = {};
  return {
    callbacks,
    remove: vi.fn(),
    startStreaming: vi.fn(),
    sent: null as FakeMediaStream | null,
    senders: [] as FakeSender[],
    transceivers: [] as FakeTransceiver[],
  };
});

// Like OvenLiveKit, the connection takes the stream's tracks as they are
// when streaming starts.
vi.mock('ovenlivekit', () => ({
  default: {
    create: (options: { callbacks: Callbacks }) => {
      kit.callbacks = options.callbacks;
      let peerConnection: {
        getTransceivers: () => FakeTransceiver[];
      } | null = null;
      return {
        setMediaStream: (stream: FakeMediaStream) => {
          kit.sent = stream;
          return Promise.resolve(stream);
        },
        startStreaming: (...args: unknown[]) => {
          kit.transceivers = (kit.sent?.getTracks() ?? []).map((track) => {
            const sender: FakeSender = {
              track,
              replaceTrack: (next) => {
                sender.track = next;
                return Promise.resolve();
              },
            };
            return { sender, receiver: { track: { kind: track.kind } } };
          });
          kit.senders = kit.transceivers.map((t) => t.sender);
          peerConnection = { getTransceivers: () => kit.transceivers };
          kit.startStreaming(...args);
        },
        remove: kit.remove,
        resourceUrl: RESOURCE_URL,
        get peerConnection() {
          return peerConnection;
        },
      };
    },
  },
}));

function fakeTrack(kind: FakeTrack['kind'], clones: FakeTrack[]): FakeTrack {
  const track: FakeTrack = {
    kind,
    readyState: 'live',
    stop: () => {
      track.readyState = 'ended';
    },
    clone: () => {
      const copy = fakeTrack(kind, clones);
      clones.push(copy);
      return copy;
    },
  };
  return track;
}

function fakeStream() {
  const clones: FakeTrack[] = [];
  const originals = [fakeTrack('video', clones), fakeTrack('audio', clones)];
  const stream = new FakeMediaStream(originals) as unknown as MediaStream;
  return { stream, originals, clones };
}

const asTrack = (track: FakeTrack) => track as unknown as MediaStreamTrack;

function videoSender() {
  return kit.senders.find((sender) => sender.track?.kind === 'video');
}

beforeEach(() => {
  kit.sent = null;
  kit.senders = [];
  kit.transceivers = [];
  vi.stubGlobal('MediaStream', FakeMediaStream);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response())),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('stops every track it sent on stop, and leaves the caller’s tracks running', async () => {
  const { stream, originals, clones } = fakeStream();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', vi.fn());
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());
  kit.callbacks.connected?.();

  publisher.stop();
  expect(clones).toHaveLength(2);
  expect(clones.map((t) => t.readyState)).toEqual(['ended', 'ended']);
  expect(originals.map((t) => t.readyState)).toEqual(['live', 'live']);
  expect(kit.remove).toHaveBeenCalledTimes(1);
});

it('stops its tracks when the connection drops, and reports it once', async () => {
  const { stream, originals, clones } = fakeStream();
  const onEvent = vi.fn();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', onEvent);
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());
  kit.callbacks.connected?.();

  kit.callbacks.connectionClosed?.('ice');
  publisher.stop();
  expect(onEvent.mock.calls).toEqual([
    [{ kind: 'connected' }],
    [{ kind: 'disconnected' }],
  ]);
  expect(clones.map((t) => t.readyState)).toEqual(['ended', 'ended']);
  expect(originals.map((t) => t.readyState)).toEqual(['live', 'live']);
});

it('on pagehide, deletes the WHIP resource with a request that outlives the page', async () => {
  const { stream, originals, clones } = fakeStream();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', vi.fn());
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());
  kit.callbacks.connected?.();

  window.dispatchEvent(new Event('pagehide'));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(RESOURCE_URL, {
    method: 'DELETE',
    keepalive: true,
  });
  expect(clones.map((t) => t.readyState)).toEqual(['ended', 'ended']);
  expect(originals.map((t) => t.readyState)).toEqual(['live', 'live']);
  expect(kit.remove).toHaveBeenCalledTimes(1);

  publisher.stop();
  window.dispatchEvent(new Event('pagehide'));
  expect(kit.remove).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('sends nothing on pagehide after it was stopped', async () => {
  const { stream } = fakeStream();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', vi.fn());
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());
  kit.callbacks.connected?.();

  publisher.stop();
  window.dispatchEvent(new Event('pagehide'));
  expect(fetch).not.toHaveBeenCalled();
  expect(kit.remove).toHaveBeenCalledTimes(1);
});

it('sends a clone of a replacement track and stops the clone it replaced', async () => {
  const { stream, originals, clones } = fakeStream();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', vi.fn());
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());
  kit.callbacks.connected?.();
  const [firstVideo] = clones;
  expect(videoSender()?.track).toBe(firstVideo);

  const otherScreen = fakeTrack('video', clones);
  publisher.replaceTrack(asTrack(otherScreen));
  const sentNow = videoSender()?.track;
  expect(sentNow).not.toBe(otherScreen);
  expect(clones).toContain(sentNow);
  expect(sentNow?.readyState).toBe('live');
  expect(firstVideo?.readyState).toBe('ended');
  expect(otherScreen.readyState).toBe('live');
  expect(originals.map((t) => t.readyState)).toEqual(['live', 'live']);
});

it('stops replacement clones too when stopped', async () => {
  const { stream, originals, clones } = fakeStream();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', vi.fn());
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());
  const otherScreen = fakeTrack('video', clones);
  publisher.replaceTrack(asTrack(otherScreen));
  publisher.replaceTrack(asTrack(otherScreen));

  publisher.stop();
  expect(clones).toHaveLength(4);
  expect(clones.map((t) => t.readyState)).toEqual([
    'ended',
    'ended',
    'ended',
    'ended',
  ]);
  expect(otherScreen.readyState).toBe('live');
  expect(originals.map((t) => t.readyState)).toEqual(['live', 'live']);

  publisher.replaceTrack(asTrack(otherScreen));
  expect(clones).toHaveLength(4);
});

it('sends a track replaced before the connection is built', async () => {
  const { stream, clones } = fakeStream();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', vi.fn());
  const otherScreen = fakeTrack('video', clones);
  publisher.replaceTrack(asTrack(otherScreen));
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());

  const sentVideo = videoSender()?.track;
  expect(sentVideo).toBe(clones[2]);
  expect(sentVideo?.readyState).toBe('live');
  expect(clones[0]?.readyState).toBe('ended');
  expect(kit.senders).toHaveLength(2);
});

it('releases the sent camera before a switch and sends the next one after it', async () => {
  const { stream, originals, clones } = fakeStream();
  const publisher = startWhipPublish(stream, '/app/b1?direction=whip', vi.fn());
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());
  kit.callbacks.connected?.();
  const [frontClone] = clones;
  const videoTransceiver = kit.transceivers.find(
    (t) => t.receiver.track.kind === 'video',
  );

  publisher.releaseTrack('video');
  expect(frontClone?.readyState, 'the camera is free for the switch').toBe(
    'ended',
  );
  expect(videoTransceiver?.sender.track).toBeNull();

  const rear = fakeTrack('video', clones);
  publisher.replaceTrack(asTrack(rear));
  const sentNow = videoTransceiver?.sender.track;
  expect(clones).toContain(sentNow);
  expect(sentNow?.readyState).toBe('live');
  expect(kit.sent?.getTracks().filter((t) => t.kind === 'video')).toEqual([
    sentNow,
  ]);
  expect(originals[1]?.readyState).toBe('live');

  publisher.stop();
  expect(sentNow?.readyState).toBe('ended');
});

it('reports ICE failed as a failed publish with no status, and cleans up', async () => {
  const { stream, clones } = fakeStream();
  const onEvent = vi.fn();
  startWhipPublish(stream, '/app/b1?direction=whip', onEvent);
  await vi.waitFor(() => expect(kit.startStreaming).toHaveBeenCalled());

  kit.callbacks.iceStateChange?.('checking');
  expect(onEvent).not.toHaveBeenCalled();
  kit.callbacks.iceStateChange?.('failed');
  expect(onEvent.mock.calls).toEqual([[{ kind: 'failed', status: null }]]);
  expect(kit.remove).toHaveBeenCalledTimes(1);
  expect(clones.map((t) => t.readyState)).toEqual(['ended', 'ended']);
});

describe('when ICE never connects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`gives up ${CONNECT_TIMEOUT_MS / 1000} s after it started streaming`, async () => {
    const { stream, clones } = fakeStream();
    const onEvent = vi.fn();
    startWhipPublish(stream, '/app/b1?direction=whip', onEvent);
    // vi.waitFor would move the fake clock while it polls.
    await vi.advanceTimersByTimeAsync(0);
    expect(kit.startStreaming).toHaveBeenCalled();

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1);
    expect(onEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEvent.mock.calls).toEqual([[{ kind: 'failed', status: null }]]);
    expect(kit.remove).toHaveBeenCalledTimes(1);
    expect(clones.map((t) => t.readyState)).toEqual(['ended', 'ended']);
  });

  it('keeps a connection that connected in time', async () => {
    const { stream } = fakeStream();
    const onEvent = vi.fn();
    startWhipPublish(stream, '/app/b1?direction=whip', onEvent);
    // vi.waitFor would move the fake clock while it polls.
    await vi.advanceTimersByTimeAsync(0);
    expect(kit.startStreaming).toHaveBeenCalled();

    kit.callbacks.connected?.();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS * 2);
    expect(onEvent.mock.calls).toEqual([[{ kind: 'connected' }]]);
    expect(kit.remove).not.toHaveBeenCalled();
  });

  it('sets no timer for a publish stopped before it connected', async () => {
    const { stream } = fakeStream();
    const onEvent = vi.fn();
    const publisher = startWhipPublish(
      stream,
      '/app/b1?direction=whip',
      onEvent,
    );
    // vi.waitFor would move the fake clock while it polls.
    await vi.advanceTimersByTimeAsync(0);
    expect(kit.startStreaming).toHaveBeenCalled();

    publisher.stop();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS * 2);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
