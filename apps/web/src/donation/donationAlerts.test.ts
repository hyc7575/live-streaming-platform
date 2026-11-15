import { expect, it } from 'vitest';
import type { Donation } from '../donations';
import {
  advanceAlerts,
  EMPTY_ALERTS,
  enqueueAlerts,
  type DonationAlerts,
} from './donationAlerts';

// S6(#164): 송출 토스트와 시청 배너가 같이 쓰는 표시 큐.

function donation(id: string): Donation {
  return {
    id,
    method: 'TOSS',
    amount: 1000,
    message: '',
    approvedAt: '2026-11-15T10:00:00.000Z',
    donor: { id: 'u2', nickname: `후원자${id}` },
  };
}

// 큐가 화면에 띄우는 순서를 끝까지 따라간다.
function shownInOrder(alerts: DonationAlerts): string[] {
  const shown: string[] = [];
  let state = alerts;
  while (state.current) {
    const { current } = state;
    shown.push(
      current.kind === 'donation'
        ? current.donation.id
        : `외 ${current.count}건`,
    );
    state = advanceAlerts(state);
  }
  return shown;
}

it('shows one donation at a time, oldest first', () => {
  const state = enqueueAlerts(EMPTY_ALERTS, [donation('a'), donation('b')]);
  expect(state.current).toMatchObject({ kind: 'donation' });
  expect(shownInOrder(state)).toEqual(['a', 'b']);
});

it('bundles what waits beyond 4 into one card', () => {
  const state = enqueueAlerts(
    EMPTY_ALERTS,
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(donation),
  );
  // 지금 하나, 기다리는 4건, 나머지 2건은 한 장.
  expect(shownInOrder(state)).toEqual(['a', 'b', 'c', 'd', 'e', '외 2건']);
});

it('keeps later donations behind the bundle so the order holds', () => {
  let state = enqueueAlerts(
    EMPTY_ALERTS,
    ['a', 'b', 'c', 'd', 'e', 'f'].map(donation),
  );
  // a가 내려가 자리가 났어도, 묶음보다 늦게 온 후원은 묶음에 더한다.
  state = advanceAlerts(state);
  state = enqueueAlerts(state, [donation('g')]);
  expect(shownInOrder(state)).toEqual(['b', 'c', 'd', 'e', '외 2건']);
});

it('follows the same rule for what arrives in waves, as after a reconnect', () => {
  let state = enqueueAlerts(EMPTY_ALERTS, [donation('a')]);
  state = enqueueAlerts(
    state,
    ['b', 'c', 'd', 'e', 'f', 'g', 'h'].map(donation),
  );
  expect(shownInOrder(state)).toEqual(['a', 'b', 'c', 'd', 'e', '외 3건']);
});

it('never shows the same donation twice', () => {
  let state = enqueueAlerts(EMPTY_ALERTS, [donation('a'), donation('a')]);
  state = enqueueAlerts(state, [donation('a'), donation('b')]);
  state = advanceAlerts(state);
  // 이미 띄운 후원이 다시 와도 무시한다.
  state = enqueueAlerts(state, [donation('a'), donation('b')]);
  expect(shownInOrder(state)).toEqual(['b']);
});

it('gives every card its own key, so a new bundle restarts its timer', () => {
  let state = enqueueAlerts(
    EMPTY_ALERTS,
    ['a', 'b', 'c', 'd', 'e', 'f'].map(donation),
  );
  const keys = new Set<string>();
  while (state.current) {
    keys.add(state.current.key);
    state = advanceAlerts(state);
  }
  state = enqueueAlerts(state, ['g', 'h', 'i', 'j', 'k', 'l'].map(donation));
  while (state.current) {
    keys.add(state.current.key);
    state = advanceAlerts(state);
  }
  expect(keys.size).toBe(12);
});
