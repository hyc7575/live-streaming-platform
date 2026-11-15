# 팔로우

스트리머를 팔로우하고, 왼쪽 패널에서 팔로우한 스트리머의 LIVE 여부를 본다.

- 우선순위: P2
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "팔로우" 행
- §7.3 `Follow`
- §7.5 팔로우·내 팔로우 목록 행과 검사 순서
- §8.2 알림은 하지 않는다

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #60 | #67 | 스트리머 팔로우와 좌측 팔로우 패널 |

## 코드

- api: `apps/api/src/follows/`
- web: `apps/web/src/follows/`
- web: `apps/web/src/layout/FollowPanel.tsx`
- web: `apps/web/src/pages/FollowingPage.tsx`

## 확인

- 인수 시나리오: `PRD.md` §8.3 14
- 수동 확인 절차: 루트 `README.md` "기능 확인"의 9절

## 관련 기능

스튜디오의 팔로워 목록은 [mypage](../mypage/)에 있다.
