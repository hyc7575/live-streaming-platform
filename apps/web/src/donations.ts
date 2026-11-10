// Mirrors the donation views from apps/api/src/donations. Only PAID
// donations are ever shown, so approvedAt is always set.
export interface Donation {
  id: string;
  amount: number;
  message: string;
  approvedAt: string;
  donor: { id: string; nickname: string };
}

// GET /broadcasts/:id/donations. `total` and `count` cover every PAID
// donation; `donations` is only the newest DONATION_LIST_LIMIT of them.
export interface DonationSummary {
  total: number;
  count: number;
  donations: Donation[];
}

// POST /broadcasts/:id/donations: what the payment widget needs.
export interface DonationOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

export interface ConfirmedDonation extends Donation {
  broadcastId: string;
}

export const DONATION_MIN_AMOUNT = 1_000;
export const DONATION_MAX_AMOUNT = 100_000;
export const DONATION_MESSAGE_MAX_LENGTH = 100;
export const DONATION_AMOUNT_PRESETS = [1_000, 5_000, 10_000] as const;

export function isDonationAmount(amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= DONATION_MIN_AMOUNT &&
    amount <= DONATION_MAX_AMOUNT
  );
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

// Toss's failUrl only carries the orderId back, so the fail page looks the
// broadcast up here to offer a retry. Losing it only loses that link.
const ORDER_KEY_PREFIX = 'donation-order:';

export function rememberOrderBroadcast(
  orderId: string,
  broadcastId: string,
): void {
  try {
    sessionStorage.setItem(ORDER_KEY_PREFIX + orderId, broadcastId);
  } catch {
    // Storage blocked: the fail page falls back to the home link.
  }
}

export function broadcastOfOrder(orderId: string): string | null {
  try {
    return sessionStorage.getItem(ORDER_KEY_PREFIX + orderId);
  } catch {
    return null;
  }
}
