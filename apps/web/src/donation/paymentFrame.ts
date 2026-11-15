// PC 넓은 화면은 결제 화면을 후원 모달 안 iframe에 띄운다
// (PRD-donation-modal 7.3). 이 모듈은 iframe 안인지 판별하고, iframe과
// 부모가 주고받는 메시지를 정한다.

export type PaymentKind = 'charge' | 'donation';

export type PaymentFrameMessage =
  | { type: 'payment-done'; kind: 'charge'; amount: number }
  | { type: 'payment-done'; kind: 'donation' }
  | { type: 'payment-close' };

// iframe에서 본문만 그리는 결제 화면이다. 다른 화면은 iframe 안이어도
// 헤더를 그린다. 앱 전체를 다른 사이트가 iframe으로 띄워도 헤더가 남게
// 하려는 것이다(PRE-MORTEM T3).
const PAYMENT_PATHS = [
  /^\/lime\/charge(\/success|\/fail)?\/?$/,
  /^\/broadcasts\/[^/]+\/donate\/?$/,
  /^\/donations\/(success|fail)\/?$/,
];

export function isPaymentPath(pathname: string): boolean {
  return PAYMENT_PATHS.some((path) => path.test(pathname));
}

export function inFrame(): boolean {
  return window.self !== window.top;
}

export function paymentPath(kind: PaymentKind, broadcastId: string): string {
  return kind === 'charge'
    ? '/lime/charge'
    : `/broadcasts/${encodeURIComponent(broadcastId)}/donate`;
}

export function postToParent(message: PaymentFrameMessage): void {
  window.parent.postMessage(message, window.location.origin);
}

// 같은 출처이고 자기 iframe이 보낸 메시지만 받는다. 같은 출처의 다른
// 창이나 다른 프레임이 보낸 메시지, 모양이 다른 데이터는 null이다.
export function readPaymentMessage(
  event: MessageEvent,
  frame: Window | null,
): PaymentFrameMessage | null {
  if (event.origin !== window.location.origin) return null;
  if (frame === null || event.source !== frame) return null;
  return parseMessage(event.data);
}

function parseMessage(data: unknown): PaymentFrameMessage | null {
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
