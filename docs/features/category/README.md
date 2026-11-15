# 카테고리·게임 타이틀

방송에 대분류 카테고리 6개를 붙여 홈에서 거르고, 게임 방송에는 Wikidata 목록에서 고른 게임 타이틀을 붙인다.

- 우선순위: P2
- 상태: 구현 완료

## 문서

- [DISCOVERY.md](./DISCOVERY.md)
- [PRD.md](./PRD.md)

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §8.2 카테고리 줄

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #131 | #134 | 카테고리 PRD와 discovery 문서 |
| #132 | #135 | 대분류 카테고리와 홈 카테고리 필터 |
| #133 | #136 | Wikidata 게임 목록에서 고른 게임 타이틀 |

## 코드

- api: `apps/api/src/games/`, `games-import/`
- api: `apps/api/src/broadcasts/game-update.ts`
- web: `apps/web/src/categories.ts`
- web: `apps/web/src/components/CategoryBadge.tsx`, `GameCombobox.tsx`
- web: `apps/web/src/pages/HomePage.tsx` (카테고리 칩)
- web: `apps/web/src/components/BroadcastForm.tsx` (카테고리 선택)

## 확인

- 인수 시나리오: `PRD.md` §8.3 22~25
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 15절, 16절
