import { formatLime, type DonationTarget } from './lime';

// apps/api/src/donations의 후원 view와 같은 모양이다. PAID 후원만
// 보여 주므로 approvedAt은 늘 값이 있다.
// TOSS는 Toss를 거친 카드 결제, LIME은 후원자의 라임 잔액에서 낸 것이다.
export type DonationMethod = 'TOSS' | 'LIME';

export interface Donation {
  id: string;
  method: DonationMethod;
  amount: number;
  message: string;
  approvedAt: string;
  donor: { id: string; nickname: string };
}

// GET /broadcasts/:id/donations. `total`과 `count`는 PAID 후원 전부를
// 센다. `donations`는 그중 최신 DONATION_LIST_LIMIT개뿐이다.
export interface DonationSummary {
  total: number;
  count: number;
  donations: Donation[];
}

// GET /me/received-donations: 스트리머가 어느 방송에서 무엇을 받았는지다.
export type ReceivedDonation = Donation & Pick<DonationTarget, 'broadcast'>;

export interface ReceivedDonationSummary {
  total: number;
  count: number;
  donations: ReceivedDonation[];
}

// GET /me/donations: 호출자가 보낸 후원이다. 누구에게서가 아니라 누구에게 보냈는지 담는다.
export type SentDonation = Omit<Donation, 'donor'> & DonationTarget;

export interface SentDonationSummary {
  total: number;
  count: number;
  donations: SentDonation[];
}

// 1 라임 = 1원이라, 목록에서는 단위만으로 결제 수단을 구분한다.
export function formatDonationAmount(
  d: Pick<Donation, 'method' | 'amount'>,
): string {
  return d.method === 'LIME' ? formatLime(d.amount) : formatWon(d.amount);
}

// POST /broadcasts/:id/donations: 결제 위젯에 필요한 값이다.
export interface DonationOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

// 방송이 지워지면 broadcastId는 null이 된다. 후원은
// 기록에 남는다(#114).
export interface ConfirmedDonation extends Donation {
  broadcastId: string | null;
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

// Toss의 failUrl은 orderId만 돌려준다. 그래서 실패 페이지는 여기서
// 방송을 찾아 재시도를 권한다. 이 값을 잃어도 그 링크만 잃는다.
const ORDER_KEY_PREFIX = 'donation-order:';

export function rememberOrderBroadcast(
  orderId: string,
  broadcastId: string,
): void {
  try {
    sessionStorage.setItem(ORDER_KEY_PREFIX + orderId, broadcastId);
  } catch {
    // 저장소가 막혔다. 실패 페이지는 홈 링크로 대신한다.
  }
}

export function broadcastOfOrder(orderId: string): string | null {
  try {
    return sessionStorage.getItem(ORDER_KEY_PREFIX + orderId);
  } catch {
    return null;
  }
}
