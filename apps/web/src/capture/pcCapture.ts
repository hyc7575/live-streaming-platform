export type PcCaptureEndReason = 'share-stopped' | 'stopped';

export type PcCaptureState =
  | {
      status: 'live';
      hasScreenAudio: boolean;
      micMuted: boolean;
      /** 마이크 장치가 사라졌다(뽑혔거나 OS가 권한을 회수했다). */
      micLost: boolean;
      audioRunning: boolean;
    }
  | { status: 'ended'; reason: PcCaptureEndReason };

export interface AudioLevels {
  mic: number;
  screen: number | null;
}

export interface PcCapture {
  /** 영상 트랙 하나와 섞인 오디오 트랙 하나다. 송출자는 정확히 이것을 보낸다. */
  readonly stream: MediaStream;
  getState: () => PcCaptureState;
  subscribe: (listener: () => void) => () => void;
  /** "방송 시작" 클릭 핸들러 안에서 동기로 호출한다. */
  resumeAudio: () => Promise<void>;
  setMicMuted: (muted: boolean) => void;
  /** RMS 0..1. `mic`은 음소거 gain을 거친 뒤에 잰다. */
  readLevels: () => AudioLevels;
  /** `stream`의 영상 트랙을 바꾼다. 섞인 오디오 트랙은 그대로 둔다. */
  reselectScreen: () => Promise<void>;
  stop: () => void;
}

export class PcCaptureError extends Error {
  constructor(
    readonly source: 'screen' | 'mic',
    cause: unknown,
  ) {
    super(`${source} capture failed`, { cause });
    this.name = 'PcCaptureError';
  }
}

// TypeScript의 DOM lib은 아직 Chrome의 systemAudio, selfBrowserSurface 옵션을 선언하지 않는다.
const DISPLAY_OPTIONS: DisplayMediaStreamOptions & {
  systemAudio: 'include' | 'exclude';
  selfBrowserSurface: 'include' | 'exclude';
} = {
  video: true,
  audio: true,
  systemAudio: 'include',
  selfBrowserSurface: 'exclude',
};

async function getDisplay(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getDisplayMedia(DISPLAY_OPTIONS);
  } catch (cause) {
    throw new PcCaptureError('screen', cause);
  }
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

function rms(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  return Math.sqrt(sum / buffer.length);
}

export async function startPcCapture(): Promise<PcCapture> {
  const display = await getDisplay();
  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (cause) {
    stopTracks(display);
    throw new PcCaptureError('mic', cause);
  }
  return createPcCapture(display, mic);
}

function createPcCapture(firstDisplay: MediaStream, mic: MediaStream) {
  const ctx = new AudioContext();
  const destination = ctx.createMediaStreamDestination();
  const micGain = ctx.createGain();
  const micAnalyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(mic).connect(micGain);
  micGain.connect(micAnalyser);
  micGain.connect(destination);

  const micBuffer = new Float32Array(micAnalyser.fftSize);
  const [mixedTrack] = destination.stream.getAudioTracks();

  let display = firstDisplay;
  let screen = attachScreen(display);
  const stream = new MediaStream([display.getVideoTracks()[0], mixedTrack]);

  let state: PcCaptureState = {
    status: 'live',
    hasScreenAudio: screen.analyser !== null,
    micMuted: false,
    micLost: false,
    audioRunning: ctx.state === 'running',
  };
  const listeners = new Set<() => void>();

  function setState(next: PcCaptureState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function attachScreen(source: MediaStream) {
    const watch = new AbortController();
    source
      .getVideoTracks()[0]
      .addEventListener('ended', () => end('share-stopped'), {
        signal: watch.signal,
      });
    if (source.getAudioTracks().length === 0) {
      return { watch, node: null, analyser: null, buffer: null };
    }
    const node = ctx.createMediaStreamSource(source);
    const analyser = ctx.createAnalyser();
    node.connect(analyser);
    node.connect(destination);
    return {
      watch,
      node,
      analyser,
      buffer: new Float32Array(analyser.fftSize),
    };
  }

  function detachScreen() {
    screen.watch.abort();
    screen.node?.disconnect();
    stopTracks(display);
  }

  function end(reason: PcCaptureEndReason) {
    if (state.status === 'ended') return;
    detachScreen();
    stopTracks(mic);
    mixedTrack.stop();
    void ctx.close();
    setState({ status: 'ended', reason });
  }

  mic.getAudioTracks()[0].addEventListener('ended', () => {
    if (state.status !== 'live') return;
    setState({ ...state, micLost: true });
  });

  ctx.addEventListener('statechange', () => {
    if (state.status !== 'live') return;
    setState({ ...state, audioRunning: ctx.state === 'running' });
  });

  const capture: PcCapture = {
    stream,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resumeAudio: () => ctx.resume(),
    setMicMuted(muted) {
      if (state.status !== 'live') return;
      micGain.gain.value = muted ? 0 : 1;
      setState({ ...state, micMuted: muted });
    },
    readLevels() {
      if (state.status !== 'live') return { mic: 0, screen: null };
      return {
        mic: rms(micAnalyser, micBuffer),
        screen:
          screen.analyser && screen.buffer
            ? rms(screen.analyser, screen.buffer)
            : null,
      };
    },
    async reselectScreen() {
      if (state.status !== 'live') return;
      const next = await getDisplay();
      if (state.status !== 'live') {
        stopTracks(next);
        return;
      }
      stream.removeTrack(display.getVideoTracks()[0]);
      detachScreen();
      display = next;
      screen = attachScreen(display);
      stream.addTrack(display.getVideoTracks()[0]);
      setState({ ...state, hasScreenAudio: screen.analyser !== null });
    },
    stop: () => end('stopped'),
  };
  return capture;
}
