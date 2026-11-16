import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
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

export type PollOptions<T> = {
  // 참이면 이 오류가 마지막 응답을 덮어쓴다(예: 방송이 지워진 404).
  // 그 밖의 오류는 일시 오류로 보고 마지막 응답을 화면에 둔다.
  isTerminal?: (error: unknown) => boolean;
  // 참이면 더 읽지 않고, `reload()`도 요청을 보내지 않는다. 렌더 중에
  // 부르므로 순수해야 한다. `readAt`은 그 응답이 도착한 시각(ms)이라,
  // 시간이 걸린 조건도 렌더마다 같은 답을 낸다.
  stopWhen?: (loadable: Loadable<T>, readAt: number) => boolean;
  // 응답을 묶는 키. 같은 path라도 키가 바뀌면 이전 응답을 보이지 않고
  // 처음부터 다시 읽는다(예: 다른 사람으로 로그인한 `/me/...`).
  key?: string;
};

export type Polled<T> = {
  data: Loadable<T>;
  // 지금 보이는 응답이 도착한 시각(ms). 아직 응답이 없으면 null.
  readAt: number | null;
  // 바로 다시 읽는다. 주기 요청이 진행 중이어도 새 요청을 보내고, 그
  // 응답이 반영된 뒤에 끝난다. 예외: 이 요청보다 늦게 시작한 요청이
  // 있거나, 경로·키가 바뀌거나, 멈추거나 언마운트되면 이 요청의 응답은
  // 반영하지 않고 그대로 끝난다. 반영할 값은 그 늦은 요청이 가져온다.
  reload: () => Promise<void>;
};

const NOTHING = Promise.resolve();

// 주기적으로 다시 읽는 GET이 응답을 기다리는 최대 시간(#205). 폴링은 진행
// 중 요청이 끝나야 다음 요청을 보내므로, 응답이 오지 않는 요청 하나가
// 폴링 전체를 멈춘다. 시청 화면의 상태 주기가 5초라 8초에 끊으면 멈춘
// 요청이 시작된 뒤 10초 안에 다음 요청이 나간다(PRD §7.4 T9). 주기와 같게
// 두지 않는 것은 느리지만 살아 있는 서버(채팅 1초 주기에 응답 1.2초)에서
// 모든 요청이 끊기지 않게 하려는 것이다. 변경 요청(POST 등)에는 걸지 않는다.
// 결제 확정은 정상이어도 20초까지 걸린다.
export const POLL_TIMEOUT_MS = 8000;

// `path`를 GET하되 `POLL_TIMEOUT_MS` 안에 응답이 없거나 `signal`이 끊기면
// (화면을 떠남, 경로가 바뀜) 요청을 끊고 AbortError로 실패한다. 폴링만 쓴다.
// iOS 17.4 미만 Safari에 없는 `AbortSignal.any`를 쓰지 않는다.
export async function pollFetch<T>(
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const request = new AbortController();
  const abort = () => request.abort();
  const timer = setTimeout(abort, POLL_TIMEOUT_MS);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort);
  try {
    return await apiFetch<T>(path, { signal: request.signal });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

// useApi와 같지만, `intervalMs`마다와 `reload()` 때 다시 읽는다.
// `path`가 null이면 읽지 않는다.
//
// 겹친 요청 규칙: 화면에는 가장 최근에 시작한 요청의 응답만 반영한다.
// 사용자가 무언가를 바꾼 뒤 부른 `reload()`의 응답이, 그 전에 시작한
// 주기 요청의 늦은 응답에 덮이지 않게 하려는 것이다. 주기 요청은 다른
// 요청이 진행 중이면 건너뛴다. 응답이 주기보다 느린 서버에서 요청이
// 쌓이고 서로를 밀어내 화면이 영영 바뀌지 않는 일을 막는다.
export function usePolledApi<T>(
  path: string | null,
  intervalMs: number,
  options: PollOptions<T> = {},
): Polled<T> {
  const key = options.key ?? '';
  const [result, setResult] = useState<{
    path: string;
    key: string;
    loadable: Loadable<T>;
    readAt: number;
  } | null>(null);
  const reloadRef = useRef<() => Promise<void>>(() => NOTHING);

  const current =
    result !== null && result.path === path && result.key === key
      ? result
      : null;
  const stopped =
    current !== null &&
    (options.stopWhen?.(current.loadable, current.readAt) ?? false);
  const isTerminal = useEffectEvent(
    (error: unknown) => options.isTerminal?.(error) ?? false,
  );

  useEffect(() => {
    if (path === null || stopped) return;
    let cancelled = false;
    // 이 effect가 끝나면(화면을 떠남, 경로·키가 바뀜, 멈춤) 진행 중 요청을 끊는다.
    const life = new AbortController();
    let latest = 0;
    let inFlight = 0;
    const load = async (): Promise<void> => {
      const mine = ++latest;
      inFlight += 1;
      try {
        const data = await pollFetch<T>(path, life.signal);
        if (cancelled || mine !== latest) return;
        setResult({
          path,
          key,
          loadable: { status: 'loaded', data },
          readAt: Date.now(),
        });
      } catch (error) {
        if (cancelled || mine !== latest) return;
        const terminal = isTerminal(error);
        setResult((prev) =>
          !terminal &&
          prev !== null &&
          prev.path === path &&
          prev.key === key &&
          prev.loadable.status === 'loaded'
            ? prev
            : {
                path,
                key,
                loadable: { status: 'failed', error },
                readAt: Date.now(),
              },
        );
      } finally {
        inFlight -= 1;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (inFlight === 0) void load();
    }, intervalMs);
    reloadRef.current = load;
    return () => {
      cancelled = true;
      life.abort();
      clearInterval(timer);
      reloadRef.current = () => NOTHING;
    };
  }, [path, key, intervalMs, stopped]);

  const reload = useCallback(() => reloadRef.current(), []);
  return {
    data: current?.loadable ?? { status: 'loading' },
    readAt: current?.readAt ?? null,
    reload,
  };
}
