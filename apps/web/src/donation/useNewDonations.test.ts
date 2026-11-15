import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Donation, DonationSummary } from '../donations';
import { useNewDonations } from './useNewDonations';

afterEach(() => {
  vi.unstubAllGlobals();
});

function donation(id: string, approvedAt: string): Donation {
  return {
    id,
    method: 'LIME',
    amount: 1000,
    message: '',
    approvedAt,
    donor: { id: 'u2', nickname: '시청자' },
  };
}

// 최신 순(API와 같다)으로 받은 후원 목록을 요약으로 만든다.
const summaryOf = (donations: Donation[]): DonationSummary => ({
  total: donations.length * 1000,
  count: donations.length,
  donations,
  ranking: [],
});

// 응답 차례를 테스트가 정한다. 숫자는 그 상태 코드로 실패한다. 줄 세운
// 응답이 떨어지면 마지막 응답을 되풀이한다.
function stubDonations() {
  const replies: (DonationSummary | number)[] = [];
  let last: DonationSummary | number = 500;
  let calls = 0;
  vi.stubGlobal('fetch', () => {
    calls += 1;
    last = replies.shift() ?? last;
    const reply = last;
    return Promise.resolve(
      typeof reply === 'number'
        ? new Response(null, { status: reply })
        : Response.json(reply),
    );
  });
  return {
    then: (reply: DonationSummary | number) => replies.push(reply),
    calls: () => calls,
  };
}

const D1 = donation('d1', '2026-11-15T10:00:00.000Z');
const D2 = donation('d2', '2026-11-15T10:00:05.000Z');
const D3 = donation('d3', '2026-11-15T10:00:07.000Z');

function renderFeed() {
  const onNew = vi.fn<(donations: Donation[]) => void>();
  const hook = renderHook(() => useNewDonations('b1', onNew));
  return { onNew, hook };
}

async function poll(
  hook: ReturnType<typeof renderFeed>['hook'],
  calls: () => number,
) {
  const before = calls();
  act(() => hook.result.current.reload());
  await waitFor(() => expect(calls()).toBe(before + 1));
  // 응답을 반영한 렌더와 그 effect까지 기다린다.
  await act(async () => {});
}

it('treats the first response as the baseline and reports later ids', async () => {
  const api = stubDonations();
  api.then(summaryOf([D1]));
  const { onNew, hook } = renderFeed();
  await waitFor(() =>
    expect(hook.result.current.summary.status).toBe('loaded'),
  );
  expect(onNew).not.toHaveBeenCalled();

  api.then(summaryOf([D2, D1]));
  await poll(hook, api.calls);
  expect(onNew).toHaveBeenCalledTimes(1);
  expect(onNew).toHaveBeenLastCalledWith([D2]);
});

it('reports a donation once even when later responses still carry it', async () => {
  const api = stubDonations();
  api.then(summaryOf([]));
  const { onNew, hook } = renderFeed();
  await waitFor(() =>
    expect(hook.result.current.summary.status).toBe('loaded'),
  );

  api.then(summaryOf([D1]));
  await poll(hook, api.calls);
  api.then(summaryOf([D1]));
  await poll(hook, api.calls);
  expect(onNew).toHaveBeenCalledTimes(1);
  expect(onNew).toHaveBeenLastCalledWith([D1]);
});

it('reports several new donations oldest first in one call', async () => {
  const api = stubDonations();
  api.then(summaryOf([D1]));
  const { onNew, hook } = renderFeed();
  await waitFor(() =>
    expect(hook.result.current.summary.status).toBe('loaded'),
  );

  api.then(summaryOf([D3, D2, D1]));
  await poll(hook, api.calls);
  expect(onNew).toHaveBeenCalledTimes(1);
  expect(onNew).toHaveBeenLastCalledWith([D2, D3]);
});

it('reports what arrived while polling failed once a poll succeeds again', async () => {
  const api = stubDonations();
  api.then(summaryOf([D1]));
  const { onNew, hook } = renderFeed();
  await waitFor(() =>
    expect(hook.result.current.summary.status).toBe('loaded'),
  );

  api.then(503);
  await poll(hook, api.calls);
  expect(onNew).not.toHaveBeenCalled();
  // 실패해도 마지막 목록은 남는다.
  expect(hook.result.current.summary.status).toBe('loaded');

  api.then(summaryOf([D3, D2, D1]));
  await poll(hook, api.calls);
  expect(onNew).toHaveBeenCalledTimes(1);
  expect(onNew).toHaveBeenLastCalledWith([D2, D3]);
});

it('takes the baseline from the first successful response', async () => {
  const api = stubDonations();
  api.then(503);
  const { onNew, hook } = renderFeed();
  await waitFor(() =>
    expect(hook.result.current.summary.status).toBe('failed'),
  );

  api.then(summaryOf([D1]));
  await poll(hook, api.calls);
  expect(hook.result.current.summary.status).toBe('loaded');
  expect(onNew).not.toHaveBeenCalled();
});
