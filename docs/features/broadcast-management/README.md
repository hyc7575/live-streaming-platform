# 방송 관리

방송 생성·수정·삭제, 공개 목록, 내 방송, 상세, 방송 상태 전이.

- 우선순위: P0
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "방송 관리" 행
- §7.3 데이터 모델, §7.4 방송 상태(전이 규칙, 목록 노출, 사용자당 방송 준비 중 10개 상한)
- §7.5 방송 생성·수정·삭제 행

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #6 | #27 | 방송 생성·공개 목록·내 방송·상세 |
| #7 | #31 | 방송 수정·삭제와 인가 매트릭스 자동 테스트 |
| #74 | #80 | 방송을 만든 뒤 송출 화면으로 바로 간다 |
| #64 | #65 | 방송 목록 안 검색 (뒤에 [search](../search/)로 대체) |
| #212 | #220 | 사용자당 방송 준비 중 10개 상한, 넘으면 409와 안내 문구 ([STORIES-ready-cap](./STORIES-ready-cap.md)) |

## 코드

- api: `apps/api/src/broadcasts/` (방송 준비 중 상한은 `broadcasts.service.ts`의 `READY_PER_STREAMER_CAP`·`create`)
- web: `apps/web/src/pages/HomePage.tsx`, `StudioPage.tsx`, `NewBroadcastPage.tsx`, `EditBroadcastPage.tsx`
- web: `apps/web/src/components/BroadcastForm.tsx`, `BroadcastGrid.tsx`, `OwnerActions.tsx`, `StatusBadge.tsx`
- web: `apps/web/src/broadcast-list.ts`, `broadcasts.ts`

## 확인

- 시나리오: [SCENARIOS.md](./SCENARIOS.md) (기기별 체크리스트), 방송 준비 중 상한은 [SCENARIOS-ready-cap.md](./SCENARIOS-ready-cap.md)
- 인수 시나리오: `PRD.md` §8.3 1, 2-1, 4, 7
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 1절, 2절

## 관련 기능

방송 준비 중 노출은 [chat-and-ready](../chat-and-ready/), 목록 카드 그림은 [thumbnail-standby](../thumbnail-standby/), 카테고리는 [category](../category/)에 있다.
