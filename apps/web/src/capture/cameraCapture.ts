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
  /** 카메라 영상 트랙 하나와 마이크 오디오 트랙 하나다. 송출자는 정확히 이것을 보낸다. */
  readonly stream: MediaStream;
  getState: () => CameraCaptureState;
  subscribe: (listener: () => void) => () => void;
  /** `stream`의 영상 트랙을 바꾼다. 오디오 트랙은 그대로 둔다. */
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
  // 보안 컨텍스트 밖(예: 휴대폰의 http://<LAN IP>)에서는 getUserMedia가 undefined다.
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

    // 휴대폰은 대개 카메라 두 개를 동시에 열지 못하므로, 지금 카메라를 먼저 놓는다.
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
