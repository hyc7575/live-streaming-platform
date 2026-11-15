# 썸네일·대기 이미지

목록 카드 기본 그림, 송출 화면 캡처 썸네일, 기본 대기 이미지를 정한 전략이다.

- 우선순위: P2
- 상태: 구현 완료

## 문서

- [STRATEGY.md](./STRATEGY.md)

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.5 썸네일 업로드 행과 그 아래 규칙

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #61 | #66 | 목록 카드 기본 그림·방송 전 안내·경과 시간 |
| #62 | #72 | 송출 화면 캡처 썸네일 |
| #63 | #79 | 기본 대기 이미지 (구현은 [channel-settings](../channel-settings/)) |

## 코드

- api: `apps/api/src/broadcasts/thumbnail-rate.guard.ts`
- web: `apps/web/src/publish/thumbnailCapture.ts`
- web: `apps/web/src/components/BroadcastThumbnail.tsx`, `ElapsedTime.tsx`

## 확인

- 인수 시나리오: §8.3에는 썸네일 전용 시나리오가 없다
- 수동 확인 절차: 루트 `README.md` "기능 확인"의 "목록 카드 기본 그림…", "송출 화면 캡처 썸네일", "기본 대기 이미지"

## 관련 기능

후속 논의는 [chat-and-ready/STRATEGY-chat-replay.md](../chat-and-ready/STRATEGY-chat-replay.md)로 이어진다.
