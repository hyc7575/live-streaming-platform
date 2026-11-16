import { inFrame } from './paymentFrame';

// 결제 화면과 그 결제를 연 시청 화면이 주고받는 것(#199). 결제 화면은
// 두 자리 중 하나에 있다.
// - 새 탭(PRD-lime 7.1): `BroadcastChannel('donations')`로 다른 탭에
//   알린다. 메시지를 놓쳐도(BroadcastChannel 없음, 다른 브라우저) 시청
//   화면의 5 s·30 s 폴링을 기다리면 될 뿐이다.
// - 후원 모달 안 iframe(PRD-donation-modal 7.3): 부모 창에
//   `postMessage`로 알린다.
// 보내는 쪽은 지금 자리(`inFrame()`)로 경로를 하나만 고른다. 두 경로로
// 모두 보내면 iframe도 같은 출처라 BroadcastChannel이 부모 창에 닿아,
// 받는 쪽이 같은 완료를 두 번 받는다.
const CHANNEL = 'donations';

// 결제 화면이 알리는 완료. 후원의 `broadcastId`는 결제 뒤 방송이
// 지워졌으면 null이다(#114).
export type PaymentDone =
  | { kind: 'donation'; broadcastId: string | null }
  | { kind: 'charge'; amount: number };

type ChannelMessage =
  { type: 'donated'; broadcastId: string } | { type: 'charged' };

export type PaymentFrameMessage =
  | { type: 'payment-done'; kind: 'charge'; amount: number }
  | { type: 'payment-done'; kind: 'donation' }
  | { type: 'payment-close' };

// 확정이 끝난 결제를 시청 화면에 한 번 알린다.
export function announcePayment(done: PaymentDone): void {
  if (inFrame()) {
    // 모달은 방송 화면 위에 있으므로 방송이 지워졌어도 알려 결제 보기를
    // 닫게 한다.
    postToParent(
      done.kind === 'charge'
        ? { type: 'payment-done', kind: 'charge', amount: done.amount }
        : { type: 'payment-done', kind: 'donation' },
    );
    return;
  }
  if (done.kind === 'charge') {
    postToChannel({ type: 'charged' });
  } else if (done.broadcastId) {
    // 지워진 방송에는 다시 읽을 시청 탭이 없다.
    postToChannel({ type: 'donated', broadcastId: done.broadcastId });
  }
}

// 결제 탭은 시청 탭이 열었으므로, 닫으면 시청 탭으로 돌아간다.
// 브라우저가 닫아 주지 않는 탭(주소창에 직접 입력한 뒤
// Toss가 리다이렉트한 탭)은 대신 `fallback`으로 간다. 후원 모달 안
// iframe이면 모달에 결제 보기를 닫으라고 알린다.
export function closeTabOr(
  fallback: string,
  navigate: (to: string) => void,
): void {
  if (inFrame()) {
    postToParent({ type: 'payment-close' });
    return;
  }
  window.close();
  if (!window.closed) navigate(fallback);
}

export function returnToBroadcast(
  broadcastId: string,
  navigate: (to: string) => void,
): void {
  closeTabOr(`/broadcasts/${broadcastId}`, navigate);
}

// 새 탭 결제가 `broadcastId`에 후원을 알릴 때마다 `onDonated`를 부른다.
// 구독 해제 함수를 돌려준다.
export function onDonation(
  broadcastId: string,
  onDonated: () => void,
): () => void {
  return subscribe((message) => {
    if (message.type === 'donated' && message.broadcastId === broadcastId) {
      onDonated();
    }
  });
}

// 새 탭 충전이 끝날 때마다 `onCharged`를 부른다. 구독 해제 함수를
// 돌려준다.
export function onCharge(onCharged: () => void): () => void {
  return subscribe((message) => {
    if (message.type === 'charged') onCharged();
  });
}

// 같은 출처이고 자기 iframe이 보낸 메시지만 받는다. 같은 출처의 다른
// 창이나 다른 프레임이 보낸 메시지, 모양이 다른 데이터는 null이다.
export function readPaymentMessage(
  event: MessageEvent,
  frame: Window | null,
): PaymentFrameMessage | null {
  if (event.origin !== window.location.origin) return null;
  if (frame === null || event.source !== frame) return null;
  return parseFrameMessage(event.data);
}

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(CHANNEL);
}

function postToChannel(message: ChannelMessage): void {
  const channel = openChannel();
  if (!channel) return;
  channel.postMessage(message);
  channel.close();
}

function subscribe(listener: (message: ChannelMessage) => void): () => void {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = parseChannelMessage(event.data);
    if (message) listener(message);
  };
  return () => channel.close();
}

function parseChannelMessage(data: unknown): ChannelMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const { type, broadcastId } = data as Record<string, unknown>;
  if (type === 'charged') return { type };
  if (type === 'donated' && typeof broadcastId === 'string') {
    return { type, broadcastId };
  }
  return null;
}

function postToParent(message: PaymentFrameMessage): void {
  window.parent.postMessage(message, window.location.origin);
}

function parseFrameMessage(data: unknown): PaymentFrameMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const { type, kind, amount } = data as Record<string, unknown>;
  if (type === 'payment-close') return { type };
  if (type !== 'payment-done') return null;
  if (kind === 'donation') return { type, kind };
  if (
    kind === 'charge' &&
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount > 0
  ) {
    return { type, kind, amount };
  }
  return null;
}
