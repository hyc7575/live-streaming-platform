import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';

export const CHAT_MAX_LENGTH = 200;

// One poll answers at most this many messages. A client that gets a full
// page asks again right away with the last id.
export const CHAT_PAGE_LIMIT = 200;

export const CHAT_ENDED_MESSAGE =
  '끝난 방송에는 채팅을 보낼 수 없습니다. 댓글을 남겨 주세요.';

// What the API reveals about a chat message. The author appears by nickname
// only.
const chatSelect = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, nickname: true } },
} as const satisfies Prisma.ChatMessageSelect;

export type ChatMessageView = Prisma.ChatMessageGetPayload<{
  select: typeof chatSelect;
}>;

const uuid = z.uuid();

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcasts: BroadcastsService,
  ) {}

  // Messages in (createdAt, id) order, strictly after the `after` message.
  // An `after` that is not a message of this broadcast (deleted, say) reads
  // from the start; the client drops the ids it already has.
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
      // The broadcast was deleted between the check and the insert.
      if (hasPrismaCode(error, 'P2003')) {
        throw new NotFoundException('Broadcast not found');
      }
      throw error;
    }
  }

  async authorIdOf(id: string): Promise<string> {
    const message = uuid.safeParse(id).success
      ? await this.prisma.chatMessage.findUnique({
          where: { id },
          select: { authorId: true },
        })
      : null;
    if (!message) throw new NotFoundException('Chat message not found');
    return message.authorId;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.chatMessage.deleteMany({ where: { id } });
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
