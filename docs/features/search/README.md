# 검색

서버가 스트리머·방송·지난 방송을 한 번에 찾고, 어느 화면에서든 헤더에서 검색한다.

- 우선순위: P2
- 상태: 구현 완료

## 문서

- [DISCOVERY.md](./DISCOVERY.md)
- [PRD.md](./PRD.md)

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §8.2 카테고리·검색 줄

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #64 | #65 | 방송 목록 안 검색 (이 기능으로 대체) |
| #137 | #140 | 검색 PRD와 discovery 문서 |
| #138 | #141 | 서버 검색 API와 `/search` 결과 화면 |
| #139 | #142 | 검색창을 헤더로 옮기고 홈 검색창을 없앤다 |

## 코드

- api: `apps/api/src/search/`
- api: `apps/api/src/games/search-text.ts`
- web: `apps/web/src/pages/SearchPage.tsx`
- web: `apps/web/src/layout/AppLayout.tsx` (헤더 검색)
- web: `apps/web/src/search.ts`

## 확인

- 인수 시나리오: `PRD.md` §8.3 26~29
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 17절, 18절
