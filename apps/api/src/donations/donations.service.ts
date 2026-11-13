import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  donationTargetSelect,
  toDonationTarget,
  type DonationTarget,
} from './sent-donation.js';
import { approveTossPayment } from './toss-approval.js';
import {
  TOSS_CONFIG,
  TOSS_PAYMENTS,
  TOSS_REQUEST_TIMEOUT_MS,
  type TossConfig,
  type TossConfirmInput,
  type TossPayments,
} from './toss-payments.js';

export const DONATION_MIN_AMOUNT = 1_000;
export const DONATION_MAX_AMOUNT = 100_000;
export const DONATION_MESSAGE_MAX_LENGTH = 100;

// No pagination, like comments: the watch page polls the latest donations,
// and the total comes from an aggregate rather than from this list.
export const DONATION_LIST_LIMIT = 50;

export const NOT_CONFIGURED_MESSAGE = '후원 기능이 설정되지 않았습니다.';
export const ORDER_NOT_FOUND_MESSAGE = '후원 주문을 찾을 수 없습니다.';
export const NOT_YOUR_ORDER_MESSAGE = '내 후원 주문만 승인할 수 있습니다.';
export const AMOUNT_MISMATCH_MESSAGE = '결제 금액이 주문과 다릅니다.';
export const PAYMENT_KEY_USED_MESSAGE = '이미 다른 주문에 쓰인 결제입니다.';
export const BROADCAST_DELETED_MESSAGE = '방송이 삭제되어 후원할 수 없습니다.';
// Sent with that 409 so the web can tell it from other conflicts without
// matching the message.
export const BROADCAST_DELETED_CODE = 'BROADCAST_DELETED';

// Toss caps orderName at 100 characters.
const ORDER_NAME_MAX_LENGTH = 100;
const ORDER_NAME_SUFFIX = ' 후원';

// Must outlast the Toss request it waits on while holding the order row.
const CONFIRM_TRANSACTION_TIMEOUT_MS = 2 * TOSS_REQUEST_TIMEOUT_MS;

// What the API reveals about a donation. The donor appears by nickname only.
// `method` tells a card donation (TOSS) from one paid in lime (LIME).
const donationSelect = {
  id: true,
  method: true,
  amount: true,
  message: true,
  approvedAt: true,
  donor: { select: { id: true, nickname: true } },
} as const satisfies Prisma.DonationSelect;

export const confirmedSelect = {
  ...donationSelect,
  broadcastId: true,
} as const satisfies Prisma.DonationSelect;

export type DonationView = Prisma.DonationGetPayload<{
  select: typeof donationSelect;
}>;

export type ConfirmedDonation = Prisma.DonationGetPayload<{
  select: typeof confirmedSelect;
}>;

export interface DonationList {
  total: number;
  count: number;
  donations: DonationView[];
}

// A donation the caller sent, for their own history: whom it went to rather
// than who sent it.
export type SentDonation = Omit<DonationView, 'donor'> & DonationTarget;

// GET /me/donations. Like DonationList, the sums cover every PAID donation
// and the list only the newest DONATION_LIST_LIMIT.
export interface SentDonationList {
  total: number;
  count: number;
  donations: SentDonation[];
}

const sentSelect = {
  id: true,
  method: true,
  amount: true,
  message: true,
  approvedAt: true,
  ...donationTargetSelect,
} as const satisfies Prisma.DonationSelect;

export interface DonationOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

export interface CreateDonationInput {
  amount: number;
  message: string;
}

