# 썸네일·대기 이미지

목록 카드 기본 그림, 송출 화면 캡처 썸네일, 기본 대기 이미지를 정한 전략이다.

- 우선순위: P2
- 상태: 구현 완료

## 문서

- [STRATEGY.md](./STRATEGY.md)
- [STORIES-id-normalization.md](./STORIES-id-normalization.md): 방송 id 대소문자 정규화 수락 기준 (#210)
- [SCENARIOS-id-normalization.md](./SCENARIOS-id-normalization.md): 그 시나리오
- [STORIES-upload-limits.md](./STORIES-upload-limits.md): 이미지 업로드 본문 한도(#211)
- [SCENARIOS-upload-limits.md](./SCENARIOS-upload-limits.md): 그 시나리오

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.5 썸네일 업로드 행과 그 아래 규칙

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #61 | #66 | 목록 카드 기본 그림·방송 전 안내·경과 시간 |
| #62 | #72 | 송출 화면 캡처 썸네일 |
| #63 | #79 | 기본 대기 이미지 (구현은 [channel-settings](../channel-settings/)) |
| #210 | #217 | 방송 id 대소문자 변형으로 rate 제한 우회·고아 썸네일 폴더 |
| #211 | #218 | 이미지 업로드 라우트의 multipart 한도와 Caddy 본문 상한 |

## 코드

- api: `apps/api/src/broadcasts/thumbnail-rate.guard.ts`
- api: `apps/api/src/broadcasts/canonical-broadcast-id.ts` (`configureApp`에서 등록, 가드 전에 `/api/broadcasts/<uuid>`를 소문자로)
- api: `apps/api/src/images/image-rules.ts` (`ImageUpload`의 multipart 한도), 회귀 `apps/api/test/image-upload-limits.e2e.spec.ts`
- deploy: `deploy/Caddyfile` (`/api/*` `request_body max_size`)
- web: `apps/web/src/publish/thumbnailCapture.ts`
- web: `apps/web/src/components/BroadcastThumbnail.tsx`, `ElapsedTime.tsx`

## 확인

- 인수 시나리오: §8.3에는 썸네일 전용 시나리오가 없다
- id 정규화 시나리오: [SCENARIOS-id-normalization.md](./SCENARIOS-id-normalization.md)
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 "목록 카드 기본 그림…", "송출 화면 캡처 썸네일", "기본 대기 이미지"

## 관련 기능

후속 논의는 [chat-and-ready/STRATEGY-chat-replay.md](../chat-and-ready/STRATEGY-chat-replay.md)로 이어진다.
