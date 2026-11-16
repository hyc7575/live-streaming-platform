import { afterEach, expect, it, vi } from 'vitest';
import { inFrame, isPaymentPath } from './paymentFrame';

afterEach(() => {
  vi.unstubAllGlobals();
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
