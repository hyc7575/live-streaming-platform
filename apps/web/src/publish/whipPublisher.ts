import OvenLiveKit from 'ovenlivekit';

export type PublishEvent =
  | { kind: 'connected' }
  // `status`는 WHIP offer에 대한 OME의 HTTP 응답이다(응답이 있었다면). 401은
  // Admission Webhook이 거절한 것이다. 응답이 전혀 없으면 `null`이다. UDP와 TURN을
  // 모두 막은 네트워크에서 ICE가 실패하거나 끝내 연결되지 않을 때가 그렇다.
  | { kind: 'failed'; status: number | null }
  | { kind: 'disconnected' };

type TrackKind = 'audio' | 'video';

export interface WhipPublisher {
  /**
   * 같은 종류의 트랙 대신 `track`의 복제본을 보낸다. 스트리머가
   * 다른 화면이나 카메라를 고를 때 쓴다.
   */
  replaceTrack: (track: MediaStreamTrack) => void;
  /**
   * 다음 `replaceTrack` 전까지 `kind` 트랙을 보내지 않는다. 보내던 복제본도
   * 캡처의 원래 트랙처럼 카메라를 붙잡고, 대부분의 휴대폰은 카메라를
   * 한 번에 하나만 연다.
   */
  releaseTrack: (kind: TrackKind) => void;
  stop: () => void;
}

// PRD §7.2: VP8로 송출하면 LL-HLS에 오디오만 도착하므로 H.264로 고정한다.
// `iceTransportPolicy: 'all'`은 OME가 `transport=all`용으로 TURN을 알린 뒤에도
// OvenLiveKit이 TURN을 강제하지 않게 한다.
const CONNECTION_CONFIG = {
  iceTransportPolicy: 'all',
  preferredVideoFormat: 'H264',
} as const;

/** 시작한 연결이 ICE `connected`에 닿기까지 기다리는 최대 시간이다. */
export const CONNECT_TIMEOUT_MS = 15_000;

function statusOf(error: unknown): number | null {
  const match =
    typeof error === 'string' ? /Failed to fetch (\d{3})/.exec(error) : null;
  return match ? Number(match[1]) : null;
}

// 스트림 트랙의 복제본을 보내고 그 복제본을 직접 가진다. 호출한 쪽의 트랙은
// 시도가 실패해도 살아 있어야 하고(미리보기가 계속 돈다), 복제본이 살아 있으면
// 송출이 끝난 뒤에도 카메라 불이 켜져 있다.
// `connected` 뒤에는 이벤트를 많아야 하나 내보내고, 스스로 정리한다.
export function startWhipPublish(
  stream: MediaStream,
  publishPath: string,
  onEvent: (event: PublishEvent) => void,
): WhipPublisher {
  // OvenLiveKit은 연결을 만들 때 이 스트림을 읽는다. 그래서 그 전에
  // 바꾼 트랙도 여기에 반영해야 한다.
  const sent = new MediaStream(
    stream.getTracks().map((track) => track.clone()),
  );
  let done = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(connectTimer);
    window.removeEventListener('pagehide', leave);
    const tracks = sent.getTracks();
    kit.remove();
    for (const track of tracks) track.stop();
  };
  // transceiver로 찾는다. 트랙을 놓은 sender에는 맞춰 볼 트랙이 없다.
  const senderOf = (kind: string) =>
    kit.peerConnection
      ?.getTransceivers()
      .find((t) => t.receiver.track.kind === kind)?.sender;
  const swap = (kind: string, next: MediaStreamTrack | null) => {
    const previous = sent.getTracks().find((t) => t.kind === kind);
    if (previous) sent.removeTrack(previous);
    if (next) sent.addTrack(next);
    // 닫힌 연결은 이미 콜백으로 알렸다.
    senderOf(kind)
      ?.replaceTrack(next)
      .catch(() => {});
    previous?.stop();
  };
  const replaceTrack = (track: MediaStreamTrack) => {
    if (!done) swap(track.kind, track.clone());
  };
  const releaseTrack = (kind: TrackKind) => {
    if (!done) swap(kind, null);
  };
  // 페이지가 unload되면 브라우저는 OvenLiveKit의 WHIP DELETE(일반 fetch)를
  // 취소한다. 그러면 OME는 약 30 s 뒤 ICE timeout에야 끊김을 알아챈다.
  // 그때까지는 API가 방송을 연결된 상태로 보므로, 새로고침해도
  // 다시 송출할 수 없다. keepalive 요청은 페이지보다 오래 살아남으므로,
  // OME가 1초 안에 `closing`을 보낸다.
  const leave = () => {
    if (kit.resourceUrl) {
      void fetch(kit.resourceUrl, { method: 'DELETE', keepalive: true });
    }
    finish();
  };
  window.addEventListener('pagehide', leave);
  const report = (event: Exclude<PublishEvent, { kind: 'connected' }>) => {
    if (done) return;
    finish();
    onEvent(event);
  };
  const kit = OvenLiveKit.create({
    callbacks: {
      connected: () => {
        clearTimeout(connectTimer);
        if (!done) onEvent({ kind: 'connected' });
      },
      connectionClosed: (type) => {
        if (type !== 'user') report({ kind: 'disconnected' });
      },
      // OvenLiveKit 1.5.8은 정의하지도 않은 `errorHandler` 콜백을 불러
      // ICE `failed`를 알린다. 그래서 TypeError만 나고 끝난다. 이
      // 콜백은 그 직전에 실행된다.
      iceStateChange: (state) => {
        if (state === 'failed') report({ kind: 'failed', status: null });
      },
      error: (error) => report({ kind: 'failed', status: statusOf(error) }),
    },
  });
  kit.setMediaStream(sent).then(
    () => {
      if (done) return;
      // ICE는 아무 이벤트 없이 `checking`에 영영 머물 수 있다.
      connectTimer = setTimeout(
        () => report({ kind: 'failed', status: null }),
        CONNECT_TIMEOUT_MS,
      );
      kit.startStreaming(
        new URL(publishPath, window.location.origin).toString(),
        CONNECTION_CONFIG,
      );
    },
    // 이미 `error` 콜백으로 알렸다.
    () => {},
  );
  return { replaceTrack, releaseTrack, stop: finish };
}
