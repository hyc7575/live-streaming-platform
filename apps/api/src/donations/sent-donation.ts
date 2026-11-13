import type { Prisma } from '../generated/prisma/client.js';

// Where a donation went, as its donor sees it. The broadcast is null once it
// has been deleted (#114); the recipient stays, except on donations whose
// broadcast was deleted before Donation kept its recipient.
export const donationTargetSelect = {
  broadcast: { select: { id: true, title: true } },
  recipient: { select: { id: true, nickname: true } },
} as const satisfies Prisma.DonationSelect;

export type DonationTarget = Prisma.DonationGetPayload<{
  select: typeof donationTargetSelect;
}>;
