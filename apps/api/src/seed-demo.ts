import type { AuthUser } from './auth/auth-user.js';
import type { TestAccountKey } from './auth/test-accounts.js';
import type { PrismaService } from './database/database.module.js';

// An ENDED broadcast by test account A, so judges can try comments (a graded
// item, written only after a broadcast ends) without streaming first. The
// title is how a re-run finds it again.
export const DEMO_ENDED_TITLE = '끝난 방송 예시: 댓글을 남겨 보세요';

const MINUTE_MS = 60_000;

// Creates the demo broadcast with its chat and comments in one write the
// first time; afterwards finds it and changes nothing.
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
  const created = await prisma.broadcast.create({
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
  return { id: created.id, created: true };
}
