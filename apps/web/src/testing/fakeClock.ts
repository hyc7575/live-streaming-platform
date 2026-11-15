import { act } from '@testing-library/react';
import { vi } from 'vitest';

// 표시 시간(6초)·폴링(5초)처럼 시간에 걸린 화면 테스트용 가짜 시계.
//
// 시계는 테스트가 `advanceClock`으로 넘길 때만 움직인다(`shouldAdvanceTime`을
// 쓰지 않는다). 그래서 기계가 느려도 배너가 저절로 내려가거나 폴링이 더
// 돌지 않는다. fetch 응답·BroadcastChannel 메시지는 실제 이벤트 루프로
// 오므로, 가짜로 바꾸지 않는 `setImmediate` 차례로 기다린다(`eventually`).
// RTL의 `findBy`·`waitFor`는 가짜 `setTimeout`을 기다리다 멈추므로 이 시계와
// 함께 쓰지 않는다.

export function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] });
}

// 시계를 `ms`만큼 넘기고, 그 사이 걸린 타이머와 그 뒤 렌더·effect를 돌린다.
export async function advanceClock(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// 이벤트 루프를 한 차례 돌린다. 시계는 움직이지 않는다.
async function nextTurn(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
}

// 응답이 와서 `check`가 통과할 때까지 이벤트 루프를 돌린다. 시간이 아니라
// 차례 수로 끊으므로 느린 CI에서도 결과가 같다.
const MAX_TURNS = 200;

export async function eventually<T>(check: () => T): Promise<T> {
  let failure: unknown;
  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    try {
      return check();
    } catch (error) {
      failure = error;
    }
    await nextTurn();
  }
  throw failure;
}
