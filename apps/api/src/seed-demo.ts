import type { AuthUser } from './auth/auth-user.js';
import type { TestAccountKey } from './auth/test-accounts.js';
import type { PrismaService } from './database/database.module.js';

// 테스트 계정 A의 ENDED 방송. 심사위원이 먼저 방송하지 않고도 댓글(채점
// 항목이며 방송이 끝난 뒤에만 쓸 수 있다)을 써 볼 수 있게 한다. 다시 실행할 때는
// 제목으로 이 방송을 찾는다.
export const DEMO_ENDED_TITLE = '끝난 방송 예시: 댓글을 남겨 보세요';

const MINUTE_MS = 60_000;

// 처음에는 데모 방송을 채팅·댓글과 함께 한 번의 쓰기로 만든다.
// 그다음부터는 찾기만 하고 아무것도 바꾸지 않는다.
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
