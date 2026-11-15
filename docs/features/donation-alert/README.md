# 후원 알림·순위

후원이 확정되면 스트리머와 시청자가 바로 알게 한다. 송출 화면 토스트, 시청 화면 배너, 채팅의 후원 줄, 방송별 후원 순위가 여기에 들어간다.

- 우선순위: P2
- 상태: S1·S2·S5·S6·S8·S9·S12 구현 완료. S0 스파이크, S3 알림음, S11 문서는 열려 있다

## 문서

- [DISCOVERY.md](./DISCOVERY.md): 탐색. 지금 누가 후원을 어떻게 아는지, 아이디어와 가정, 실험
- [STORIES.md](./STORIES.md): 스토리와 수락 기준. 이슈 본문의 S 번호가 이 문서를 가리킨다

## 요구사항 위치

- 상위 이슈 #157 본문(하는 것, 하지 않는 것, 2026-11-15 결정)
- 화면 배치: `apps/web/CLAUDE.md` 시청·송출 행

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #157 | #168 | 후원 알림·순위의 디스커버리와 스토리 (상위 이슈) |
| #159 | #169 | S1 송출 화면 새 후원 토스트 |
| #163 | #170 | S12 방송별 후원 순위를 서버에서 집계 |
| #160 | #171 | S2 송출 화면 사이드 패널의 후원 합계와 후원자별 누적 |
| #161 | #172 | S5 시청 화면 플레이어 위 새 후원 배너 |
| #165 | #173 | S9 송출 화면 사이드 패널의 채팅 |
| #166 | #174 | S8 후원 메시지를 채팅의 후원 줄로 (DB 변경) |
| #164 | #175 | S6 후원이 몰릴 때 알림을 한 장씩 순서대로 |
| #158 | | S0 스파이크: 가려진 송출 탭의 감지 지연과 알림음 |
| #162 | | S3 송출 화면 알림음 |
| #167 | | S11 README·PRD의 후원 알림 확인 절차 |

## 코드

- web: `apps/web/src/donation/useNewDonations.ts`(5초 폴링, 첫 응답은 기준선), `donationAlerts.ts`(알림 큐와 "외 N건" 묶음)
- web: `apps/web/src/components/DonationToasts.tsx`, `DonationBanners.tsx`, `DonationAlertCard.tsx`
- web: `apps/web/src/components/PublishSidePanel.tsx`(송출 화면 후원·채팅)
- api: `apps/api/src/donations/donations.service.ts`(순위 `ranking`), `apps/api/src/chat/donation-line.ts`(채팅 후원 줄)

## 확인

- 수동 확인 절차는 #167에서 루트 `README.md` "기능 확인"에 더한다

## 관련 기능

후원 결제와 내역은 [donation](../donation/), 라임 후원은 [lime](../lime/), 채팅은 [chat-and-ready](../chat-and-ready/)에 있다.
