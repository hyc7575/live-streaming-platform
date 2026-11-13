// Mirrors apps/api/src/lime. 1 lime = 1 won, shown as "1,000라임".

// POST /lime/charges: what the payment widget needs.
export interface LimeChargeOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

// POST /lime/charges/confirm. balanceAfter is the balance right after this
// charge, so a refresh shows the same numbers.
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

// Mirrors DonationTarget from apps/api/src/donations/sent-donation.ts: where
// a donation went, as its donor sees it. Both are null once the broadcast
// has been deleted (#114).
export interface DonationTarget {
  broadcast: { id: string; title: string } | null;
  recipient: { id: string; nickname: string } | null;
}

// GET /me/lime/ledger, newest first. `donation` is set on DONATION rows.
export interface LimeLedgerEntry {
  id: string;
  kind: 'CHARGE' | 'DONATION';
  delta: number;
  balanceAfter: number;
  createdAt: string;
  donation: DonationTarget | null;
}
