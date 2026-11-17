# 방송 관리

방송 생성·수정·삭제, 공개 목록, 내 방송, 상세, 방송 상태 전이.

- 우선순위: P0
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "방송 관리" 행
- §7.3 데이터 모델, §7.4 방송 상태(전이 규칙, 목록 노출, 사용자당 방송 준비 중 1개 상한)
- §7.5 방송 생성·수정·삭제 행

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #6 | #27 | 방송 생성·공개 목록·내 방송·상세 |
| #7 | #31 | 방송 수정·삭제와 인가 매트릭스 자동 테스트 |
| #74 | #80 | 방송을 만든 뒤 송출 화면으로 바로 간다 |
| #64 | #65 | 방송 목록 안 검색 (뒤에 [search](../search/)로 대체) |
| #252 | #253 | LIVE 전 방송을 송출 화면에서 바로 삭제한다. "시청 화면 열기" 옆 버튼, 확인은 모달 (`DeleteBroadcast`, [STORIES-publish-delete](./STORIES-publish-delete.md)) |
| #212 | #220 | 사용자당 방송 준비 중 상한(처음 10개, 사용자 결정으로 20개), 넘으면 409와 안내 문구 ([STORIES-ready-cap](./STORIES-ready-cap.md), #255로 대체) |
| #255 | (이 PR) | 방송 준비 중을 사용자당 1개로 줄이고, 이미 있으면 409와 "이미 준비 중인 방송이 있습니다" 안내 ([STORIES-ready-one](./STORIES-ready-one.md)) |

## 코드

- api: `apps/api/src/broadcasts/` (방송 준비 중 상한은 `broadcasts.service.ts`의 `READY_PER_STREAMER_CAP`·`create`)
- web: `apps/web/src/pages/HomePage.tsx`, `StudioPage.tsx`, `NewBroadcastPage.tsx`, `EditBroadcastPage.tsx`
- web: `apps/web/src/components/BroadcastForm.tsx`, `BroadcastGrid.tsx`, `OwnerActions.tsx`, `DeleteBroadcast.tsx`, `StatusBadge.tsx`
- web: `apps/web/src/broadcast-list.ts`, `broadcasts.ts`

## 확인

- 시나리오: [SCENARIOS.md](./SCENARIOS.md) (기기별 체크리스트), 방송 준비 중 1개 상한은 [SCENARIOS-ready-one.md](./SCENARIOS-ready-one.md)(20개 상한 시절의 [SCENARIOS-ready-cap.md](./SCENARIOS-ready-cap.md)는 대체됨), 송출 화면 삭제는 [SCENARIOS-publish-delete.md](./SCENARIOS-publish-delete.md)
- 인수 시나리오: `PRD.md` §8.3 1, 2-1, 4, 7
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 1절, 2절

## 관련 기능

방송 준비 중 노출은 [chat-and-ready](../chat-and-ready/), 목록 카드 그림은 [thumbnail-standby](../thumbnail-standby/), 카테고리는 [category](../category/)에 있다.
