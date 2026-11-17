# 도네이션

토스페이먼츠 테스트 결제로 LIVE 방송에 후원한다. 서버가 승인을 검증하고 한 번만 적립한다.

- 우선순위: P2
- 상태: 구현 완료

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "도네이션" 행
- §7.3 `Donation.recipientId`
- §7.5 후원 행
- §8.4 도네이션 멱등성, §7.10 Q4
- [ADR 0003](../../adr/0003-donation-outlives-broadcast.md) 방송을 지워도 후원 기록은 남긴다

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #20 | #53 | 도네이션 테스트 결제와 멱등 적립 |
| #108 | #111 | 후원 결제를 새 탭에서 열어 시청 영상을 멈추지 않는다 |
| #114 | #115 | 방송을 지워도 후원 기록은 남기고 방송 연결만 끊는다 |
| #118 | #122 | 후원에 받은 스트리머를 저장한다 |
| #180 | #183 | 넓은 화면에서 "후원하기"가 카드 결제 탭 대신 후원 폼 모달을 띄운다. 카드 후원은 모달의 "카드로 후원"으로 들어간다 |
| #215 | (이 PR) | 카드 후원 확정도 라임 충전과 같은 확정 gate·요청 제한을 쓴다. 문서는 [lime/STORIES-confirm-pool](../lime/STORIES-confirm-pool.md) |

## 코드

- api: `apps/api/src/donations/`
- web: `apps/web/src/donation/`
- web: `apps/web/src/pages/DonatePage.tsx`, `DonationSuccessPage.tsx`, `DonationFailPage.tsx`
- web: `apps/web/src/components/DonationPanel.tsx`

## 확인

- 인수 시나리오: `PRD.md` §8.3 15, 18, 19
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 8절, 10절

## 관련 기능

새 탭 후원, 라임 후원, 후원 모달은 [lime](../lime/), 받은 후원 합계는 [mypage](../mypage/)에 있다.
