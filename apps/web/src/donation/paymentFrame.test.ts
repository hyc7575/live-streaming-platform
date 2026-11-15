import { afterEach, expect, it, vi } from 'vitest';
import { inFrame, isPaymentPath, readPaymentMessage } from './paymentFrame';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
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

it.each([
  ['/lime/charge', true],
  ['/lime/charge/success', true],
  ['/lime/charge/fail', true],
  ['/broadcasts/b1/donate', true],
  ['/donations/success', true],
  ['/donations/fail', true],
  ['/broadcasts/b1', false],
  ['/lime/charges', false],
  ['/me', false],
  ['/', false],
])('treats %s as a payment screen: %s', (path, payment) => {
  expect(isPaymentPath(path)).toBe(payment);
});

it('knows when the page runs inside a frame', () => {
  expect(inFrame()).toBe(false);
  vi.stubGlobal('self', {});
  expect(inFrame()).toBe(true);
});
