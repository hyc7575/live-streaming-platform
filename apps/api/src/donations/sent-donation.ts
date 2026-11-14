import type { Prisma } from '../generated/prisma/client.js';

// 후원자가 보는 후원의 행선지. 방송이 삭제되면 broadcast는 null이 된다
// (#114). 받는 사람은 남는다. 단, Donation이 받는 사람을 기록하기 전에
// 방송이 삭제된 후원은 예외다.
export const donationTargetSelect = {
  broadcast: { select: { id: true, title: true } },
  recipient: { select: { id: true, nickname: true } },
} as const satisfies Prisma.DonationSelect;

export type DonationTarget = Prisma.DonationGetPayload<{
  select: typeof donationTargetSelect;
}>;
