// 결제 화면을 어디에 띄우는지 정한다. PC 넓은 화면은 후원 모달 안
// iframe에(PRD-donation-modal 7.3), 그 밖은 새 탭에(PRD-lime 7.1) 띄운다.
// 결제 화면과 시청 화면이 주고받는 메시지는 `paymentNotice`가 맡는다.

export type PaymentKind = 'charge' | 'donation';

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

export function openChargeTab(): void {
  // 아래 후원 탭과 같은 이유로 `noopener`를 붙이지 않는다.
  window.open('/lime/charge', '_blank');
}

export function openDonateTab(broadcastId: string): void {
  // `noopener`를 붙이지 않는다. 스크립트가 연 창만 나중에 스스로 닫을 수 있다.
  window.open(paymentPath('donation', broadcastId), '_blank');
}