@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcasts: BroadcastsService,
    @Inject(TOSS_CONFIG) private readonly config: TossConfig | null,
    @Inject(TOSS_PAYMENTS) private readonly toss: TossPayments | null,
  ) {}

  // Both methods land here: a lime donation is stored PAID from the start.
  async list(broadcastId: string): Promise<DonationList> {
    await this.broadcasts.get(broadcastId);
    const where = { broadcastId, status: 'PAID' } as const;
    const [aggregate, donations] = await Promise.all([
      this.prisma.donation.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.donation.findMany({
        where,
        orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
        take: DONATION_LIST_LIMIT,
        select: donationSelect,
      }),
    ]);
    return {
      total: aggregate._sum.amount ?? 0,
      count: aggregate._count,
      donations,
    };
  }

  // PENDING orders are left out: they were never paid, and a lime donation
  // is PAID from the start.
  async sentBy(donorId: string): Promise<SentDonationList> {
    const where = { donorId, status: 'PAID' } as const;
    const [aggregate, rows] = await Promise.all([
      this.prisma.donation.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.donation.findMany({
        where,
        orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
        take: DONATION_LIST_LIMIT,
        select: sentSelect,
      }),
    ]);
    return {
      total: aggregate._sum.amount ?? 0,
      count: aggregate._count,
      donations: rows.map(({ broadcast, ...donation }) => ({
        ...donation,
        ...toDonationTarget({ broadcast }),
      })),
    };
  }

  // DonationTargetGuard has already checked the broadcast is someone else's
  // and LIVE.
  async createOrder(
    broadcastId: string,
    donorId: string,
    input: CreateDonationInput,
  ): Promise<DonationOrder> {
    const { config } = this.enabled();
    const broadcast = await this.broadcasts.get(broadcastId);
    const orderId = `don_${randomUUID().replaceAll('-', '')}`;
    try {
      await this.prisma.donation.create({
        data: { orderId, broadcastId, donorId, ...input },
      });
    } catch (error) {
      // The broadcast was deleted between the check and the insert.
      if (hasPrismaCode(error, 'P2003')) {
        throw new NotFoundException('Broadcast not found');
      }
      throw error;
    }
    const title = broadcast.title.slice(
      0,
      ORDER_NAME_MAX_LENGTH - ORDER_NAME_SUFFIX.length,
    );
    return {
      orderId,
      orderName: `${title}${ORDER_NAME_SUFFIX}`,
      amount: input.amount,
      clientKey: config.clientKey,
      customerKey: donorId,
    };
  }

  // The success page calls this on every load, so a refresh, a retry after a
  // lost response, and two tabs racing must all credit the order once. The
  // row lock serializes confirms of one order. Whoever comes second finds it
  // PAID and returns it without asking Toss again. A Toss failure leaves the
  // order PENDING, and a retry reuses the Idempotency-Key Toss already saw.
  async confirm(
    donorId: string,
    input: TossConfirmInput,
  ): Promise<ConfirmedDonation> {
    const { toss } = this.enabled();
    const order = await this.prisma.donation.findUnique({
      where: { orderId: input.orderId },
      select: { donorId: true, amount: true },
    });
    if (!order) throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
    if (order.donorId !== donorId)
      throw new ForbiddenException(NOT_YOUR_ORDER_MESSAGE);
    if (order.amount !== input.amount) {
      throw new BadRequestException(AMOUNT_MISMATCH_MESSAGE);
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [locked] = await tx.$queryRaw<
            {
              id: string;
              status: string;
              paymentKey: string | null;
              broadcastId: string | null;
            }[]
          >(Prisma.sql`
            SELECT id, status::text, "paymentKey", "broadcastId" FROM "Donation"
            WHERE "orderId" = ${input.orderId}
            FOR UPDATE`);
          if (!locked) throw new NotFoundException(ORDER_NOT_FOUND_MESSAGE);
          if (locked.status === 'PAID') {
            if (locked.paymentKey !== input.paymentKey) {
              throw new ConflictException(PAYMENT_KEY_USED_MESSAGE);
            }
          } else if (locked.broadcastId === null) {
            // The order outlived its deleted broadcast (#114) and is refused
            // without asking Toss. A delete racing a confirm waits on this
            // row lock: if the confirm commits, the delete then unlinks a
            // PAID donation that stays on record.
            //
            // Known gap: a confirm that ended in 502 rolled back and left the
            // order PENDING although Toss may have taken the money. If the
            // broadcast is deleted before the retry, the retry lands here
            // and never asks Toss again, so that payment is not recorded.
            // The cascade before #114 lost it the same way (404).
            throw new ConflictException({
              message: BROADCAST_DELETED_MESSAGE,
              code: BROADCAST_DELETED_CODE,
            });
          } else {
            const approvedAt = await approveTossPayment(
              toss,
              input,
              this.logger,
            );
            await tx.donation.update({
              where: { id: locked.id },
              data: {
                status: 'PAID',
                paymentKey: input.paymentKey,
                approvedAt,
              },
            });
          }
          return tx.donation.findUniqueOrThrow({
            where: { id: locked.id },
            select: confirmedSelect,
          });
        },
        { timeout: CONFIRM_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException(PAYMENT_KEY_USED_MESSAGE);
      }
      throw error;
    }
  }

  private enabled(): { config: TossConfig; toss: TossPayments } {
    if (!this.config || !this.toss) {
      throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);
    }
    return { config: this.config, toss: this.toss };
  }
}

export function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
