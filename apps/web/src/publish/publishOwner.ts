import { useState } from 'react';
import type { Broadcast } from '../broadcasts';
import type { PublishSession, PublishSessionState } from './usePublishSession';

// 송출 화면은 송출 주체(이 탭의 브라우저, OBS나 다른 탭)를 서버가 주는 방송
// 상태로만 짐작한다. 그 짐작에서 나오는 화면 결정을 여기 한 곳에서 내린다.

export type PublishOwnerInput = {
  /** 이 탭의 브라우저 송출. */
  session: PublishSessionState;
  /** 이 탭의 송출이 한 번이라도 연결되었다(`PublishSession.wentLive`). */
  sessionWentLive: boolean;
  /** 폴링한 방송. 아직 읽지 못했으면 처음 연 방송이다. */
  broadcast: Pick<Broadcast, 'status' | 'disconnectedAt'>;
  /** 이 화면에서 OBS 송출 주소를 발급했다. */
  obsUrlIssued: boolean;
  /** 이 화면이 다른 쪽 송출(OBS나 다른 탭)을 본 적이 있다. */
  sawPublishingElsewhere: boolean;
};

/**
 * - `confirm`: "방송 종료"를 누르면 한 번 더 확인한다.
 * - `retry`: 종료 요청이 실패해 "다시 종료하기"를 보인다.
 */
export type EndControlKind = 'confirm' | 'retry' | null;

export type PublishScreen =
  | {
      kind: 'ended';
      /** `me`: "방송을 종료했습니다." `elsewhere`: "방송이 종료되었습니다." */
      endedBy: 'me' | 'elsewhere';
      /**
       * OBS는 방송이 끝난 뒤에도 재연결을 계속한다(#88). 그래서 OBS를 썼을
       * 수 있으면 OBS에서도 방송을 멈추라고 알린다.
       */
      obsStopReminder: boolean;
    }
  | {
      kind: 'studio';
      /**
       * 읽은 방송이 LIVE이거나, 이 탭의 송출이 지금 연결돼 있거나 한 번이라도
       * 연결되었다. 이 탭이 송출하지 않아도(새로고침, 송출 끊김, OBS)
       * 스트리머에게는 방송을 끝낼 방법이 필요하다. 이 탭이 `idle`일 때만
       * 뜻이 있다. 종료 요청 중·연결 중에 읽은 ENDED는 이 값을 false로 만들
       * 수 있으므로, 그때는 `endControl`을 본다.
       */
      onAir: boolean;
      /**
       * OBS나 다른 탭이 송출 중이다. 방송 하나는 송출 연결 하나만 받으므로
       * 브라우저 송출 시작을 막고 안내한다.
       */
      publishingElsewhere: boolean;
      endControl: EndControlKind;
    };

export function decidePublishScreen(input: PublishOwnerInput): PublishScreen {
  const { session, broadcast } = input;
  const publishingElsewhere = isPublishingElsewhere(input);

  const endedBy =
    session.kind === 'ended'
      ? session.elsewhere
        ? 'elsewhere'
        : 'me'
      : session.kind === 'idle' && broadcast.status === 'ENDED'
        ? 'elsewhere'
        : null;
  if (endedBy !== null) {
    return {
      kind: 'ended',
      endedBy,
      obsStopReminder:
        input.obsUrlIssued ||
        input.sawPublishingElsewhere ||
        publishingElsewhere,
    };
  }

  // 방송 상태는 READY → LIVE → ENDED로만 가고 폴링은 마지막 응답을 지키므로,
  // 한 번 읽은 LIVE는 ENDED가 오기 전까지 그대로다. 이 탭의 송출은 폴링보다
  // 먼저 알 수 있어 따로 기억한다.
  const onAir =
    broadcast.status === 'LIVE' ||
    session.kind === 'live' ||
    input.sessionWentLive;
  const endControl: EndControlKind =
    session.kind === 'end-failed'
      ? 'retry'
      : session.kind === 'live' || (session.kind === 'idle' && onAir)
        ? 'confirm'
        : null;
  return { kind: 'studio', onAir, publishingElsewhere, endControl };
}

// 송출이 끊긴 LIVE 방송(`disconnectedAt`)은 유예 시간 중이고, 이 탭이 그
// 자리를 채울 수 있다.
function isPublishingElsewhere({
  session,
  broadcast,
}: PublishOwnerInput): boolean {
  return (
    broadcast.status === 'LIVE' &&
    broadcast.disconnectedAt === null &&
    session.kind === 'idle'
  );
}

export type PublishOwner = {
  screen: PublishScreen;
  /** OBS 송출 주소를 발급할 때 부른다. */
  noteObsUrlIssued: () => void;
};

/** {@link decidePublishScreen}에 넘길 기억을 들고 화면 결정을 낸다. */
export function usePublishOwner(
  session: PublishSession,
  broadcast: Pick<Broadcast, 'status' | 'disconnectedAt'>,
): PublishOwner {
  const [obsUrlIssued, setObsUrlIssued] = useState(false);
  const [sawPublishingElsewhere, setSawPublishingElsewhere] = useState(false);
  const input: PublishOwnerInput = {
    session: session.state,
    sessionWentLive: session.wentLive,
    broadcast,
    obsUrlIssued,
    sawPublishingElsewhere,
  };
  // 렌더 중 갱신을 남긴다. 다른 쪽 송출은 폴링 응답에만 드러나고 그걸 알리는
  // 이벤트가 없다. effect에서 기억하면 react-hooks의 set-state-in-effect에
  // 걸린다. 이번 렌더의 판정은 지금 값도 보므로 이 기억은 다음 렌더부터
  // 쓰인다(종료 화면의 OBS 안내).
  if (isPublishingElsewhere(input) && !sawPublishingElsewhere) {
    setSawPublishingElsewhere(true);
  }
  return {
    screen: decidePublishScreen(input),
    noteObsUrlIssued: () => setObsUrlIssued(true),
  };
}
