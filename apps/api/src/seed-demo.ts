import { randomUUID } from 'node:crypto';
import type { AuthUser } from './auth/auth-user.js';
import type { TestAccountKey } from './auth/test-accounts.js';
import type { PrismaService } from './database/database.module.js';

// 테스트 계정 A의 ENDED 방송. 심사위원이 먼저 방송하지 않고도 댓글(채점
// 항목이며 방송이 끝난 뒤에만 쓸 수 있다)을 써 볼 수 있게 한다. 다시 실행할 때는
// 제목으로 이 방송을 찾는다.
export const DEMO_ENDED_TITLE = '끝난 방송 예시: 댓글을 남겨 보세요';

const MINUTE_MS = 60_000;

// 처음에는 데모 방송을 채팅·후원·댓글과 함께 한 트랜잭션으로 만든다.
// 그다음부터는 찾기만 하고 아무것도 바꾸지 않는다.
//
// 후원은 B가 카드로 낸 것처럼 둔다. 라임 후원은 원장과 잔액을 함께 맞춰야
// 해서 쓰지 않는다. 결제 키는 실제 토스 결제가 아니라 비워 둔다.
export async function seedDemoEndedBroadcast(
  prisma: PrismaService,
  users: Record<TestAccountKey, AuthUser>,
  now = new Date(),
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.broadcast.findFirst({
    where: { streamerId: users.A.id, title: DEMO_ENDED_TITLE },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const at = (minutesAgo: number) =>
    new Date(now.getTime() - minutesAgo * MINUTE_MS);
  const comment = (authorId: string, body: string, minutesAgo: number) => ({
    authorId,
    body,
    createdAt: at(minutesAgo),
    updatedAt: at(minutesAgo),
  });
  const donation = (amount: number, message: string, minutesAgo: number) => ({
    orderId: `seed_${randomUUID().replaceAll('-', '')}`,
    recipientId: users.A.id,
    donorId: users.B.id,
    amount,
    message,
    status: 'PAID' as const,
    method: 'TOSS' as const,
    approvedAt: at(minutesAgo),
    createdAt: at(minutesAgo),
  });
  return prisma.$transaction(async (tx) => {
    const created = await tx.broadcast.create({
      data: {
        streamerId: users.A.id,
        title: DEMO_ENDED_TITLE,
        description:
          '테스트 계정으로 로그인하면 댓글 탭에서 댓글을 쓰고 고치고 지울 수 있습니다.',
        status: 'ENDED',
        startedAt: at(120),
        endedAt: at(60),
        chatMessages: {
          create: [
            { authorId: users.B.id, body: '안녕하세요!', createdAt: at(110) },
            { authorId: users.A.id, body: '어서 오세요.', createdAt: at(109) },
            {
              authorId: users.B.id,
              body: '소리 잘 들립니다.',
              createdAt: at(100),
            },
          ],
        },
        comments: {
          create: [
            comment(users.B.id, '오늘 방송 잘 봤습니다.', 50),
            comment(users.A.id, '봐 주셔서 고맙습니다.', 45),
          ],
        },
      },
      select: { id: true },
    });
    // 후원 줄은 후원이 승인된 시각에 놓인다(#166).
    for (const input of [
      donation(5000, '첫 방송 축하해요!', 105),
      donation(1000, '', 95),
    ]) {
      const paid = await tx.donation.create({
        data: { ...input, broadcastId: created.id },
        select: { id: true },
      });
      await tx.chatMessage.create({
        data: {
          broadcastId: created.id,
          authorId: input.donorId,
          body: input.message,
          createdAt: input.approvedAt,
          donationId: paid.id,
        },
      });
    }
    return { id: created.id, created: true };
  });
}
