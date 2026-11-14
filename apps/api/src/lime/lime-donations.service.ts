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
  // 클라이언트의 멱등 키. 후원 시도마다 하나이고, 그 시도를 다시 보낼 때마다
  // 같다. Donation.orderId에 저장하며, 이 컬럼의
  // UNIQUE를 카드 주문과 함께 쓴다.
  orderId: string;
}

export interface LimeDonationResult {
  donation: ConfirmedDonation;
  // 이 키가 이미 이 후원을 만들었고 아무것도 바뀌지 않았으면 false.
  created: boolean;
}

// 트랜잭션 안에서 던져 롤백시킨다. 그 뒤 진짜 실패와
// 구별한다.
class InsufficientLime extends Error {}

@Injectable()
export class LimeDonationsService {
  constructor(private readonly prisma: PrismaService) {}

  // 호출자가 이미 키를 조회했고(`earlier`) 대상을
  // 확인했다(DonationTargetGuard.check).
  //
  // 트랜잭션 하나가 차감, 후원 기록, 원장 쓰기를 한다.
  // 차감은 조건부 UPDATE이므로, 동시에 온 후원은
  // 사용자 행에서 줄을 서고 각자 앞선 후원이 남긴 잔액을 본다. 그래서
  // 같은 라임을 두 번 쓸 수 없다. 다시 보낸 키는 Donation.orderId의
  // UNIQUE에 걸리고, Postgres가 트랜잭션을 중단해 차감까지
  // 모두 롤백된다. 그런 다음에야 트랜잭션 밖에서 앞선 후원을
  // 조회한다. 중단된 트랜잭션은 쿼리를 더 실행할 수 없기 때문이다.
  async donate(
    { broadcastId, recipientId }: { broadcastId: string; recipientId: string },
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
            recipientId,
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
        // 잔액이 바닥난 뒤 다시 보내면 차감할 라임이 없다. 그래서
        // 잔액 부족은 이미 후원한 키일 수도 있다.
        const replayed = await this.earlier(broadcastId, donorId, input);
        if (replayed) return { donation: replayed, created: false };
        if (error instanceof InsufficientLime) {
          throw new ConflictException(INSUFFICIENT_LIME_MESSAGE);
        }
        throw error;
      }
      // 확인과 삽입 사이에 방송이 삭제됐다.
      if (hasPrismaCode(error, 'P2003')) {
        throw new NotFoundException('Broadcast not found');
      }
      throw error;
    }
  }

  // 이 키로 앞선 요청이 만든 후원. 같은 후원자가 같은 방송에 같은 금액을
  // 라임으로 낸 경우에만 해당한다. 키의 다른
  // 주인(다른 사용자, 카드 주문)은 방송이 아직 있든 없든
  // 409이다. 후원자 본인의 후원이지만 방송이
  // 삭제된 경우(#114)는 404이다. 기록으로는 남지만 답해 줄 방송이
  // 없다. 그 키를 가진 후원이 없으면 null.
  //
  // 컨트롤러는 방송을 확인하기 전에 이것을 묻는다. 그래서 첫 응답을 잃고 다시 보낸
  // 요청은 방송이 끝난 뒤에도 그 후원을 돌려받는다.
  // 아직 아무것도 만들지 않은 키만 대상 확인을
  // 거친다(PRD-lime 7.3 순서).
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
    const mine =
      donation.method === 'LIME' &&
      donation.donor.id === donorId &&
      donation.amount === input.amount;
    if (mine && donation.broadcastId === null) {
      throw new NotFoundException('Broadcast not found');
    }
    if (!mine || donation.broadcastId !== broadcastId) {
      throw new ConflictException(ORDER_ID_TAKEN_MESSAGE);
    }
    return donation;
  }
}
