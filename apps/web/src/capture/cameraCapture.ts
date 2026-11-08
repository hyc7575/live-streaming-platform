import { holdScreenWakeLock, type WakeLockStatus } from './screenWakeLock';

export type { WakeLockStatus };

export type CameraFacing = 'user' | 'environment';

export type CameraCaptureEndReason = 'stopped' | 'device-lost';

export type CameraCaptureState =
  | {
      status: 'live';
      facing: CameraFacing;
      canSwitchCamera: boolean;
      switching: boolean;
      wakeLock: WakeLockStatus;
    }
  | { status: 'ended'; reason: CameraCaptureEndReason };

export interface CameraCapture {
  /** One camera video track plus one mic audio track. A publisher sends exactly this. */
  readonly stream: MediaStream;
  getState: () => CameraCaptureState;
  subscribe: (listener: () => void) => () => void;
  /** Replaces the video track in `stream`; the audio track stays the same. */
  switchCamera: () => Promise<void>;
  stop: () => void;
}

export type CameraCaptureFailure =
  'denied' | 'not-found' | 'in-use' | 'insecure' | 'unknown';

const FAILURE_BY_ERROR_NAME: Record<string, CameraCaptureFailure> = {
  NotAllowedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'not-found',
  OverconstrainedError: 'not-found',
  NotReadableError: 'in-use',
};

export class CameraCaptureError extends Error {
  constructor(
    readonly reason: CameraCaptureFailure,
    cause?: unknown,
  ) {
    super(`camera capture failed: ${reason}`, { cause });
    this.name = 'CameraCaptureError';
  }
}

function toCaptureError(cause: unknown) {
  const reason =
    (cause instanceof DOMException && FAILURE_BY_ERROR_NAME[cause.name]) ||
    'unknown';
  return new CameraCaptureError(reason, cause);
}

function opposite(facing: CameraFacing): CameraFacing {
  return facing === 'user' ? 'environment' : 'user';
}

function facingOf(track: MediaStreamTrack, requested: CameraFacing) {
  const reported = track.getSettings().facingMode;
  return reported === 'user' || reported === 'environment'
    ? reported
    : requested;
}

async function getCameraTrack(facingMode: ConstrainDOMString) {
  const media = await navigator.mediaDevices.getUserMedia({
    video: { facingMode },
  });
  return media.getVideoTracks()[0];
}

export async function startCameraCapture(): Promise<CameraCapture> {
  // getUserMedia is undefined outside a secure context (e.g. http://<LAN IP> on a phone).
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraCaptureError('insecure');
  }
  let media: MediaStream;
  try {
    media = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true,
    });
  } catch (cause) {
    throw toCaptureError(cause);
  }
  const devices = await navigator.mediaDevices
    .enumerateDevices()
    .catch(() => []);
  const cameraCount = devices.filter((d) => d.kind === 'videoinput').length;
  return createCameraCapture(media, cameraCount > 1);
}

function createCameraCapture(
  media: MediaStream,
  canSwitchCamera: boolean,
): CameraCapture {
  const [mic] = media.getAudioTracks();
  let camera = media.getVideoTracks()[0];
  const stream = new MediaStream([camera, mic]);

  let state: CameraCaptureState = {
    status: 'live',
    facing: facingOf(camera, 'user'),
    canSwitchCamera,
    switching: false,
    wakeLock: 'pending',
  };
  const listeners = new Set<() => void>();

  function setState(next: CameraCaptureState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function patchLive(
    patch: Partial<Extract<CameraCaptureState, { status: 'live' }>>,
  ) {
    if (state.status === 'live') setState({ ...state, ...patch });
  }

  let cameraWatch = watchEnded(camera);
  const micWatch = watchEnded(mic);

  function watchEnded(track: MediaStreamTrack) {
    const watch = new AbortController();
    track.addEventListener('ended', () => end('device-lost'), {
      signal: watch.signal,
    });
    return watch;
  }

  const releaseWakeLock = holdScreenWakeLock((wakeLock) =>
    patchLive({ wakeLock }),
  );

  function end(reason: CameraCaptureEndReason) {
    if (state.status === 'ended') return;
    releaseWakeLock();
    cameraWatch.abort();
    micWatch.abort();
    camera.stop();
    mic.stop();
    setState({ status: 'ended', reason });
  }

  async function switchCamera() {
    if (state.status !== 'live' || state.switching || !state.canSwitchCamera)
      return;
    const from = state.facing;
    const to = opposite(from);
    patchLive({ switching: true });

    // Phones usually cannot open two cameras at once, so release the current one first.
    cameraWatch.abort();
    stream.removeTrack(camera);
    camera.stop();

    let next: MediaStreamTrack;
    let failure: CameraCaptureError | null = null;
    try {
      next = await getCameraTrack({ exact: to });
    } catch (cause) {
      failure = toCaptureError(cause);
      try {
        next = await getCameraTrack(from);
      } catch {
        end('device-lost');
        throw failure;
      }
    }

    if (state.status !== 'live') {
      next.stop();
      return;
    }
    camera = next;
    cameraWatch = watchEnded(camera);
    stream.addTrack(camera);
    patchLive({
      facing: facingOf(camera, failure ? from : to),
      switching: false,
    });
    if (failure) throw failure;
  }

  return {
    stream,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    switchCamera,
    stop: () => end('stopped'),
  };
}
