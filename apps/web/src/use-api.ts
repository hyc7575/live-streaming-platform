import { useEffect, useState } from 'react';
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
