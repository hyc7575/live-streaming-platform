import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module.js';
import {
  confirmedSelect,
  hasPrismaCode,
  type ConfirmedDonation,
} from '../donations/donations.service.js';
import { Prisma } from '../generated/prisma/client.js';

export const INSUFFICIENT_LIME_MESSAGE = '라임이 부족합니다.';
export const ORDER_ID_TAKEN_MESSAGE = '이미 다른 후원에 쓰인 요청입니다.';

export interface LimeDonationInput {
  amount: number;
  message: string;
  // The client's idempotency key: one per donation attempt, the same on
  // every resend of that attempt. Stored as Donation.orderId, which shares
  // its UNIQUE with card orders.
  orderId: string;
}

export interface LimeDonationResult {
  donation: ConfirmedDonation;
  // false when the key had already made this donation and nothing changed.
  created: boolean;
}

// Thrown inside the transaction so it rolls back; told apart from a real
// failure afterwards.
class InsufficientLime extends Error {}

@Injectable()
export class LimeDonationsService {
  constructor(private readonly prisma: PrismaService) {}

  // The caller has already looked the key up (`earlier`) and checked the
  // target (DonationTargetGuard.check).
  //
  // One transaction debits, records the donation and writes the ledger. The
  // debit is a conditional UPDATE, so concurrent donations queue on the
  // user's row and each sees the balance the previous one left: they can
  // never spend the same lime twice. A resent key hits Donation.orderId's
  // UNIQUE, Postgres aborts the transaction, and everything rolls back,
  // the debit included. Only then, outside it, is the earlier donation
  // looked up, because an aborted transaction cannot run more queries.
  async donate(
    broadcastId: string,
    donorId: string,
    input: LimeDonationInput,
  ): Promise<LimeDonationResult> {
    try {
      const donation = await this.prisma.$transaction(async (tx) => {
        const [debited] = await tx.$queryRaw<{ limeBalance: number }[]>(
          Prisma.sql`
            UPDATE "User" SET "limeBalance" = "limeBalance" - ${input.amount}
            WHERE id = ${donorId}::uuid AND "limeBalance" >= ${input.amount}
            RETURNING "limeBalance"`,
        );
        if (!debited) throw new InsufficientLime();
        const created = await tx.donation.create({
          data: {
            orderId: input.orderId,
            broadcastId,
            donorId,
            amount: input.amount,
            message: input.message,
            method: 'LIME',
            status: 'PAID',
            approvedAt: new Date(),
          },
          select: confirmedSelect,
        });
        await tx.limeLedger.create({
          data: {
            userId: donorId,
            delta: -input.amount,
            kind: 'DONATION',
            refId: created.id,
            balanceAfter: debited.limeBalance,
          },
        });
        return created;
      });
      return { donation, created: true };
    } catch (error) {
      if (error instanceof InsufficientLime || hasPrismaCode(error, 'P2002')) {
        // A resend after the balance ran out finds no lime to debit, so a
        // shortfall may also be a key that already donated.
        const replayed = await this.earlier(broadcastId, donorId, input);
        if (replayed) return { donation: replayed, created: false };
        if (error instanceof InsufficientLime) {
          throw new ConflictException(INSUFFICIENT_LIME_MESSAGE);
        }
        throw error;
      }
      // The broadcast was deleted between the check and the insert.
      if (hasPrismaCode(error, 'P2003')) {
        throw new NotFoundException('Broadcast not found');
      }
      throw error;
    }
  }

  // The donation an earlier request with this key made, when it is the same
  // donor giving the same amount in lime to the same broadcast. Any other
  // owner of the key (another user, a card order) is a 409. Null when no
  // donation has the key.
  //
  // The controller asks this before checking the broadcast, so a resend whose
  // first answer was lost gets that donation back even after the broadcast
  // has ended. Only a key that made nothing yet goes through the target
  // check (PRD-lime 7.3 order).
  async earlier(
    broadcastId: string,
    donorId: string,
    input: LimeDonationInput,
  ): Promise<ConfirmedDonation | null> {
    const donation = await this.prisma.donation.findUnique({
      where: { orderId: input.orderId },
      select: confirmedSelect,
    });
    if (!donation) return null;
    const same =
      donation.method === 'LIME' &&
      donation.donor.id === donorId &&
      donation.broadcastId === broadcastId &&
      donation.amount === input.amount;
    if (!same) throw new ConflictException(ORDER_ID_TAKEN_MESSAGE);
    return donation;
  }
}
