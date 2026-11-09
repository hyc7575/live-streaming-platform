import {
  CameraCaptureError,
  startCameraCapture,
  type CameraCapture,
  type CameraCaptureEndReason,
  type CameraCaptureFailure,
} from '../capture/cameraCapture';
import {
  PcCaptureError,
  startPcCapture,
  type PcCapture,
  type PcCaptureEndReason,
} from '../capture/pcCapture';
import type { ScreenAudioSupport } from '../capture/screenAudioSupport';

export type CaptureSource = 'screen' | 'camera';

export type ActiveCapture =
  | { source: 'screen'; capture: PcCapture }
  | { source: 'camera'; capture: CameraCapture };

export type CaptureSlot =
  | { kind: 'off'; notice: string | null }
  | { kind: 'acquiring'; source: CaptureSource }
  | { kind: 'failed'; message: string }
  | ({ kind: 'on' } & ActiveCapture);

export type CaptureEndReason = PcCaptureEndReason | CameraCaptureEndReason;

interface SourceSpec {
  startLabel: string;
  stopLabel: string;
  acquiringText: string;
  start: () => Promise<ActiveCapture>;
  failureMessage: (error: unknown) => string;
  /** Status texts for a page that offers this source first. */
  offer: { placeholder: string; onAirWithoutCapture: string };
}

const CAMERA_FAILURE: Record<CameraCaptureFailure, string> = {
  denied:
    '카메라·마이크 권한이 꺼져 있습니다. 주소창의 사이트 설정에서 허용한 뒤 다시 시도하세요.',
  'not-found': '카메라나 마이크를 찾지 못했습니다.',
  'in-use':
    '다른 앱이 카메라나 마이크를 쓰고 있습니다. 그 앱을 닫고 다시 시도하세요.',
  insecure:
    '이 주소에서는 카메라를 쓸 수 없습니다. https:// 로 시작하는 주소로 여세요.',
  unknown: '카메라를 켜지 못했습니다. 다시 시도하세요.',
};

export const CAPTURE_SOURCES: Record<CaptureSource, SourceSpec> = {
  screen: {
    startLabel: '화면 공유',
    stopLabel: '화면 공유 끄기',
    acquiringText: '공유할 화면을 고르세요.',
    start: async () => ({ source: 'screen', capture: await startPcCapture() }),
    failureMessage: (error) =>
      error instanceof PcCaptureError && error.source === 'mic'
        ? '마이크를 쓸 수 없습니다. 브라우저의 마이크 권한을 확인하세요.'
        : '화면을 선택하지 않았습니다. 다시 선택하세요.',
    offer: {
      placeholder: '화면을 공유하거나 카메라를 켜면 미리보기가 보입니다.',
      onAirWithoutCapture:
        '이 방송은 아직 LIVE입니다. 화면 공유나 카메라로 송출을 이어 가거나 방송을 종료하세요.',
    },
  },
  camera: {
    startLabel: '카메라 켜기',
    stopLabel: '카메라 끄기',
    acquiringText: '카메라를 켜는 중입니다.',
    start: async () => ({
      source: 'camera',
      capture: await startCameraCapture(),
    }),
    failureMessage: (error) =>
      CAMERA_FAILURE[
        error instanceof CameraCaptureError ? error.reason : 'unknown'
      ],
    offer: {
      placeholder: '카메라를 켜면 미리보기가 보입니다.',
      onAirWithoutCapture:
        '이 방송은 아직 LIVE입니다. 카메라를 켜서 송출을 이어 가거나 방송을 종료하세요.',
    },
  },
};

/** The first source is the one the page suggests. */
export function offeredSources(support: ScreenAudioSupport): CaptureSource[] {
  return support === 'no-screen-capture' ? ['camera'] : ['screen', 'camera'];
}

const END_NOTICES: Record<
  Exclude<CaptureEndReason, 'stopped'>,
  { live: string; notLive: string }
> = {
  'device-lost': {
    live: '카메라나 마이크가 꺼져 방송을 종료했습니다.',
    notLive: '카메라나 마이크가 꺼져 송출을 멈췄습니다.',
  },
  'share-stopped': {
    live: '화면 공유를 중지해 방송을 종료했습니다.',
    notLive: '화면 공유가 중지되었습니다.',
  },
};

export function endNotice(
  reason: CaptureEndReason,
  live: boolean,
): string | null {
  if (reason === 'stopped') return null;
  const notice = END_NOTICES[reason];
  return live ? notice.live : notice.notLive;
}
