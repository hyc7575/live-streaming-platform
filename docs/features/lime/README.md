# 라임

현금 1:1 단위 라임을 테스트 결제로 충전하고, 시청 화면을 떠나지 않고 잔액에서 후원한다.

- 우선순위: P2
- 상태: 구현 완료. 후원 모달(#180), PC 모달 안 결제(#181)까지 구현했다. PC Safari의 모달 안 충전·카드 후원은 11-16에 확인했다. 신용·체크카드 결제 수단은 아직 확인하지 않았다([PRD-donation-modal](./PRD-donation-modal.md) 8.1 "결과")

## 문서

- [PRD.md](./PRD.md)
- 후원 모달과 PC 결제 화면 유지(#178): [DISCOVERY](./DISCOVERY-donation-modal.md) → [RED-TEAM](./RED-TEAM-donation-modal.md) → [PRD](./PRD-donation-modal.md) → [PRE-MORTEM](./PRE-MORTEM-donation-modal.md)
- 결제 확정이 공유 DB 연결을 붙잡지 않게(#215, 카드 후원 확정 포함): [STORIES](./STORIES-confirm-pool.md) → [PRE-MORTEM](./PRE-MORTEM-confirm-pool.md) → [SCENARIOS](./SCENARIOS-confirm-pool.md)

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
| #179 | (없음) | [스파이크] 모달 안 iframe에서 Toss 테스트 결제가 끝나는지 확인한다. `windowTarget: 'self'`일 때 통과 |
| #181 | #188 | PC에서 충전·카드 결제를 후원 모달 안 iframe에서 끝낸다 |
| #215 | (이 PR) | 결제 확정을 사용자별로 한 줄, 전체 3개까지만 들이고 사용자별 1분 20회로 제한한다. pool에 연결 대기 5초 제한 |

## 코드

- api: `apps/api/src/lime/`
- api: `apps/api/src/donations/confirm-gate.ts`(확정 gate `ConfirmGate`, 사용자 기준 요청 제한 `UserThrottlerGuard`, #215), `apps/api/src/database/database.module.ts`(pool `max`, `connectionTimeoutMillis`)
- web: `apps/web/src/pages/LimeChargePage.tsx`, `LimeChargeSuccessPage.tsx`, `LimeChargeFailPage.tsx`
- web: `apps/web/src/components/LimeDonationForm.tsx`(`offerCard`, `onPay`), `DonationPanel.tsx`(후원 모달, `donateIn`, 결제 보기)
- web: `apps/web/src/donation/paymentFrame.ts`(iframe 판별, 결제 화면 경로, 결제 탭 열기), `tossWidget.ts`(iframe 안 `windowTarget: 'self'`)
- web: `apps/web/src/donation/paymentNotice.ts`(결제 완료 알림: 새 탭이면 BroadcastChannel, 모달 iframe이면 `postMessage` 하나로만 보내고 받기, 탭 닫기), `useConfirmPayment.ts`(성공 화면의 확정 한 번과 알림, #199)
- web: `apps/web/src/lime.ts`

## 확인

- 인수 시나리오: `PRD.md` §8.3 15, 16, 30, 31, 32
- 확정 gate(#215): `apps/api/test/confirm-gate.spec.ts`, `apps/api/test/payment-confirm-pool.e2e.spec.ts`, [SCENARIOS-confirm-pool](./SCENARIOS-confirm-pool.md)
- e2e: `apps/web/e2e/donationModal.spec.ts`(넓은 화면 모달, 1366×768 모달 안 카드 결제 화면, 결제 밖 화면의 iframe 헤더, 좁은 화면 시트)
- 스크린샷: `docs/screenshots/181/`(1366×768 폼 → 결제 보기 → iframe 안 Toss 결제 페이지 → 충전 뒤 폼, 카드 결제 취소와 복귀)
- 수동 확인 절차: [`docs/VERIFICATION.md`](../../VERIFICATION.md)의 10절
