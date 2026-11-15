# 라임

현금 1:1 단위 라임을 테스트 결제로 충전하고, 시청 화면을 떠나지 않고 잔액에서 후원한다.

- 우선순위: P2
- 상태: 구현 완료

## 문서

- [PRD.md](./PRD.md)

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

## 코드

- api: `apps/api/src/lime/`
- web: `apps/web/src/pages/LimeChargePage.tsx`, `LimeChargeSuccessPage.tsx`, `LimeChargeFailPage.tsx`
- web: `apps/web/src/components/LimeDonationForm.tsx`
- web: `apps/web/src/lime.ts`

## 확인

- 인수 시나리오: `PRD.md` §8.3 15, 16
- 수동 확인 절차: 루트 `README.md` "기능 확인"의 10절
