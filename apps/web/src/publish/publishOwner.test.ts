import { describe, expect, it } from 'vitest';
import type { Broadcast } from '../broadcasts';
import {
  decidePublishScreen,
  type PublishOwnerInput,
  type PublishScreen,
} from './publishOwner';
import type { PublishSessionState } from './usePublishSession';

const IDLE: PublishSessionState = { kind: 'idle', error: null };
const LIVE: PublishSessionState = { kind: 'live' };
const DISCONNECTED_AT = '2026-11-16T00:00:00.000Z';

function input(
  session: PublishSessionState,
  status: Broadcast['status'],
  more: Partial<Omit<PublishOwnerInput, 'session' | 'broadcast'>> & {
    disconnectedAt?: string | null;
  } = {},
): PublishOwnerInput {
  const { disconnectedAt = null, ...memory } = more;
  return {
    session,
    broadcast: { status, disconnectedAt },
    sessionWentLive: false,
    obsUrlIssued: false,
    sawPublishingElsewhere: false,
    ...memory,
  };
}

function studio(
  onAir: boolean,
  publishingElsewhere: boolean,
  endControl: 'confirm' | 'retry' | null,
): PublishScreen {
  return { kind: 'studio', onAir, publishingElsewhere, endControl };
}

function ended(
  endedBy: 'me' | 'elsewhere',
  obsStopReminder = false,
): PublishScreen {
  return { kind: 'ended', endedBy, obsStopReminder };
}

describe('누가 송출 중인가', () => {
  it.each<[string, PublishOwnerInput, PublishScreen]>([
    [
      'READY를 처음 열면 아무도 송출하지 않는다',
      input(IDLE, 'READY'),
      studio(false, false, null),
    ],
    [
      '이 탭이 송출을 만드는 중이면 종료 버튼이 없다',
      input({ kind: 'connecting' }, 'READY'),
      studio(false, false, null),
    ],
    [
      '이 탭이 송출 중이면 방송 종료를 확인한다(폴링이 아직 READY여도)',
      input(LIVE, 'READY'),
      studio(true, false, 'confirm'),
    ],
    [
      '이 탭이 송출 중이고 폴링도 LIVE면 다른 쪽 송출이 아니다',
      input(LIVE, 'LIVE'),
      studio(true, false, 'confirm'),
    ],
    [
      '이 탭은 송출하지 않는데 LIVE이고 연결이 살아 있으면 OBS나 다른 탭이다',
      input(IDLE, 'LIVE'),
      studio(true, true, 'confirm'),
    ],
    [
      '연결이 끊긴 LIVE(유예 시간)는 브라우저가 이어받을 수 있다',
      input(IDLE, 'LIVE', { disconnectedAt: DISCONNECTED_AT }),
      studio(true, false, 'confirm'),
    ],
    [
      '이 탭의 송출이 끊긴 뒤 폴링이 LIVE를 읽기 전에도 종료 버튼을 남긴다',
      input({ kind: 'idle', error: '끊김', retry: false }, 'READY', {
        sessionWentLive: true,
      }),
      studio(true, false, 'confirm'),
    ],
    [
      '종료 요청 중에는 종료 버튼이 없다',
      input({ kind: 'ending' }, 'LIVE'),
      studio(true, false, null),
    ],
    [
      '종료에 실패하면 다시 종료하기를 보인다',
      input({ kind: 'end-failed', error: '실패' }, 'LIVE'),
      studio(true, false, 'retry'),
    ],
    [
      '연결 중에 LIVE를 읽어도 다른 쪽 송출로 보지 않는다',
      input({ kind: 'connecting' }, 'LIVE'),
      studio(true, false, null),
    ],
  ])('%s', (_name, given, expected) => {
    expect(decidePublishScreen(given)).toEqual(expected);
  });
});

describe('종료 화면', () => {
  it.each<[string, PublishOwnerInput, PublishScreen]>([
    [
      '이 탭이 끝냈다',
      input({ kind: 'ended', elsewhere: false }, 'LIVE'),
      ended('me'),
    ],
    [
      '이 탭이 송출하는 동안 서버가 끝냈다',
      input({ kind: 'ended', elsewhere: true }, 'LIVE'),
      ended('elsewhere'),
    ],
    [
      '이 탭이 송출하지 않는 동안 ENDED를 읽었다',
      input(IDLE, 'ENDED'),
      ended('elsewhere'),
    ],
    [
      '이 탭의 종료가 폴링 ENDED보다 앞선다',
      input({ kind: 'ended', elsewhere: false }, 'ENDED'),
      ended('me'),
    ],
    [
      '송출 중인 탭은 폴링 ENDED만으로 종료 화면을 띄우지 않는다',
      input(LIVE, 'ENDED'),
      studio(true, false, 'confirm'),
    ],
    [
      '여기서 OBS 주소를 발급했으면 OBS를 멈추라고 알린다',
      input(IDLE, 'ENDED', { obsUrlIssued: true }),
      ended('elsewhere', true),
    ],
    [
      '다른 쪽 송출을 본 적이 있으면 OBS를 멈추라고 알린다',
      input({ kind: 'ended', elsewhere: false }, 'LIVE', {
        sawPublishingElsewhere: true,
      }),
      ended('me', true),
    ],
    [
      '브라우저로만 송출했으면 OBS 안내가 없다',
      input({ kind: 'ended', elsewhere: false }, 'LIVE', {
        sessionWentLive: true,
      }),
      ended('me'),
    ],
  ])('%s', (_name, given, expected) => {
    expect(decidePublishScreen(given)).toEqual(expected);
  });
});
