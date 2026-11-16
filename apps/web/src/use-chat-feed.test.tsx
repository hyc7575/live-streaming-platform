import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceClock, useFakeClock } from './testing/fakeClock';
import { useChatFeed } from './use-chat-feed';
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
  const actual = await importOriginal<typeof import('./api')>();
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

describe('useChatFeed', () => {
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

  it('화면을 떠나면 진행 중 요청을 끊는다', () => {
    const { unmount } = renderHook(() => useChatFeed('b1', { pollMs: 1000 }));
    unmount();
    expect(pending[0].signal?.aborted).toBe(true);
  });
});
