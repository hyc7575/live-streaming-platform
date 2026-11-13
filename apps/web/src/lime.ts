// apps/api/src/lime과 같은 모양이다. 1 라임 = 1원이고, "1,000라임"처럼 보인다.

// POST /lime/charges: 결제 위젯에 필요한 값이다.
export interface LimeChargeOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

// POST /lime/charges/confirm. balanceAfter는 이 충전 직후의 잔액이라서
// 새로고침해도 같은 숫자가 보인다.
export interface ConfirmedCharge {
  orderId: string;
  amount: number;
  approvedAt: string;
  balanceAfter: number;
}

export const LIME_CHARGE_MIN_AMOUNT = 1_000;
export const LIME_CHARGE_MAX_AMOUNT = 100_000;
export const LIME_CHARGE_PRESETS = [1_000, 5_000, 10_000] as const;

export function isChargeAmount(amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= LIME_CHARGE_MIN_AMOUNT &&
    amount <= LIME_CHARGE_MAX_AMOUNT
  );
}

export function formatLime(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}라임`;
}

// GET /me/lime.
export interface LimeBalance {
  balance: number;
}

// apps/api/src/donations/sent-donation.ts의 DonationTarget과 같은 모양이다.
// 후원자가 보는 후원의 행선지다. 방송이 지워지면 둘 다
// null이다(#114).
export interface DonationTarget {
  broadcast: { id: string; title: string } | null;
  recipient: { id: string; nickname: string } | null;
}

// GET /me/lime/ledger, 최신순이다. DONATION 행에는 `donation`이 있다.
export interface LimeLedgerEntry {
  id: string;
  kind: 'CHARGE' | 'DONATION';
  delta: number;
  balanceAfter: number;
  createdAt: string;
  donation: DonationTarget | null;
}
