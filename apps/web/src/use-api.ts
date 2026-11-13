import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'failed'; error: unknown };

// `path`를 GET하고, path가 바뀌면 다시 가져온다. 결과에는 그 결과가 답한
// path를 붙인다. 그래서 예전 path에 대한 늦은 응답이 지금 path의
// 응답으로 보이지 않는다.
export function useApi<T>(path: string): Loadable<T> {
  const [result, setResult] = useState<{
    path: string;
    loadable: Loadable<T>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<T>(path).then(
      (data) => {
        if (!cancelled)
          setResult({ path, loadable: { status: 'loaded', data } });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({ path, loadable: { status: 'failed', error } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  return result?.path === path ? result.loadable : { status: 'loading' };
}

// useApi와 같지만, `intervalMs`마다와 `reload()` 때 다시 읽는다. 다시 읽기에
// 실패하면 마지막 응답을 화면에 둔다.
export function usePolledApi<T>(
  path: string,
  intervalMs: number,
): { data: Loadable<T>; reload: () => void } {
  const [result, setResult] = useState<{
    path: string;
    loadable: Loadable<T>;
  } | null>(null);
  const reloadRef = useRef<() => void>(() => {});
  const data: Loadable<T> =
    result?.path === path ? result.loadable : { status: 'loading' };

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      apiFetch<T>(path)
        .then(
          (loaded) => {
            if (!cancelled)
              setResult({ path, loadable: { status: 'loaded', data: loaded } });
          },
          (error: unknown) => {
            if (cancelled) return;
            setResult((prev) =>
              prev?.path === path && prev.loadable.status === 'loaded'
                ? prev
                : { path, loadable: { status: 'failed', error } },
            );
          },
        )
        .finally(() => {
          inFlight = false;
        });
    };
    load();
    const timer = setInterval(load, intervalMs);
    reloadRef.current = load;
    return () => {
      cancelled = true;
      clearInterval(timer);
      reloadRef.current = () => {};
    };
  }, [path, intervalMs]);

  const reload = useCallback(() => reloadRef.current(), []);
  return { data, reload };
}
