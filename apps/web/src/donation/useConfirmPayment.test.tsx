import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { useConfirmPayment } from './useConfirmPayment';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const QUERY = '?orderId=o1&paymentKey=pk_1&amount=5000';

// 확정 요청을 세고, `reply`로 답한다. Response가 아니면 200 JSON 본문이다.
function stubConfirm(path: string, reply: unknown) {
  const sent: unknown[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url !== `/api${path}`) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    sent.push(JSON.parse(init?.body as string));
    return Promise.resolve(
      reply instanceof Response ? reply : Response.json(reply),
    );
  });
  return sent;
}

function renderConfirm<K extends 'donation' | 'charge'>(kind: K, url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/login" element={<p>로그인</p>} />
          <Route path="*" element={children} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
  return renderHook(() => useConfirmPayment(kind), { wrapper });
}

// 두 경로로 들어오는 알림을 모두 센다.
function listenBothPaths() {
  const heard: unknown[] = [];
  const channel = new BroadcastChannel('donations');
  channel.onmessage = (event: MessageEvent) => heard.push(event.data);
  const listener = (event: MessageEvent) => heard.push(event.data);
  window.addEventListener('message', listener);
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    channel.close();
    window.removeEventListener('message', listener);
    return heard;
  };
}

const DONATION = {
  id: 'd1',
  method: 'TOSS',
  amount: 5000,
  message: '',
  approvedAt: '2026-11-16T00:00:00.000Z',
  donor: { id: 'u2', nickname: '시청자' },
  broadcastId: 'b1',
};

const CHARGE = {
  orderId: 'o1',
  amount: 5000,
  approvedAt: '2026-11-16T00:00:00.000Z',
  balanceAfter: 7000,
};

it('confirms a donation once under StrictMode and tells the watch tab once', async () => {
  const sent = stubConfirm('/donations/confirm', DONATION);
  const heard = listenBothPaths();
  const { result } = renderConfirm('donation', `/donations/success${QUERY}`);
  await waitFor(() => expect(result.current.status).toBe('done'));
  expect(sent).toEqual([{ paymentKey: 'pk_1', orderId: 'o1', amount: 5000 }]);
  expect(await heard()).toEqual([{ type: 'donated', broadcastId: 'b1' }]);
});

it('confirms a charge once under StrictMode and tells the modal once', async () => {
  vi.stubGlobal('self', {});
  const sent = stubConfirm('/lime/charges/confirm', CHARGE);
  const heard = listenBothPaths();
  const { result } = renderConfirm('charge', `/lime/charge/success${QUERY}`);
  await waitFor(() => expect(result.current.status).toBe('done'));
  expect(sent).toHaveLength(1);
  expect(await heard()).toEqual([
    { type: 'payment-done', kind: 'charge', amount: 5000 },
  ]);
});

it('tells the modal about a donation once and not the watch tab', async () => {
  vi.stubGlobal('self', {});
  stubConfirm('/donations/confirm', DONATION);
  const heard = listenBothPaths();
  const { result } = renderConfirm('donation', `/donations/success${QUERY}`);
  await waitFor(() => expect(result.current.status).toBe('done'));
  expect(await heard()).toEqual([{ type: 'payment-done', kind: 'donation' }]);
});

it('fails without confirming when the query is not a payment', async () => {
  const sent = stubConfirm('/donations/confirm', DONATION);
  const heard = listenBothPaths();
  const { result } = renderConfirm(
    'donation',
    '/donations/success?orderId=o1&amount=0',
  );
  expect(result.current).toEqual({
    status: 'failed',
    message: '결제 정보가 올바르지 않습니다.',
    serverCode: null,
  });
  expect(await heard()).toEqual([]);
  expect(sent).toEqual([]);
});

it('keeps the server code and message of a refused confirm and tells no one', async () => {
  stubConfirm(
    '/donations/confirm',
    Response.json(
      { message: '방송이 삭제되었습니다.', code: 'BROADCAST_DELETED' },
      { status: 409 },
    ),
  );
  const heard = listenBothPaths();
  const { result } = renderConfirm('donation', `/donations/success${QUERY}`);
  await waitFor(() =>
    expect(result.current).toEqual({
      status: 'failed',
      message: '방송이 삭제되었습니다.',
      serverCode: 'BROADCAST_DELETED',
    }),
  );
  expect(await heard()).toEqual([]);
});

it('names the missing order by kind on 404', async () => {
  stubConfirm('/lime/charges/confirm', new Response(null, { status: 404 }));
  const { result } = renderConfirm('charge', `/lime/charge/success${QUERY}`);
  await waitFor(() =>
    expect(result.current).toMatchObject({
      status: 'failed',
      message: '충전 주문을 찾을 수 없습니다.',
    }),
  );
});
