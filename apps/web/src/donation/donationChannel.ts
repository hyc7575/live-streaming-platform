// The payment opens in its own tab so the watch tab keeps playing
// (PRD-lime 7.1). After the confirm, the payment tab tells the watch tab
// over this channel so it re-reads the donations at once instead of on the
// next 5 s poll. Losing the message (no BroadcastChannel, another browser)
// only means waiting for that poll. A lime charge tab says `charged` so the
// watch tab can re-read the balance.
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

// Calls `onDonated` for each donation to `broadcastId`; returns the
// unsubscribe.
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

// Calls `onCharged` whenever a charge tab reports a top-up; returns the
// unsubscribe.
export function onCharge(onCharged: () => void): () => void {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = (event: MessageEvent<Partial<ChargedMessage>>) => {
    if (event.data?.type === 'charged') onCharged();
  };
  return () => channel.close();
}

export function openChargeTab(): void {
  // No `noopener`, for the same reason as the donate tab below.
  window.open('/lime/charge', '_blank');
}

export function openDonateTab(broadcastId: string): void {
  // No `noopener`: only a script-opened window may close itself later.
  window.open(
    `/broadcasts/${encodeURIComponent(broadcastId)}/donate`,
    '_blank',
  );
}

// The payment tab was opened by the watch tab, so closing it lands back
// there. A tab the browser will not close (typed into the address bar, then
// redirected by Toss) goes to `fallback` instead.
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
