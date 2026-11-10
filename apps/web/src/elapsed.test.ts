import { expect, it } from 'vitest';
import { formatClock, formatMinutes } from './elapsed';

it.each([
  [0, '0:00'],
  [59_999, '0:59'],
  [61_000, '1:01'],
  [3_599_000, '59:59'],
  [3_600_000, '1:00:00'],
  [36_061_000, '10:01:01'],
])('shows %i ms as %s on the clock', (ms, text) => {
  expect(formatClock(ms)).toBe(text);
});

it.each([
  [59_999, '방금 시작'],
  [60_000, '1분'],
  [3_600_000, '1시간'],
  [3_660_000, '1시간 1분'],
])('shows %i ms as %s in minutes', (ms, text) => {
  expect(formatMinutes(ms)).toBe(text);
});
