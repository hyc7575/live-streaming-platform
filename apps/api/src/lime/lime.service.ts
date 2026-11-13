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
import {
  donationTargetSelect,
  type DonationTarget,
} from '../donations/sent-donation.js';
import { Prisma, type LimeLedgerKind } from '../generated/prisma/client.js';

export const LIME_CHARGE_MIN_AMOUNT = 1_000;
export const LIME_CHARGE_MAX_AMOUNT = 100_000;

export const NOT_CONFIGURED_MESSAGE = '라임 충전이 설정되지 않았습니다.';
export const CHARGE_NOT_FOUND_MESSAGE = '충전 주문을 찾을 수 없습니다.';
export const NOT_YOUR_CHARGE_MESSAGE = '내 충전 주문만 승인할 수 있습니다.';
export const AMOUNT_MISMATCH_MESSAGE = '결제 금액이 주문과 다릅니다.';
export const PAYMENT_KEY_USED_MESSAGE = '이미 다른 주문에 쓰인 결제입니다.';

// 주문 행을 잡은 채 기다리는 Toss 요청보다 길어야 한다.
const CONFIRM_TRANSACTION_TIMEOUT_MS = 2 * TOSS_REQUEST_TIMEOUT_MS;

export interface LimeChargeOrder {
  orderId: string;
  orderName: string;
  amount: number;
  clientKey: string;
  customerKey: string;
}

// balanceAfter는 이 충전 직후 잔액이며, 충전의 원장 행에서 읽는다.
// 그래서 반복된 확정도 첫 번째와 똑같이 답한다.
export interface ConfirmedCharge {
  orderId: string;
  amount: number;
  approvedAt: Date;
  balanceAfter: number;
}

export interface LimeBalance {
  balance: number;
}

// 테스트 데이터에는 충분하다. 원장에는 페이지네이션이 없다(PRD-mypage 7.4).
export const LIME_LEDGER_LIMIT = 50;

// GET /me/lime/ledger의 행 하나. `donation`은 DONATION 행의 라임이
// 어디로 갔는지 알려 주고, CHARGE 행에서는 null이다.
export interface LimeLedgerEntry {
  id: string;
  kind: LimeLedgerKind;
  delta: number;
  balanceAfter: number;
  createdAt: Date;
  donation: DonationTarget | null;
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

  // 최신순이므로 첫 행의 balanceAfter가 현재 잔액이다.
  // 원장 행에는 후원으로 가는 외래 키가 없다(refId는 충전도
  // 가리킨다). 그래서 후원은 두 번째 쿼리로 읽는다.
  async ledger(userId: string): Promise<LimeLedgerEntry[]> {
    const rows = await this.prisma.limeLedger.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIME_LEDGER_LIMIT,
      select: {
        id: true,
        kind: true,
        delta: true,
        balanceAfter: true,
        createdAt: true,
        refId: true,
      },
    });
    const donationIds = rows
      .filter((row) => row.kind === 'DONATION')
      .map((row) => row.refId);
    const donations = await this.prisma.donation.findMany({
      where: { id: { in: donationIds } },
      select: { id: true, ...donationTargetSelect },
    });
    const targets = new Map(
      donations.map(({ id, ...target }) => [id, target] as const),
    );
    return rows.map(({ refId, ...row }) => ({
      ...row,
      donation:
        row.kind === 'DONATION'
          ? (targets.get(refId) ?? { broadcast: null, recipient: null })
          : null,
    }));
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

  // 성공 페이지는 로드할 때마다 이것을 부른다. 그래서 새로고침, 응답을 잃은 뒤의
  // 재시도, 여러 탭의 경합이 모두 주문을 한 번만 적립해야 한다.
  // 행 잠금이 한 주문의 확정을 차례로 세운다. 두 번째로 온 쪽은 주문이
  // APPROVED인 것을 보고 Toss에 다시 묻지 않고 첫 응답을 돌려받는다.
  // 원장의 (kind, refId) UNIQUE가 데이터베이스에서 이를 한 번 더 지킨다.
  // 잔액은 SQL에서 더하는 UPDATE로 늘어나므로, 서로 다른 주문의 확정이
  // 서로의 적립을 덮어쓰지 않는다.
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
      // Toss가 거절했으므로 주문은 알 수 없음이 아니라 FAILED다. 5xx나
      // 연결 끊김은 PENDING으로 남긴다. 어느 쪽이든 재시도로 확정할 수 있다.
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
