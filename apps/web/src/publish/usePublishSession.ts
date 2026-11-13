import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { Broadcast } from '../broadcasts';
import type { LoginPageState } from '../pages/LoginPage';
import { requestPublishTicket } from './publishTicket';
import {
  startWhipPublish,
  type PublishEvent,
  type WhipPublisher,
} from './whipPublisher';

export type PublishSessionState =
  // `retry`: 송출이 거절됐거나 연결되지 않았다. 그래서 시작 버튼이
  // 다시 시도하자고 권한다.
  | { kind: 'idle'; error: string | null; retry?: boolean }
  | { kind: 'requesting' }
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'ending' }
  | { kind: 'end-failed'; error: string }
  // `elsewhere`: 이 페이지가 송출하는 동안 서버가 송출을 끝냈다
  // (다른 탭, 삭제).
  | { kind: 'ended'; elsewhere: boolean };

export interface PublishSession {
  state: PublishSessionState;
  /** `stream`을 송출한다. 트랙은 계속 호출한 쪽이 가진다. */
  start: (stream: MediaStream) => void;
  /**
   * 같은 종류로 보내던 트랙 대신 `track`을 보낸다. 송출이
   * 생기기 전에는 아무것도 하지 않는다. 그때 `stream`에 든 트랙을 보낸다.
   */
  replaceTrack: (track: MediaStreamTrack) => void;
  /** 다음 `replaceTrack` 전까지 `kind` 트랙을 보내지 않는다. */
  releaseTrack: (kind: 'audio' | 'video') => void;
  /** 송출을 멈추고, 서버에서 방송을 끝낸다. */
  end: () => void;
  /** 끝내지 않은 송출을 버리고, 방송은 그대로 둔다. */
  cancel: () => void;
}

function publishErrorMessage(
  event: Exclude<PublishEvent, { kind: 'connected' }>,
): string {
  if (event.kind === 'disconnected') {
    return '송출 연결이 끊겼습니다. 다시 시작하세요.';
  }
  if (event.status === 401) {
    return '송출이 허가되지 않았습니다. 다시 시도하세요.';
  }
  // OME가 답하지 않았거나 ICE가 끝내 연결되지 않았다. 대개 네트워크가
  // UDP와 TURN을 모두 막은 경우다.
  return event.status === null
    ? '송출 서버에 연결하지 못했습니다. 네트워크를 바꾸거나 다시 시도하세요.'
    : '송출 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
}

const END_FAILED = '방송을 종료하지 못했습니다. 다시 시도하세요.';

// LIVE 방송을 지우면 방송을 끝낸 뒤 없앤다. 그래서 여기서 404도
// 종료다.
async function isEnded(broadcastId: string): Promise<boolean> {
  try {
    const b = await apiFetch<Broadcast>(`/broadcasts/${broadcastId}`);
    return b.status === 'ENDED';
  } catch (error) {
    return error instanceof ApiError && error.status === 404;
  }
}

// 페이지를 떠나면 송출은 멈추지만 방송은 끝내지 않는다. 계획 없이
// 떠나는 것은 비정상 종료 경로이고, 서버가 처리한다.
export function usePublishSession(broadcastId: string): PublishSession {
  const navigate = useNavigate();
  const [state, setState] = useState<PublishSessionState>({
    kind: 'idle',
    error: null,
  });
  const publisher = useRef<WhipPublisher | null>(null);
  // 진행 중인 작업이 의미를 잃을 때마다 값을 올린다. 그래서 늦게 온 토큰이나
  // 상태 응답이 아무도 기다리지 않는 시도를 위해 움직이지 않는다.
  const attempt = useRef(0);

  const dropPublisher = useCallback(() => {
    attempt.current += 1;
    publisher.current?.stop();
    publisher.current = null;
  }, []);

  useEffect(() => dropPublisher, [dropPublisher]);

  const goToLogin = useCallback(() => {
    const next: LoginPageState = { from: `/studio/broadcasts/${broadcastId}` };
    void navigate('/login', { state: next });
  }, [broadcastId, navigate]);

  const start = useCallback(
    (stream: MediaStream) => {
      dropPublisher();
      const mine = attempt.current;
      const current = () => mine === attempt.current;
      setState({ kind: 'requesting' });

      void (async () => {
        const ticket = await requestPublishTicket(broadcastId, 'browser');
        if (!current()) return;
        if (ticket.kind === 'unauthorized') {
          goToLogin();
          return;
        }
        if (ticket.kind === 'refused') {
          setState({ kind: 'idle', error: ticket.error });
          return;
        }
        publisher.current = startWhipPublish(
          stream,
          ticket.publishUrl,
          (event) => {
            if (!current()) return;
            if (event.kind === 'connected') {
              setState({ kind: 'live' });
              return;
            }
            publisher.current = null;
            void isEnded(broadcastId).then((ended) => {
              if (!current()) return;
              setState(
                ended
                  ? { kind: 'ended', elsewhere: true }
                  : {
                      kind: 'idle',
                      error: publishErrorMessage(event),
                      retry: event.kind === 'failed',
                    },
              );
            });
          },
        );
        setState({ kind: 'connecting' });
      })();
    },
    [broadcastId, dropPublisher, goToLogin],
  );

  const end = useCallback(() => {
    dropPublisher();
    const mine = attempt.current;
    setState({ kind: 'ending' });
    apiFetch<Broadcast>(`/broadcasts/${broadcastId}/end`, {
      method: 'POST',
    }).then(
      () => {
        if (mine === attempt.current) {
          setState({ kind: 'ended', elsewhere: false });
        }
      },
      (error: unknown) => {
        if (mine !== attempt.current) return;
        if (error instanceof ApiError && error.status === 404) {
          // 그사이 지워졌다. 끝낼 것이 남지 않았다.
          setState({ kind: 'ended', elsewhere: true });
        } else if (error instanceof ApiError && error.status === 401) {
          goToLogin();
        } else {
          setState({ kind: 'end-failed', error: END_FAILED });
        }
      },
    );
  }, [broadcastId, dropPublisher, goToLogin]);

  const cancel = useCallback(() => {
    dropPublisher();
    setState({ kind: 'idle', error: null });
  }, [dropPublisher]);

  const replaceTrack = useCallback((track: MediaStreamTrack) => {
    publisher.current?.replaceTrack(track);
  }, []);

  const releaseTrack = useCallback((kind: 'audio' | 'video') => {
    publisher.current?.releaseTrack(kind);
  }, []);

  return { state, start, end, cancel, replaceTrack, releaseTrack };
}
