import { afterEach, expect, it, vi } from 'vitest';
import {
  announcePayment,
  onCharge,
  onDonation,
  readPaymentMessage,
} from './paymentNotice';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

// 시청 화면 쪽에서 두 경로로 들어오는 완료를 모두 센다. BroadcastChannel은
// 다른 탭(새 탭 결제)에서, `message`는 모달 iframe(jsdom에서는 부모가 자기
// 자신이라 이 창)에서 온다.
function watchScreen() {
  const heard = { donated: 0, charged: 0, frame: [] as unknown[] };
  const stopDonation = onDonation('b1', () => (heard.donated += 1));
  const stopCharge = onCharge(() => (heard.charged += 1));
  const listener = (event: MessageEvent) => heard.frame.push(event.data);
  window.addEventListener('message', listener);
  return {
    heard,
    // BroadcastChannel과 postMessage는 비동기로 온다. 둘 다 도착할 시간을
    // 준 뒤 구독을 푼다.
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 50));
      stopDonation();
      stopCharge();
      window.removeEventListener('message', listener);
      return heard;
    },
  };
}

function inFrame() {
  vi.stubGlobal('self', {});
}

it('tells another tab about a donation only through the channel, once', async () => {
  const post = vi.spyOn(window, 'postMessage');
  const watch = watchScreen();
  announcePayment({ kind: 'donation', broadcastId: 'b1' });
  expect(await watch.settle()).toEqual({ donated: 1, charged: 0, frame: [] });
  expect(post).not.toHaveBeenCalled();
});

it('tells another tab about a charge only through the channel, once', async () => {
  const watch = watchScreen();
  announcePayment({ kind: 'charge', amount: 10_000 });
  expect(await watch.settle()).toEqual({ donated: 0, charged: 1, frame: [] });
});

it('does not announce a donation whose broadcast is gone from a tab', async () => {
  const watch = watchScreen();
  announcePayment({ kind: 'donation', broadcastId: null });
  expect(await watch.settle()).toEqual({ donated: 0, charged: 0, frame: [] });
});

it('tells the modal about a donation only through the frame, once', async () => {
  inFrame();
  const post = vi.spyOn(window, 'postMessage');
  const watch = watchScreen();
  announcePayment({ kind: 'donation', broadcastId: 'b1' });
  expect(await watch.settle()).toEqual({
    donated: 0,
    charged: 0,
    frame: [{ type: 'payment-done', kind: 'donation' }],
  });
  expect(post).toHaveBeenCalledExactlyOnceWith(
    { type: 'payment-done', kind: 'donation' },
    window.location.origin,
  );
});

it('tells the modal about a charge only through the frame, once', async () => {
  inFrame();
  const watch = watchScreen();
  announcePayment({ kind: 'charge', amount: 10_000 });
  expect(await watch.settle()).toEqual({
    donated: 0,
    charged: 0,
    frame: [{ type: 'payment-done', kind: 'charge', amount: 10_000 }],
  });
});

// 모달은 방송 화면 위에 있으므로, 방송이 지워졌어도 모달이 결제 보기를
// 닫게 알린다(#199 전과 같다).
it('still tells the modal about a donation whose broadcast is gone', async () => {
  inFrame();
  const watch = watchScreen();
  announcePayment({ kind: 'donation', broadcastId: null });
  expect((await watch.settle()).frame).toEqual([
    { type: 'payment-done', kind: 'donation' },
  ]);
});

it('hears only donations to its own broadcast', async () => {
  const heard: string[] = [];
  const stop = onDonation('b2', () => heard.push('b2'));
  announcePayment({ kind: 'donation', broadcastId: 'b1' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  stop();
  expect(heard).toEqual([]);
});

function frameWindow(): Window {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  if (!frame.contentWindow) throw new Error('iframe has no window');
  return frame.contentWindow;
}

function message(
  data: unknown,
  {
    origin = window.location.origin,
    source = null,
  }: { origin?: string; source?: Window | null } = {},
) {
  return new MessageEvent('message', { data, origin, source });
}

it('reads payment-done and payment-close from its own same-origin frame', () => {
  const frame = frameWindow();
  const from = { source: frame };
  expect(
    readPaymentMessage(
      message({ type: 'payment-done', kind: 'charge', amount: 10_000 }, from),
      frame,
    ),
  ).toEqual({ type: 'payment-done', kind: 'charge', amount: 10_000 });
  expect(
    readPaymentMessage(
      message({ type: 'payment-done', kind: 'donation' }, from),
      frame,
    ),
  ).toEqual({ type: 'payment-done', kind: 'donation' });
  expect(
    readPaymentMessage(message({ type: 'payment-close' }, from), frame),
  ).toEqual({ type: 'payment-close' });
});

it('ignores a message from another origin even when it names the frame', () => {
  const frame = frameWindow();
  const from = { source: frame, origin: 'https://evil.example' };
  expect(
    readPaymentMessage(message({ type: 'payment-close' }, from), frame),
  ).toBeNull();
});

it('ignores a same-origin message from another frame or window', () => {
  const frame = frameWindow();
  const close = { type: 'payment-close' };
  expect(
    readPaymentMessage(message(close, { source: frameWindow() }), frame),
  ).toBeNull();
  expect(readPaymentMessage(message(close, { source: window }), frame)).toBe(
    null,
  );
  expect(readPaymentMessage(message(close), null)).toBeNull();
});

it.each([
  ['a string', 'payment-close'],
  ['null', null],
  ['an unknown type', { type: 'payment-maybe' }],
  ['an unknown kind', { type: 'payment-done', kind: 'refund' }],
  ['a charge without an amount', { type: 'payment-done', kind: 'charge' }],
  [
    'a charge with a string amount',
    { type: 'payment-done', kind: 'charge', amount: '10000' },
  ],
])('ignores %s', (_, data) => {
  const frame = frameWindow();
  expect(
    readPaymentMessage(message(data, { source: frame }), frame),
  ).toBeNull();
});
