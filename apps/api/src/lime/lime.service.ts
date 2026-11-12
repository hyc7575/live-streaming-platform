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
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module.js';
import { approveTossPayment } from '../donations/toss-approval.js';
import {
  TOSS_CONFIG,
  TOSS_PAYMENTS,
  TOSS_REQUEST_TIMEOUT_MS,
  type TossConfig,
  type TossConfirmInput,
  type TossPayments,
} from '../donations/toss-payments.js';
import { Prisma } from '../generated/prisma/client.js';

export const LIME_CHARGE_MIN_AMOUNT = 1_000;
export const LIME_CHARGE_MAX_AMOUNT = 100_000;

export const NOT_CONFIGURED_MESSAGE = '라임 충전이 설정되지 않았습니다.';
export const CHARGE_NOT_FOUND_MESSAGE = '충전 주문을 찾을 수 없습니다.';
export const NOT_YOUR_CHARGE_MESSAGE = '내 충전 주문만 승인할 수 있습니다.';
export const AMOUNT_MISMATCH_MESSAGE = '결제 금액이 주문과 다릅니다.';
export const PAYMENT_KEY_USED_MESSAGE = '이미 다른 주문에 쓰인 결제입니다.';

// Must outlast the Toss request it waits on while holding the order row.
const CONFIRM_TRANSACTION_TIMEOUT_MS = 2 * TOSS_REQUEST_TIMEOUT_MS;

export interface LimeChargeOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

// balanceAfter is the balance right after this charge, read from its ledger
// row, so a repeated confirm answers exactly what the first one did.
export interface ConfirmedCharge {
  orderId: string;
  amount: number;
  approvedAt: Date;
  balanceAfter: number;
}

export interface LimeBalance {
  balance: number;
}

@Injectable()
export class LimeService {
  private readonly logger = new Logger(LimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TOSS_CONFIG) private readonly config: TossConfig | null,
    @Inject(TOSS_PAYMENTS) private readonly toss: TossPayments | null,
  ) {}

  async balance(userId: string): Promise<LimeBalance> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { limeBalance: true },
    });
    if (!user) throw new UnauthorizedException();
    return { balance: user.limeBalance };
  }

  async createCharge(userId: string, amount: number): Promise<LimeChargeOrder> {
    const { config } = this.enabled();
    const orderId = `lime_${randomUUID().replaceAll('-', '')}`;
    await this.prisma.limeCharge.create({ data: { orderId, userId, amount } });
    return {
      orderId,
      orderName: `${amount.toLocaleString('ko-KR')}라임 충전`,
      amount,
      clientKey: config.clientKey,
      customerKey: userId,
    };
  }

  // The success page calls this on every load, so a refresh, a retry after a
  // lost response, and several tabs racing must all credit the order once.
  // The row lock serializes confirms of one order: whoever comes second finds
  // it APPROVED and gets the first answer back without asking Toss again.
  // The ledger's (kind, refId) UNIQUE backs this up in the database. The
  // balance grows by an UPDATE that adds in SQL, so confirms of different
  // orders never overwrite each other's credit.
  async confirm(
    userId: string,
    input: TossConfirmInput,
  ): Promise<ConfirmedCharge> {
    const { toss } = this.enabled();
    const order = await this.prisma.limeCharge.findUnique({
      where: { orderId: input.orderId },
      select: { userId: true, amount: true },
    });
    if (!order) throw new NotFoundException(CHARGE_NOT_FOUND_MESSAGE);
    if (order.userId !== userId) {
      throw new ForbiddenException(NOT_YOUR_CHARGE_MESSAGE);
    }
    if (order.amount !== input.amount) {
      throw new BadRequestException(AMOUNT_MISMATCH_MESSAGE);
    }
    let refused = false;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [locked] = await tx.$queryRaw<
            { id: string; status: string; paymentKey: string | null }[]
          >(Prisma.sql`
            SELECT id, status::text, "paymentKey" FROM "LimeCharge"
            WHERE "orderId" = ${input.orderId}
            FOR UPDATE`);
          if (!locked) throw new NotFoundException(CHARGE_NOT_FOUND_MESSAGE);
          if (locked.status === 'APPROVED') {
            if (locked.paymentKey !== input.paymentKey) {
              throw new ConflictException(PAYMENT_KEY_USED_MESSAGE);
            }
            return this.confirmed(tx, locked.id);
          }
          const approvedAt = await approveTossPayment(
            toss,
            input,
            this.logger,
          ).catch((error: unknown) => {
            refused = error instanceof BadRequestException;
            throw error;
          });
          await tx.limeCharge.update({
            where: { id: locked.id },
            data: {
              status: 'APPROVED',
              paymentKey: input.paymentKey,
              approvedAt,
            },
          });
          const [credited] = await tx.$queryRaw<{ limeBalance: number }[]>(
            Prisma.sql`
              UPDATE "User" SET "limeBalance" = "limeBalance" + ${order.amount}
              WHERE id = ${userId}::uuid
              RETURNING "limeBalance"`,
          );
          if (!credited) throw new UnauthorizedException();
          await tx.limeLedger.create({
            data: {
              userId,
              delta: order.amount,
              kind: 'CHARGE',
              refId: locked.id,
              balanceAfter: credited.limeBalance,
            },
          });
          return {
            orderId: input.orderId,
            amount: order.amount,
            approvedAt,
            balanceAfter: credited.limeBalance,
          };
        },
        { timeout: CONFIRM_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      // Toss said no, so the order is FAILED rather than unknown. A 5xx or a
      // lost connection leaves it PENDING. Either way a retry may confirm it.
      if (refused) {
        await this.prisma.limeCharge.updateMany({
          where: { orderId: input.orderId, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException(PAYMENT_KEY_USED_MESSAGE);
      }
      throw error;
    }
  }

  private async confirmed(
    tx: Prisma.TransactionClient,
    chargeId: string,
  ): Promise<ConfirmedCharge> {
    const charge = await tx.limeCharge.findUniqueOrThrow({
      where: { id: chargeId },
      select: { orderId: true, amount: true, approvedAt: true },
    });
    if (!charge.approvedAt) {
      throw new Error(`Approved charge ${chargeId} has no approvedAt`);
    }
    const ledger = await tx.limeLedger.findUniqueOrThrow({
      where: { kind_refId: { kind: 'CHARGE', refId: chargeId } },
      select: { balanceAfter: true },
    });
    return {
      orderId: charge.orderId,
      amount: charge.amount,
      approvedAt: charge.approvedAt,
      balanceAfter: ledger.balanceAfter,
    };
  }

  private enabled(): { config: TossConfig; toss: TossPayments } {
    if (!this.config || !this.toss) {
      throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);
    }
    return { config: this.config, toss: this.toss };
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
