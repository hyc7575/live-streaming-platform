import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { Broadcast } from '../broadcasts';
import type { LoginPageState } from '../pages/LoginPage';
import {
  startWhipPublish,
  type PublishEvent,
  type WhipPublisher,
} from './whipPublisher';

export type PublishSessionState =
  | { kind: 'idle'; error: string | null }
  | { kind: 'requesting' }
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'ending' }
  | { kind: 'end-failed'; error: string }
  // `elsewhere`: the server ended it (another tab, a delete) while this page
  // was publishing.
  | { kind: 'ended'; elsewhere: boolean };

export interface PublishSession {
  state: PublishSessionState;
  /** Publishes `stream`. The caller keeps owning its tracks. */
  start: (stream: MediaStream) => void;
  /**
   * Sends `track` in place of the sent track of its kind. Before the publish
   * exists this does nothing: it sends whatever `stream` holds by then.
   */
  replaceTrack: (track: MediaStreamTrack) => void;
  /** Stops the publish, then ends the broadcast on the server. */
  end: () => void;
  /** Drops a publish that has not been ended, leaving the broadcast as it is. */
  cancel: () => void;
}

interface PublishTicket {
  publishUrl: string;
  expiresAt: string;
}

function tokenErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '송출을 시작하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
  switch (error.status) {
    case 403:
      return '권한이 없습니다.';
    case 404:
      return '방송을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.';
    case 409:
      return error.serverMessage ?? '지금은 이 방송을 송출할 수 없습니다.';
    default:
      return '송출을 시작하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
}

function publishErrorMessage(
  event: Exclude<PublishEvent, { kind: 'connected' }>,
): string {
  if (event.kind === 'disconnected') {
    return '송출 연결이 끊겼습니다. 다시 시작하세요.';
  }
  return event.status === 401
    ? '송출이 허가되지 않았습니다. 다시 시도하세요.'
    : '송출 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
}

const END_FAILED = '방송을 종료하지 못했습니다. 다시 시도하세요.';

// A LIVE delete ends the broadcast and then removes it, so a 404 here is an
// end too.
async function isEnded(broadcastId: string): Promise<boolean> {
  try {
    const b = await apiFetch<Broadcast>(`/broadcasts/${broadcastId}`);
    return b.status === 'ENDED';
  } catch (error) {
    return error instanceof ApiError && error.status === 404;
  }
}

// Leaving the page stops the publish but never ends the broadcast: an
// unplanned leave is the abnormal-end path, which the server handles.
export function usePublishSession(broadcastId: string): PublishSession {
  const navigate = useNavigate();
  const [state, setState] = useState<PublishSessionState>({
    kind: 'idle',
    error: null,
  });
  const publisher = useRef<WhipPublisher | null>(null);
  // Bumped whenever in-flight work stops mattering, so a late token or
  // status answer never acts for an attempt nobody is waiting on.
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
        let ticket: PublishTicket;
        try {
          ticket = await apiFetch<PublishTicket>(
            `/broadcasts/${broadcastId}/publish-token`,
            { method: 'POST' },
          );
        } catch (error) {
          if (!current()) return;
          if (error instanceof ApiError && error.status === 401) {
            goToLogin();
            return;
          }
          setState({ kind: 'idle', error: tokenErrorMessage(error) });
          return;
        }
        if (!current()) return;
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
                  : { kind: 'idle', error: publishErrorMessage(event) },
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
          // Deleted meanwhile: there is nothing left to end.
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

  return { state, start, end, cancel, replaceTrack };
}
