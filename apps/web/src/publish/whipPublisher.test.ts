import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startWhipPublish } from './whipPublisher';

interface Callbacks {
  connected?: () => void;
  connectionClosed?: (type: string) => void;
  error?: (error: unknown) => void;
}

const RESOURCE_URL = 'http://localhost/app/b1/whip-resource';

const kit = vi.hoisted(() => {
  const callbacks: Callbacks = {};
  return { callbacks, remove: vi.fn(), startStreaming: vi.fn() };
});

vi.mock('ovenlivekit', () => ({
  default: {
    create: (options: { callbacks: Callbacks }) => {
      kit.callbacks = options.callbacks;
      return {
        setMediaStream: (stream: MediaStream) => Promise.resolve(stream),
        startStreaming: kit.startStreaming,
        remove: kit.remove,
        resourceUrl: RESOURCE_URL,
      };
    },
  },
}));

interface FakeTrack {
  readyState: 'live' | 'ended';
  stop: () => void;
  clone: () => FakeTrack;
}

function fakeTrack(clones: FakeTrack[]): FakeTrack {
  const track: FakeTrack = {
    readyState: 'live',
    stop: () => {
      track.readyState = 'ended';
    },
    clone: () => {
      const copy = fakeTrack(clones);
      clones.push(copy);
      return copy;
    },
  };
  return track;
}

function fakeStream() {
  const clones: FakeTrack[] = [];
  const originals = [fakeTrack(clones), fakeTrack(clones)];
  const stream = { getTracks: () => originals } as unknown as MediaStream;
  return { stream, originals, clones };
}

beforeEach(() => {
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(readonly tracks: unknown[]) {}
    },
  );
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
