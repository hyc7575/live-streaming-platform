import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma } from '../generated/prisma/client.js';

export const COMMENT_MAX_LENGTH = 500;

// No pagination, like the public broadcast list: the watch page shows the
// latest comments and polls, so a fixed cap keeps each poll small.
export const COMMENT_LIST_LIMIT = 100;

// What the API reveals about a comment. The author appears by nickname only.
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

  // Comments are visible wherever the broadcast itself is, so a broadcast
  // the detail endpoint answers 404 for has no comments to show either.
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

  // createdAt and updatedAt start equal, so the page can tell an edited
  // comment by updatedAt alone.
  async create(
    broadcastId: string,
    authorId: string,
    body: string,
  ): Promise<CommentView> {
    await this.broadcasts.get(broadcastId);
    const now = new Date();
    try {
      return await this.prisma.comment.create({
        data: { broadcastId, authorId, body, createdAt: now, updatedAt: now },
        select: commentSelect,
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
