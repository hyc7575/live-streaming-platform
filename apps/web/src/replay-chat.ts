import type { RecordingPart } from './broadcasts';
import type { ChatMessage } from './chat';

// 시청자는 스트림보다 몇 초 늦은 LL-HLS를 보며 입력한다
// (ome/Server.xml LLHLS PartHoldBack 1.5 s에 플레이어 버퍼를 더한 만큼). 그래서
// 메시지는 createdAt보다 대략 이만큼 앞서 화면에 나온 장면을 가리킨다.
// createdAt과 각 파트의 시작 시각은 모두 서버 시계에서 온다.
// 시청자의 시계는 여기에 끼지 않는다.
export const VIEWER_DELAY_MS = 3000;

// 녹화 속 한 지점이다. 몇 번째 부(0부터)이고 그 안에서 얼마나 지났는지다.
export interface Playhead {
  part: number;
  seconds: number;
}

// 각 파트의 영상이 시작한 시각(ms)이다. 다시보기를 채팅과 맞출 수 없으면
// null이다: 파트가 없거나, 시작 시각이 기록되지 않은 파트가 있다.
export function partStarts(parts: readonly RecordingPart[]): number[] | null {
  if (parts.length === 0) return null;
  const starts: number[] = [];
  for (const { startedAt } of parts) {
    if (startedAt === null) return null;
    starts.push(Date.parse(startedAt));
  }
  return starts;
}

// 메시지가 다시보기의 어디에 놓이는지 정한다. 첫 파트 전(READY)의 채팅은
// 첫 파트의 0 s에 놓인다. 파트 사이 공백의 채팅은 앞 파트의 끝을 넘어서므로,
// 재생이 다음 파트에 닿으면 보인다.
export function chatPlacement(
  createdAtMs: number,
  starts: readonly number[],
): Playhead {
  const at = createdAtMs - VIEWER_DELAY_MS;
  let part = 0;
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] <= at) part = i;
  }
  return { part, seconds: Math.max(0, (at - starts[part]) / 1000) };
}

export function isReached(placement: Playhead, playhead: Playhead): boolean {
  return placement.part === playhead.part
    ? placement.seconds <= playhead.seconds
    : placement.part < playhead.part;
}

// 다시보기가 `playhead`에 닿을 때까지 보낸 메시지다.
export function chatUpTo(
  messages: readonly ChatMessage[],
  starts: readonly number[],
  playhead: Playhead,
): ChatMessage[] {
  return messages.filter((m) =>
    isReached(chatPlacement(Date.parse(m.createdAt), starts), playhead),
  );
}
