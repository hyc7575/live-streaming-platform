# 녹화·다시보기

OME 녹화 기능으로 방송을 저장하고, 끝난 방송을 다시 본다.

- 우선순위: P2
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "녹화·다시보기" 행
- §8.4 녹화
- §7.9 데이터(녹화 저장 용량 상한)
- [OPERATIONS.md](../../OPERATIONS.md) 녹화 파일

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #19 | #52 | 녹화·다시보기와 녹화 용량 상한 |
| #75 | #82 | 방송 종료 뒤 다시보기가 새로고침 없이 뜨게 하기 |
| #92 | #95 | 다시보기에서 채팅을 재생 위치에 맞춰 보여 준다 |

## 코드

- api: `apps/api/src/recording/`
- web: `apps/web/src/components/ReplayPlayer.tsx`
- web: `apps/web/src/replay-chat.ts`

## 확인

- 인수 시나리오: §8.3에는 녹화 전용 시나리오가 없다
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 7절

## 관련 기능

다시보기 컨트롤은 [player-controls](../player-controls/), 다시보기 채팅 결정은 [chat-and-ready](../chat-and-ready/)에 있다.
