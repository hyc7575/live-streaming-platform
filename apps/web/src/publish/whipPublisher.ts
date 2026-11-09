import OvenLiveKit from 'ovenlivekit';

export type PublishEvent =
  | { kind: 'connected' }
  // `status` is OME's HTTP answer to the WHIP offer when there was one. A 401
  // is the Admission Webhook saying no.
  | { kind: 'failed'; status: number | null }
  | { kind: 'disconnected' };

export interface WhipPublisher {
  stop: () => void;
}

// PRD §7.2: H.264 is pinned because a VP8 publish reaches LL-HLS as audio
// only, and `iceTransportPolicy: 'all'` keeps OvenLiveKit from forcing TURN
// once OME advertises it for `transport=all`.
const CONNECTION_CONFIG = {
  iceTransportPolicy: 'all',
  preferredVideoFormat: 'H264',
} as const;

function statusOf(error: unknown): number | null {
  const match =
    typeof error === 'string' ? /Failed to fetch (\d{3})/.exec(error) : null;
  return match ? Number(match[1]) : null;
}

// Sends clones of the stream's tracks and owns them: the caller's tracks
// must outlive a failed attempt (the preview keeps running), and a clone left
// live would keep the camera light on after the publish is over.
// Emits at most one event after `connected`, then cleans up on its own.
export function startWhipPublish(
  stream: MediaStream,
  publishPath: string,
  onEvent: (event: PublishEvent) => void,
): WhipPublisher {
  const tracks = stream.getTracks().map((track) => track.clone());
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    kit.remove();
    for (const track of tracks) track.stop();
  };
  const report = (event: Exclude<PublishEvent, { kind: 'connected' }>) => {
    if (done) return;
    finish();
    onEvent(event);
  };
  const kit = OvenLiveKit.create({
    callbacks: {
      connected: () => {
        if (!done) onEvent({ kind: 'connected' });
      },
      connectionClosed: (type) => {
        if (type !== 'user') report({ kind: 'disconnected' });
      },
      error: (error) => report({ kind: 'failed', status: statusOf(error) }),
    },
  });
  kit.setMediaStream(new MediaStream(tracks)).then(
    () => {
      if (done) return;
      kit.startStreaming(
        new URL(publishPath, window.location.origin).toString(),
        CONNECTION_CONFIG,
      );
    },
    // Already reported through the `error` callback.
    () => {},
  );
  return { stop: finish };
}
