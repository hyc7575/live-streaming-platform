import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';

export const COMMENT_MAX_LENGTH = 500;

export const COMMENT_NOT_ENDED_MESSAGE =
  '댓글은 방송이 끝난 뒤에 남길 수 있습니다. 방송 중에는 채팅을 이용해 주세요.';

// 공개 방송 목록처럼 페이지네이션이 없다. 시청 페이지는 최신 댓글을 보여 주며
// 폴링하므로, 고정 상한으로 폴링 응답을 작게 유지한다.
export const COMMENT_LIST_LIMIT = 100;

// API가 댓글에 대해 공개하는 정보. 작성자는 닉네임으로만 나온다.
const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, nickname: true } },
} as const satisfies Prisma.CommentSelect;

export type CommentView = Prisma.CommentGetPayload<{
  select: typeof commentSelect;
}>;

const uuid = z.uuid();

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcasts: BroadcastsService,
  ) {}

  // 댓글은 방송 자체가 보이는 곳에서만 보인다. 그래서 상세 엔드포인트가
  // 404로 답하는 방송에는 보여 줄 댓글도 없다.
  async list(broadcastId: string): Promise<CommentView[]> {
    await this.broadcasts.get(broadcastId);
    const latest = await this.prisma.comment.findMany({
      where: { broadcastId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: COMMENT_LIST_LIMIT,
      select: commentSelect,
    });
    return latest.reverse();
  }

  // 방송이 끝나기 전에는 시청자가 채팅으로 이야기한다. 댓글은 끝난 뒤에 쓴다.
  // createdAt과 updatedAt은 같은 값으로 시작하므로, 페이지는 updatedAt만 보고
  // 수정된 댓글을 가려낸다.
  async create(
    broadcastId: string,
    authorId: string,
    body: string,
  ): Promise<CommentView> {
    const broadcast = await this.broadcasts.get(broadcastId);
    if (broadcast.status !== 'ENDED') {
      throw new ConflictException(COMMENT_NOT_ENDED_MESSAGE);
    }
    const now = new Date();
    try {
      return await this.prisma.comment.create({
        data: { broadcastId, authorId, body, createdAt: now, updatedAt: now },
        select: commentSelect,
      });
    } catch (error) {
      // 확인과 삽입 사이에 방송이 삭제됐다.
      if (hasPrismaCode(error, 'P2003')) {
        throw new NotFoundException('Broadcast not found');
      }
      throw error;
    }
  }

  async authorIdOf(id: string): Promise<string> {
    const comment = uuid.safeParse(id).success
      ? await this.prisma.comment.findUnique({
          where: { id },
          select: { authorId: true },
        })
      : null;
    if (!comment) throw new NotFoundException('Comment not found');
    return comment.authorId;
  }

  async update(id: string, body: string): Promise<CommentView> {
    try {
      return await this.prisma.comment.update({
        where: { id },
        data: { body },
        select: commentSelect,
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) {
        throw new NotFoundException('Comment not found');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.prisma.comment.deleteMany({ where: { id } });
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
