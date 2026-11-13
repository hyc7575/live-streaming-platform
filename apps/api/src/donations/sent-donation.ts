import type { Prisma } from '../generated/prisma/client.js';

// Where a donation went, as the donor's own history shows it. The broadcast
// is null once it has been deleted (#114). The recipient is read through the
// broadcast, so it is lost with the broadcast too, until Donation carries
// the recipient itself (PRD-mypage 7.1).
export const donationTargetSelect = {
  broadcast: {
    select: {
      id: true,
      title: true,
      streamer: { select: { id: true, nickname: true } },
    },
  },
} as const satisfies Prisma.DonationSelect;

type TargetRow = Prisma.DonationGetPayload<{
  select: typeof donationTargetSelect;
}>;

export interface DonationTarget {
  broadcast: { id: string; title: string } | null;
  recipient: { id: string; nickname: string } | null;
}

export function toDonationTarget({ broadcast }: TargetRow): DonationTarget {
  if (!broadcast) return { broadcast: null, recipient: null };
  const { streamer, ...rest } = broadcast;
  return { broadcast: rest, recipient: streamer };
}
