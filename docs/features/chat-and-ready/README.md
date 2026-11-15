# 방송 준비 중 노출, 채팅·댓글 분리

방송 준비 중(READY) 방송을 목록에 보이고, 방송 전·중 채팅과 방송 후 댓글을 나누고, 다시보기에서 채팅을 재생 위치에 맞춘다.

- 우선순위: P2
- 상태: 구현 완료

## 문서

- [STRATEGY-chat-replay.md](./STRATEGY-chat-replay.md)
- [STRATEGY-standby-scene.md](./STRATEGY-standby-scene.md)
- [PRD.md](./PRD.md) (두 전략의 결정을 확정)

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.4 목록 노출
- §7.5 채팅 행과 채팅·댓글 규칙
- §8.2 채팅 실시간 푸시는 하지 않는다
- [ADR 0002](../../adr/0002-chat-cursor-polling.md) 채팅은 커서 폴링으로 받는다

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #90 | #93 | READY 방송을 공개 목록에 노출 |
| #91 | #94 | 채팅과 댓글을 나눈다 |
| #92 | #95 | 다시보기 채팅을 재생 위치에 맞춘다 |

## 코드

- api: `apps/api/src/chat/`
- web: `apps/web/src/components/ChatPanel.tsx`
- web: `apps/web/src/chat.ts`, `use-chat-feed.ts`, `replay-chat.ts`

## 확인

- 인수 시나리오: §8.3에는 전용 시나리오가 없다
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 "방송 준비 중 노출", 6절, 7절
