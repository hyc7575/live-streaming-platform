import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from './api';
import { advanceClock, useFakeClock } from './testing/fakeClock';
import { CHAT_PAGE_LIMIT, type ChatMessage } from './chat';
import { useChatFeed, useChatHistory } from './use-chat-feed';
import { POLL_TIMEOUT_MS } from './use-api';

// apiFetch 요청마다 응답 시점을 테스트가 정한다. signal이 끊기면 실제 fetch처럼
// AbortError로 끝난다.
type Pending = {
  path: string;
  resolve: (value: unknown) => void;
  signal: AbortSignal | null;
};
const pending: Pending[] = [];

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    apiFetch: (path: string, init?: RequestInit) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal ?? null;
        pending.push({ path, resolve, signal });
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
  };
});

async function answer(index: number, value: unknown): Promise<void> {
  await act(async () => {
    pending[index].resolve(value);
    await Promise.resolve();
  });
}

beforeEach(() => {
  pending.length = 0;
  useFakeClock();
});

afterEach(() => {
  vi.useRealTimers();
});

function message(id: string): ChatMessage {
  return {
    id,
    body: id,
    createdAt: '2026-11-10T01:00:00.000Z',
    author: { id: 'u1', nickname: '불씨' },
    donation: null,
  };
}

const fullPage = (prefix: string) =>
  Array.from({ length: CHAT_PAGE_LIMIT }, (_, i) =>
    message(`${prefix}${String(i).padStart(3, '0')}`),
  );

describe('useChatFeed', () => {
  // 새 시청자는 처음부터가 아니라 최근 한 페이지만 받는다(#213).
  it('처음에는 최근 메시지만 읽고, 그다음부터 마지막 id 뒤를 읽는다', async () => {
    renderHook(() => useChatFeed('b1', { pollMs: 1000 }));
    expect(pending[0].path).toBe('/broadcasts/b1/chat?latest=true');
    await answer(0, [message('m1')]);
    await advanceClock(1000);
    expect(pending[1].path).toBe('/broadcasts/b1/chat?after=m1');
  });

  it('최근 메시지가 없었으면 다음 폴링도 최근 메시지를 읽는다', async () => {
    renderHook(() => useChatFeed('b1', { pollMs: 1000 }));
    await answer(0, []);
    await advanceClock(1000);
    expect(pending[1].path).toBe('/broadcasts/b1/chat?latest=true');
  });

  it('마지막 id 뒤 페이지가 꽉 찼을 때만 바로 이어 읽는다', async () => {
    renderHook(() => useChatFeed('b1', { pollMs: 1000 }));
    await answer(0, [message('a')]);
    await advanceClock(1000);
    await answer(1, fullPage('m'));
    expect(pending).toHaveLength(3);
    expect(pending[2].path).toBe('/broadcasts/b1/chat?after=m199');
  });

  it('응답이 8초 안에 오지 않으면 끊고, 다음 요청을 예약해 이어서 읽는다', async () => {
    renderHook(() => useChatFeed('b1', { pollMs: 1000 }));
    await answer(0, []);
    await advanceClock(1000);
    expect(pending).toHaveLength(2);

    // 두 번째 요청이 응답 없이 걸리면, 8초에 끊고 1초 뒤 다시 읽는다.
    await advanceClock(POLL_TIMEOUT_MS);
    expect(pending[1].signal?.aborted).toBe(true);
    await advanceClock(1000);
    expect(pending).toHaveLength(3);
  });

  it('빈 응답이 이어져도 다시 그리지 않는다', async () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useChatFeed('b1', { pollMs: 1000 });
    });
    await answer(0, []);
    const settled = renders;
    await advanceClock(1000);
    await answer(1, []);
    await advanceClock(1000);
    await answer(2, []);
    expect(pending).toHaveLength(3);
    expect(renders).toBe(settled);
  });

  it('이미 아는 메시지만 오면 다시 그리지 않고, 새 메시지가 오면 그린다', async () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useChatFeed('b1', { pollMs: 1000 });
    });
    await answer(0, [message('m1')]);
    const settled = renders;
    await advanceClock(1000);
    await answer(1, [message('m1')]);
    expect(renders).toBe(settled);
    await advanceClock(1000);
    await answer(2, [message('m2')]);
    expect(renders).toBe(settled + 1);
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('화면을 떠나면 진행 중 요청을 끊는다', () => {
    const { unmount } = renderHook(() => useChatFeed('b1', { pollMs: 1000 }));
    unmount();
    expect(pending[0].signal?.aborted).toBe(true);
  });
});

describe('useChatHistory', () => {
  it('처음부터 한 페이지만 읽고, 더 읽으라고 할 때만 다음 페이지를 읽는다', async () => {
    const { result } = renderHook(() => useChatHistory('b1'));
    expect(pending[0].path).toBe('/broadcasts/b1/chat');
    await answer(0, fullPage('m'));
    expect(pending).toHaveLength(1);
    expect(result.current.messages).toHaveLength(CHAT_PAGE_LIMIT);
    expect(result.current.more).toBe(true);

    act(() => result.current.loadMore());
    // 요청 중에는 겹쳐 보내지 않는다.
    act(() => result.current.loadMore());
    expect(pending).toHaveLength(2);
    expect(pending[1].path).toBe('/broadcasts/b1/chat?after=m199');
    await answer(1, [message('n1')]);
    expect(result.current.messages).toHaveLength(CHAT_PAGE_LIMIT + 1);
    expect(result.current.more).toBe(false);

    act(() => result.current.loadMore());
    expect(pending).toHaveLength(2);
  });

  it('한 페이지가 꽉 차지 않으면 더 읽을 것이 없다', async () => {
    const { result } = renderHook(() => useChatHistory('b1'));
    await answer(0, [message('a')]);
    expect(result.current.status).toBe('loaded');
    expect(result.current.more).toBe(false);
  });
});
