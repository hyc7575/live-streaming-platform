// 결제는 따로 탭을 열어서, 시청 탭은 계속 재생된다
// (PRD-lime 7.1). 승인 뒤 결제 탭이 이 채널로 시청 탭에 알린다.
// 그러면 시청 탭은 다음 5 s 폴링을 기다리지 않고 후원을
// 바로 다시 읽는다. 메시지를 놓쳐도(BroadcastChannel 없음, 다른 브라우저)
// 그 폴링을 기다리면 될 뿐이다. 라임 충전 탭은 `charged`를 보내
// 시청 탭이 잔액을 다시 읽게 한다.
const CHANNEL = 'donations';

interface DonatedMessage {
  type: 'donated';
  broadcastId: string;
}

interface ChargedMessage {
  type: 'charged';
}

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel(CHANNEL);
}

export function announceDonation(broadcastId: string): void {
  const channel = openChannel();
  if (!channel) return;
  const message: DonatedMessage = { type: 'donated', broadcastId };
  channel.postMessage(message);
  channel.close();
}

export function announceCharge(): void {
  const channel = openChannel();
  if (!channel) return;
  const message: ChargedMessage = { type: 'charged' };
  channel.postMessage(message);
  channel.close();
}

// `broadcastId`에 후원이 올 때마다 `onDonated`를 부른다. 구독 해제 함수를
// 돌려준다.
export function onDonation(
  broadcastId: string,
  onDonated: () => void,
): () => void {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent<Partial<DonatedMessage>>) => {
    if (
      event.data?.type === 'donated' &&
      event.data.broadcastId === broadcastId
    ) {
      onDonated();
    }
  };
  return () => channel.close();
}

// 충전 탭이 충전을 알릴 때마다 `onCharged`를 부른다. 구독 해제 함수를
// 돌려준다.
export function onCharge(onCharged: () => void): () => void {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent<Partial<ChargedMessage>>) => {
    if (event.data?.type === 'charged') onCharged();
  };
  return () => channel.close();
}

export function openChargeTab(): void {
  // 아래 후원 탭과 같은 이유로 `noopener`를 붙이지 않는다.
  window.open('/lime/charge', '_blank');
}

export function openDonateTab(broadcastId: string): void {
  // `noopener`를 붙이지 않는다. 스크립트가 연 창만 나중에 스스로 닫을 수 있다.
  window.open(
    `/broadcasts/${encodeURIComponent(broadcastId)}/donate`,
    '_blank',
  );
}

// 결제 탭은 시청 탭이 열었으므로, 닫으면 시청 탭으로 돌아간다.
// 브라우저가 닫아 주지 않는 탭(주소창에 직접 입력한 뒤
// Toss가 리다이렉트한 탭)은 대신 `fallback`으로 간다.
export function closeTabOr(
  fallback: string,
  navigate: (to: string) => void,
): void {
  window.close();
  if (!window.closed) navigate(fallback);
}

export function returnToBroadcast(
  broadcastId: string,
  navigate: (to: string) => void,
): void {
  closeTabOr(`/broadcasts/${broadcastId}`, navigate);
}
