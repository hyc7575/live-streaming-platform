# 채널 페이지·마이페이지

누구나 보는 채널 페이지, 라임 내역·보낸 후원·프로필을 보는 마이페이지, 받은 후원 합계·팔로워를 보는 스튜디오.

- 우선순위: P2
- 상태: 구현 완료

## 문서

- [DISCOVERY.md](./DISCOVERY.md)
- [PRD.md](./PRD.md)

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "마이페이지"·"채널 페이지" 행
- §7.5 채널 페이지·프로필·내역 조회 행

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #117 | #121 | 라임 내역·보낸 후원·팔로워 |
| #118 | #122 | 방송을 지워도 줄지 않는 받은 후원 합계 |
| #119 | #123 | 스트리머 채널 페이지 |
| #120 | #124 | 프로필 편집 |
| #116 | #127 | 구현 결과를 PRD와 discovery 문서에 반영 |

## 코드

- api: `apps/api/src/streamers/`
- api: `apps/api/src/channel/profile.controller.ts`, `profile.service.ts`
- web: `apps/web/src/pages/StreamerPage.tsx`, `LimeHistoryPage.tsx`, `SentDonationsPage.tsx`, `ProfilePage.tsx`
- web: `apps/web/src/pages/ReceivedDonationsPage.tsx`, `FollowersPage.tsx`

## 확인

- 인수 시나리오: `PRD.md` §8.3 17~21
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 11~14절
