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
import { donationTargetSelect, type DonationTarget } from './sent-donation.js';
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

// 댓글처럼 페이지네이션이 없다. 시청 페이지는 최신 후원을 폴링하고,
// 합계는 이 목록이 아니라 집계에서 가져온다.
export const DONATION_LIST_LIMIT = 50;

export const NOT_CONFIGURED_MESSAGE = '후원 기능이 설정되지 않았습니다.';
export const ORDER_NOT_FOUND_MESSAGE = '후원 주문을 찾을 수 없습니다.';
export const NOT_YOUR_ORDER_MESSAGE = '내 후원 주문만 승인할 수 있습니다.';
export const AMOUNT_MISMATCH_MESSAGE = '결제 금액이 주문과 다릅니다.';
export const PAYMENT_KEY_USED_MESSAGE = '이미 다른 주문에 쓰인 결제입니다.';
export const BROADCAST_DELETED_MESSAGE = '방송이 삭제되어 후원할 수 없습니다.';
// 이 409와 함께 보낸다. 그래야 웹이 메시지를 맞춰 보지 않고도 다른 충돌과
// 구별한다.
export const BROADCAST_DELETED_CODE = 'BROADCAST_DELETED';

// Toss는 orderName을 100자로 제한한다.
const ORDER_NAME_MAX_LENGTH = 100;
const ORDER_NAME_SUFFIX = ' 후원';

// 주문 행을 잡은 채 기다리는 Toss 요청보다 길어야 한다.
const CONFIRM_TRANSACTION_TIMEOUT_MS = 2 * TOSS_REQUEST_TIMEOUT_MS;

// API가 후원에 대해 공개하는 정보. 후원자는 닉네임으로만 나온다.
// `method`로 카드 후원(TOSS)과 라임 후원(LIME)을 구별한다.
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

// 호출자 본인의 내역에 쓰는, 호출자가 보낸 후원. 누가 보냈는지가 아니라
// 누구에게 갔는지를 담는다.
export type SentDonation = Omit<DonationView, 'donor'> & DonationTarget;

// GET /me/donations. DonationList처럼 합계는 PAID 후원 전부를 셈하고
// 목록은 최신 DONATION_LIST_LIMIT개만 담는다.
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

// 호출자가 받은 후원. 누가 보냈는지, 어느 방송에서인지(삭제되면 null)를
// 담는다. 받는 사람 기준으로 읽으므로 방송을 지워도 스트리머의 합계는
// 줄지 않는다(PRD-mypage KR4).
const receivedSelect = {
  ...donationSelect,
  broadcast: { select: { id: true, title: true } },
} as const satisfies Prisma.DonationSelect;

export type ReceivedDonation = Prisma.DonationGetPayload<{
  select: typeof receivedSelect;
}>;

// GET /me/received-donations. DonationList처럼 합산한다.
export interface ReceivedDonationList {
  total: number;
  count: number;
  donations: ReceivedDonation[];
}

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

  // 두 결제 방식 모두 여기로 온다. 라임 후원은 처음부터 PAID로 저장된다.
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

  // PENDING 주문은 뺀다. 결제된 적이 없고, 라임 후원은
  // 처음부터 PAID이다.
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
      donations: rows,
    };
  }

  async receivedBy(recipientId: string): Promise<ReceivedDonationList> {
    const where = { recipientId, status: 'PAID' } as const;
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
        select: receivedSelect,
      }),
    ]);
    return {
      total: aggregate._sum.amount ?? 0,
      count: aggregate._count,
      donations,
    };
  }

  // DonationTargetGuard가 이미 방송이 남의 것이고 LIVE인지
  // 확인했다.
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
        data: {
          orderId,
          broadcastId,
          recipientId: broadcast.streamer.id,
          donorId,
          ...input,
        },
      });
    } catch (error) {
      // 확인과 삽입 사이에 방송이 삭제됐다.
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

  // 성공 페이지는 로드할 때마다 이것을 부른다. 그래서 새로고침, 응답을 잃은 뒤의
  // 재시도, 두 탭의 경합이 모두 주문을 한 번만 적립해야 한다.
  // 행 잠금이 한 주문의 확정을 차례로 세운다. 두 번째로 온 쪽은 주문이
  // PAID인 것을 보고 Toss에 다시 묻지 않고 그대로 돌려준다. Toss가 실패하면
  // 주문은 PENDING으로 남고, 재시도는 Toss가 이미 본 Idempotency-Key를 다시 쓴다.
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
            // 주문이 삭제된 방송보다 오래 남았으므로(#114) Toss에 묻지 않고
            // 거부한다. 확정과 경합하는 삭제는 이 행 잠금을
            // 기다린다. 확정이 커밋되면 그 뒤에 삭제가
            // PAID 후원의 방송 연결을 끊고, 후원은 기록으로 남는다.
            //
            // 알려진 빈틈: 502로 끝난 확정은 롤백되어 주문을 PENDING으로 남긴다.
            // Toss는 돈을 받았을 수도 있다. 재시도 전에 방송이
            // 삭제되면 재시도는 여기로 와서
            // Toss에 다시 묻지 않으므로, 그 결제는 기록되지 않는다.
            // #114 이전의 cascade도 같은 식으로 그 결제를 잃었다(404).
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
