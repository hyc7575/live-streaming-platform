import { expect, it } from 'vitest';
import {
  displayStatus,
  LIVE_DISPLAY_DELAY_MS,
  liveDisplayEndsAt,
} from './live-display';

// #249: 송출이 막 붙은 방송은 공개 화면에 10초 동안 READY로 보인다.

const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

it('waits 10 seconds', () => {
  expect(LIVE_DISPLAY_DELAY_MS).toBe(10_000);
});

it('shows a LIVE broadcast as READY until 10 seconds after startedAt', () => {
  expect(displayStatus({ status: 'LIVE', startedAt: ago(0) }, NOW)).toBe(
    'READY',
  );
  expect(displayStatus({ status: 'LIVE', startedAt: ago(9_900) }, NOW)).toBe(
    'READY',
  );
  expect(displayStatus({ status: 'LIVE', startedAt: ago(10_000) }, NOW)).toBe(
    'LIVE',
  );
  expect(displayStatus({ status: 'LIVE', startedAt: ago(60_000) }, NOW)).toBe(
    'LIVE',
  );
});

it('does not hold back a LIVE broadcast without startedAt', () => {
  const b = { status: 'LIVE', startedAt: null } as const;
  expect(liveDisplayEndsAt(b, NOW)).toBeNull();
  expect(displayStatus(b, NOW)).toBe('LIVE');
});

it('holds back at most 10 seconds from when the screen saw it, even if startedAt is ahead of the client clock', () => {
  const b = { status: 'LIVE', startedAt: ago(-60_000) } as const;
  expect(liveDisplayEndsAt(b, NOW)).toBe(NOW + 10_000);
  expect(displayStatus(b, NOW + 9_900, NOW)).toBe('READY');
  expect(displayStatus(b, NOW + 10_000, NOW)).toBe('LIVE');
});

it('leaves READY and ENDED as they are', () => {
  expect(displayStatus({ status: 'READY', startedAt: null }, NOW)).toBe(
    'READY',
  );
  expect(displayStatus({ status: 'ENDED', startedAt: ago(1_000) }, NOW)).toBe(
    'ENDED',
  );
  expect(
    liveDisplayEndsAt({ status: 'ENDED', startedAt: ago(1_000) }, NOW),
  ).toBeNull();
});
