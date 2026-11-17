import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from './api';
import { ApiError } from './api';
import { advanceClock, eventually, useFakeClock } from './testing/fakeClock';
import { POLL_TIMEOUT_MS, usePolledApi, type Loadable } from './use-api';

// apiFetch 요청마다 응답 시점을 테스트가 정한다.
type Pending = {
  path: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  signal: AbortSignal | null;
};
const pending: Pending[] = [];

// 실제 fetch처럼 signal이 끊기면 AbortError로 끝난다.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    apiFetch: (path: string, init?: RequestInit) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal ?? null;
        pending.push({ path, resolve, reject, signal });
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

async function fail(index: number, error: unknown): Promise<void> {
  await act(async () => {
    pending[index].reject(error);
    await Promise.resolve();
  });
}

function dataOf<T>(loadable: Loadable<T>): T | undefined {
  return loadable.status === 'loaded' ? loadable.data : undefined;
}

beforeEach(() => {
  pending.length = 0;
  useFakeClock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePolledApi', () => {
  it('주기 요청이 진행 중일 때 다시 읽으면 새 요청을 보내고, 늦게 온 옛 응답은 버린다', async () => {
    const { result } = renderHook(() => usePolledApi<string>('/x', 1000));
    await answer(0, 'first');
    expect(dataOf(result.current.data)).toBe('first');

    // 주기 요청이 나간 뒤, 응답 전에 사용자가 작업하고 다시 읽는다.
    await advanceClock(1000);
    expect(pending).toHaveLength(2);
    act(() => void result.current.reload());
    expect(pending).toHaveLength(3);

    await answer(2, 'after-my-change');
    expect(dataOf(result.current.data)).toBe('after-my-change');

    // 작업 전에 시작한 주기 요청이 늦게 와도 화면을 되돌리지 않는다.
    await answer(1, 'before-my-change');
    expect(dataOf(result.current.data)).toBe('after-my-change');
  });

  it('reload는 그 요청의 응답이 반영된 뒤에 끝난다', async () => {
    const { result } = renderHook(() => usePolledApi<string>('/x', 1000));
    await answer(0, 'first');

    let done = false;
    act(() => {
      void result.current.reload().then(() => {
        done = true;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(done).toBe(false);

    await answer(1, 'second');
    await eventually(() => expect(done).toBe(true));
    expect(dataOf(result.current.data)).toBe('second');
  });

  it('응답이 주기보다 느려도 주기 요청을 겹쳐 보내지 않아, 응답이 화면에 반영된다', async () => {
    const { result } = renderHook(() => usePolledApi<string>('/x', 1000));
    await advanceClock(3000);
    expect(pending).toHaveLength(1);

    await answer(0, 'slow');
    expect(dataOf(result.current.data)).toBe('slow');
  });

  it('새 응답이 이전과 같으면 이전 data 참조를 두고, readAt은 갱신한다', async () => {
    const { result } = renderHook(() =>
      usePolledApi<{ n: number }>('/x', 1000),
    );
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    await answer(0, { n: 1 });
    const first = dataOf(result.current.data);
    expect(result.current.readAt).toBe(1000);
    now.mockReturnValue(6000);
    await advanceClock(1000);
    await answer(1, { n: 1 });
    expect(dataOf(result.current.data)).toBe(first);
    expect(result.current.readAt).toBe(6000);
    now.mockRestore();
  });

  it('응답이 바뀌면 새 data를 바로 반영한다', async () => {
    const { result } = renderHook(() =>
      usePolledApi<{ n: number }>('/x', 1000),
    );
    await answer(0, { n: 1 });
    const first = dataOf(result.current.data);
    await advanceClock(1000);
    await answer(1, { n: 2 });
    expect(dataOf(result.current.data)).not.toBe(first);
    expect(dataOf(result.current.data)).toEqual({ n: 2 });
  });

  it('다시 읽기가 실패하면 마지막 응답을 유지한다', async () => {
    const { result } = renderHook(() => usePolledApi<string>('/x', 1000));
    await answer(0, 'first');
    await advanceClock(1000);
    await fail(1, new ApiError(503, 'unavailable'));
    expect(dataOf(result.current.data)).toBe('first');
  });

  it('첫 읽기가 실패하면 failed를 보이고, 다음 주기에 다시 읽는다', async () => {
    const { result } = renderHook(() => usePolledApi<string>('/x', 1000));
    await fail(0, new ApiError(503, 'unavailable'));
    expect(result.current.data.status).toBe('failed');

    await advanceClock(1000);
    await answer(1, 'recovered');
    expect(dataOf(result.current.data)).toBe('recovered');
  });

  it('종결 오류는 마지막 응답을 덮어쓴다', async () => {
    const gone = new ApiError(404, 'not found');
    const { result } = renderHook(() =>
      usePolledApi<string>('/x', 1000, {
        isTerminal: (error) =>
          error instanceof ApiError && error.status === 404,
      }),
    );
    await answer(0, 'first');
    await advanceClock(1000);
    await fail(1, gone);
    expect(result.current.data).toEqual({ status: 'failed', error: gone });
  });

  it('멈춤 조건이 참이 되면 더 읽지 않고, reload도 요청을 보내지 않는다', async () => {
    const { result } = renderHook(() =>
      usePolledApi<string>('/x', 1000, {
        stopWhen: (loadable) =>
          loadable.status === 'loaded' && loadable.data === 'ENDED',
      }),
    );
    await answer(0, 'LIVE');
    await advanceClock(1000);
    await answer(1, 'ENDED');

    await advanceClock(5000);
    await act(async () => {
      await result.current.reload();
    });
    expect(pending).toHaveLength(2);
    expect(dataOf(result.current.data)).toBe('ENDED');
  });

  it('멈춤 조건은 응답이 도착한 시각을 받는다', async () => {
    const readAts: number[] = [];
    const { result } = renderHook(() =>
      usePolledApi<string>('/x', 1000, {
        stopWhen: (_loadable, readAt) => {
          readAts.push(readAt);
          return false;
        },
      }),
    );
    expect(result.current.readAt).toBeNull();
    const before = Date.now();
    await answer(0, 'first');
    const readAt = result.current.readAt;
    expect(readAt).not.toBeNull();
    expect(readAt!).toBeGreaterThanOrEqual(before);
    expect(readAts.at(-1)).toBe(readAt);
  });

  it('경로가 바뀌면 이전 경로의 응답을 보이지 않는다', async () => {
    const { result, rerender } = renderHook(
      ({ path }) => usePolledApi<string>(path, 1000),
      { initialProps: { path: '/a' } },
    );
    await answer(0, 'a');
    rerender({ path: '/b' });
    expect(result.current.data.status).toBe('loading');

    await answer(1, 'b');
    expect(dataOf(result.current.data)).toBe('b');
  });

  it('같은 경로라도 key가 바뀌면 이전 응답을 보이지 않고 다시 읽는다', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePolledApi<string>('/me', 1000, { key }),
      { initialProps: { key: 'alice' } },
    );
    await answer(0, 'alice-data');
    rerender({ key: 'bob' });
    expect(result.current.data.status).toBe('loading');
    expect(pending).toHaveLength(2);

    await answer(1, 'bob-data');
    expect(dataOf(result.current.data)).toBe('bob-data');
  });

  it('응답이 8초 안에 오지 않으면 끊고, 다음 주기 요청이 나가 ENDED를 읽는다(T9)', async () => {
    // 시청 화면의 상태 폴링과 같은 5초 주기.
    const { result } = renderHook(() => usePolledApi<string>('/x', 5000));
    await answer(0, 'LIVE');

    // 5초 주기 요청이 응답 없이 걸린다. 진행 중이라 10초 주기는 건너뛴다.
    await advanceClock(5000);
    expect(pending).toHaveLength(2);

    // 그 요청을 8초에 끊는다. 화면은 마지막 응답을 둔다.
    await advanceClock(POLL_TIMEOUT_MS);
    expect(pending[1].signal?.aborted).toBe(true);
    expect(dataOf(result.current.data)).toBe('LIVE');

    // 끊긴 뒤 첫 주기(15초)에 새 요청이 나가고, 그 응답이 화면에 온다.
    await advanceClock(2000);
    expect(pending).toHaveLength(3);
    await answer(2, 'ENDED');
    expect(dataOf(result.current.data)).toBe('ENDED');
  });

  it('응답이 제한 시간 안에 오면 끊지 않는다', async () => {
    const { result } = renderHook(() => usePolledApi<string>('/x', 1000));
    await advanceClock(POLL_TIMEOUT_MS - 1);
    expect(pending[0].signal?.aborted).toBe(false);
    await answer(0, 'slow-but-alive');
    expect(dataOf(result.current.data)).toBe('slow-but-alive');
  });

  it('화면을 떠나면 진행 중 요청을 끊는다', () => {
    const { unmount } = renderHook(() => usePolledApi<string>('/x', 1000));
    unmount();
    expect(pending[0].signal?.aborted).toBe(true);
  });

  it('경로가 바뀌면 이전 경로의 진행 중 요청을 끊는다', () => {
    const { rerender } = renderHook(
      ({ path }) => usePolledApi<string>(path, 1000),
      { initialProps: { path: '/a' } },
    );
    rerender({ path: '/b' });
    expect(pending[0].signal?.aborted).toBe(true);
    expect(pending[1].signal?.aborted).toBe(false);
  });

  it('경로가 null이면 읽지 않는다', async () => {
    const { result } = renderHook(() => usePolledApi<string>(null, 1000));
    await advanceClock(3000);
    expect(pending).toHaveLength(0);
    expect(result.current.data.status).toBe('loading');
  });
});
