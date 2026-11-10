import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'failed'; error: unknown };

// GETs `path` and re-fetches when it changes. The result is tagged with the
// path it answers, so a slow response for an old path never shows up as the
// answer for the current one.
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

// Like useApi, but re-reads every `intervalMs` and on `reload()`. A failed
// re-read keeps the last answer on screen.
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
