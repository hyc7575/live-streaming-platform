import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';

export const CHAT_MAX_LENGTH = 200;

// 폴링 한 번은 메시지를 최대 이만큼 돌려준다. 꽉 찬 페이지를 받은
// 클라이언트는 마지막 id로 바로 다시 묻는다.
export const CHAT_PAGE_LIMIT = 200;

export const CHAT_ENDED_MESSAGE =
  '끝난 방송에는 채팅을 보낼 수 없습니다. 댓글을 남겨 주세요.';

// API가 채팅 메시지에 대해 공개하는 정보. 작성자는 닉네임으로만
// 나온다.
const chatSelect = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, nickname: true } },
} as const satisfies Prisma.ChatMessageSelect;

export type ChatMessageView = Prisma.ChatMessageGetPayload<{
  select: typeof chatSelect;
}>;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcasts: BroadcastsService,
  ) {}

  // (createdAt, id) 순서의 메시지 중 `after` 메시지보다 엄밀히 뒤인 것.
  // `after`가 이 방송의 메시지가 아니면(예: 삭제됨) 처음부터
  // 읽는다. 클라이언트는 이미 가진 id를 버린다.
  async list(
    broadcastId: string,
    after: string | undefined,
  ): Promise<ChatMessageView[]> {
    await this.broadcasts.get(broadcastId);
    const cursor = after
      ? await this.prisma.chatMessage.findFirst({
          where: { id: after, broadcastId },
          select: { id: true, createdAt: true },
        })
      : null;
    return this.prisma.chatMessage.findMany({
      where: {
        broadcastId,
        ...(cursor && {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: CHAT_PAGE_LIMIT,
      select: chatSelect,
    });
  }

  async create(
    broadcastId: string,
    authorId: string,
    body: string,
  ): Promise<ChatMessageView> {
    const broadcast = await this.broadcasts.get(broadcastId);
    if (broadcast.status === 'ENDED') {
      throw new ConflictException(CHAT_ENDED_MESSAGE);
    }
    try {
      return await this.prisma.chatMessage.create({
        data: { broadcastId, authorId, body },
        select: chatSelect,
      });
    } catch (error) {
      // 확인과 삽입 사이에 방송이 삭제됐다.
      if (hasPrismaCode(error, 'P2003')) {
        throw new NotFoundException('Broadcast not found');
      }
      throw error;
    }
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
