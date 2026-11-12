// The payment opens in its own tab so the watch tab keeps playing
// (PRD-lime 7.1). After the confirm, the payment tab tells the watch tab
// over this channel so it re-reads the donations at once instead of on the
// next 5 s poll. Losing the message (no BroadcastChannel, another browser)
// only means waiting for that poll.
const CHANNEL = 'donations';

interface DonatedMessage {
  type: 'donated';
  broadcastId: string;
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

export function openDonateTab(broadcastId: string): void {
  // No `noopener`: only a script-opened window may close itself later.
  window.open(
    `/broadcasts/${encodeURIComponent(broadcastId)}/donate`,
    '_blank',
  );
}

// The payment tab was opened by the watch tab, so closing it lands back on
// the broadcast. A tab the browser will not close (typed into the address
// bar, then redirected by Toss) goes to the broadcast instead.
export function returnToBroadcast(
  broadcastId: string,
  navigate: (to: string) => void,
): void {
  window.close();
  if (!window.closed) navigate(`/broadcasts/${broadcastId}`);
}
