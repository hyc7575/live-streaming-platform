# 라임

현금 1:1 단위 라임을 테스트 결제로 충전하고, 시청 화면을 떠나지 않고 잔액에서 후원한다.

- 우선순위: P2
- 상태: 구현 완료. 후원 모달(#180), PC 모달 안 결제(#181)까지 구현했다

## 문서

- [PRD.md](./PRD.md)
- 후원 모달과 PC 결제 화면 유지(#178): [DISCOVERY](./DISCOVERY-donation-modal.md) → [RED-TEAM](./RED-TEAM-donation-modal.md) → [PRD](./PRD-donation-modal.md) → [PRE-MORTEM](./PRE-MORTEM-donation-modal.md)

## 요구사항 위치

- [`PRD.md`](../../PRD.md) §7.1 "라임" 행
- §7.3 라임 데이터 모델
- §7.5 라임 충전·잔액 조회 행
- §8.4 라임 정합성

## 이슈와 PR

| 이슈 | PR | 내용 |
|---|---|---|
| #108 | #111 | 후원 결제를 새 탭에서 열기 |
| #109 | #112 | 라임 충전과 한 번만 적립 |
| #110 | #113 | 라임으로 시청 화면에서 후원 |
| #178 | #182 | 후원 모달과 PC 모달 안 결제의 기획 문서 (상위 이슈) |
| #180 | #183 | 넓은 화면에서 "후원하기"가 후원 폼 모달을 띄운다 |
| #179 | | [스파이크] 모달 안 iframe에서 Toss 테스트 결제가 끝나는지 확인한다. `windowTarget: 'self'`일 때 통과 |
| #181 | | PC에서 충전·카드 결제를 후원 모달 안 iframe에서 끝낸다 |

## 코드

- api: `apps/api/src/lime/`
- web: `apps/web/src/pages/LimeChargePage.tsx`, `LimeChargeSuccessPage.tsx`, `LimeChargeFailPage.tsx`
- web: `apps/web/src/components/LimeDonationForm.tsx`(`offerCard`, `onPay`), `DonationPanel.tsx`(후원 모달, `donateIn`, 결제 보기)
- web: `apps/web/src/donation/paymentFrame.ts`(iframe 판별, 결제 화면 경로, `postMessage` 프로토콜), `tossWidget.ts`(iframe 안 `windowTarget: 'self'`)
- web: `apps/web/src/lime.ts`

## 확인

- 인수 시나리오: `PRD.md` §8.3 15, 16, 30, 31, 32
- e2e: `apps/web/e2e/donationModal.spec.ts`(넓은 화면 모달, 1366×768 모달 안 카드 결제 화면, 결제 밖 화면의 iframe 헤더, 좁은 화면 시트)
- 스크린샷: `docs/screenshots/181/`(1366×768 폼 → 결제 보기 → iframe 안 Toss 결제 페이지 → 충전 뒤 폼, 카드 결제 취소와 복귀)
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 10절
