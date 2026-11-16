import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { advanceClock, eventually, useFakeClock } from './testing/fakeClock';
import { usePolledApi, type Loadable } from './use-api';

// apiFetch 요청마다 응답 시점을 테스트가 정한다.
type Pending = {
  path: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};
const pending: Pending[] = [];

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    apiFetch: (path: string) =>
      new Promise((resolve, reject) => {
        pending.push({ path, resolve, reject });
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

  it('경로가 null이면 읽지 않는다', async () => {
    const { result } = renderHook(() => usePolledApi<string>(null, 1000));
    await advanceClock(3000);
    expect(pending).toHaveLength(0);
    expect(result.current.data.status).toBe('loading');
  });
});
