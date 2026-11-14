import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  COMMENT_LIST_LIMIT,
  COMMENT_MAX_LENGTH,
  COMMENT_NOT_ENDED_MESSAGE,
  type CommentView,
} from '../src/comments/comments.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';

// HTTP로 받은 댓글. 날짜는 ISO 문자열이다.
type CommentJson = Omit<CommentView, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('comments', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let streamer: { user: TestUser; agent: TestAgent };
  let viewer: { user: TestUser; agent: TestAgent };
  let broadcastId: string;

  const anonymous = () => request(app.getHttpServer());
  const list = async (id = broadcastId) =>
    (await anonymous().get(`/api/broadcasts/${id}/comments`))
      .body as CommentJson[];
  const post = (agent: TestAgent, body: unknown, id = broadcastId) =>
    agent.post(`/api/broadcasts/${id}/comments`).send(body as object);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    streamer = await signUpAndLogIn(app, { nickname: '불씨' });
    viewer = await signUpAndLogIn(app, { nickname: '구경꾼' });
    const now = new Date();
    const row = await prisma.broadcast.create({
      data: {
        streamerId: streamer.user.id,
        title: '방송',
        status: 'ENDED',
        startedAt: now,
        endedAt: now,
      },
    });
    broadcastId = row.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists comments oldest first with the author’s nickname, never the email', async () => {
    await post(viewer.agent, { body: '첫 댓글' });
    await post(streamer.agent, { body: '둘째 댓글' });
    const comments = await list();
    expect(comments.map((c) => [c.body, c.author.nickname])).toEqual([
      ['첫 댓글', '구경꾼'],
      ['둘째 댓글', '불씨'],
    ]);
    expect(comments[0]).toEqual({
      id: expect.any(String) as string,
      body: '첫 댓글',
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
      author: { id: viewer.user.id, nickname: '구경꾼' },
    });
  });

  it(`returns only the latest ${COMMENT_LIST_LIMIT}, still oldest first`, async () => {
    const start = Date.parse('2026-11-10T00:00:00.000Z');
    await prisma.comment.createMany({
      data: Array.from({ length: COMMENT_LIST_LIMIT + 1 }, (_, i) => ({
        broadcastId,
        authorId: viewer.user.id,
        body: `댓글 ${i}`,
        createdAt: new Date(start + i * 1000),
        updatedAt: new Date(start + i * 1000),
      })),
    });
    const bodies = (await list()).map((c) => c.body);
    expect(bodies).toHaveLength(COMMENT_LIST_LIMIT);
    expect(bodies[0]).toBe('댓글 1');
    expect(bodies.at(-1)).toBe(`댓글 ${COMMENT_LIST_LIMIT}`);
  });

  it.each<BroadcastStatus>(['READY', 'LIVE'])(
    'refuses a comment while the broadcast is %s with 409 and a message for the viewer',
    async (status) => {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status, endedAt: null },
      });
      const res = await post(viewer.agent, { body: '안녕' });
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        COMMENT_NOT_ENDED_MESSAGE,
      );
      expect(await prisma.comment.count()).toBe(0);
    },
  );

  it('trims the body and accepts exactly the maximum length', async () => {
    const res = await post(viewer.agent, { body: '  안녕하세요  ' });
    expect(res.status).toBe(201);
    expect((res.body as CommentJson).body).toBe('안녕하세요');
    const longest = 'ㄱ'.repeat(COMMENT_MAX_LENGTH);
    expect((await post(viewer.agent, { body: longest })).status).toBe(201);
  });

  it.each([
    ['empty', { body: '' }],
    ['whitespace only', { body: '   ' }],
    ['too long', { body: 'ㄱ'.repeat(COMMENT_MAX_LENGTH + 1) }],
    ['missing', {}],
    ['not a string', { body: 42 }],
  ])('rejects a %s body with 400 on create and edit', async (_label, bad) => {
    expect((await post(viewer.agent, bad)).status).toBe(400);
    const created = await post(viewer.agent, { body: '원래 댓글' });
    const id = (created.body as CommentJson).id;
    const edit = await viewer.agent.patch(`/api/comments/${id}`).send(bad);
    expect(edit.status).toBe(400);
    expect((await list()).map((c) => c.body)).toEqual(['원래 댓글']);
  });

  it.each([UNKNOWN_ID, 'not-a-uuid'])(
    'answers 404 for comments of a missing broadcast %s',
    async (id) => {
      expect(
        (await anonymous().get(`/api/broadcasts/${id}/comments`)).status,
      ).toBe(404);
      expect((await post(viewer.agent, { body: '안녕' }, id)).status).toBe(404);
      expect(await prisma.comment.count()).toBe(0);
    },
  );

  it('marks an edit through updatedAt and keeps createdAt', async () => {
    const created = (await post(viewer.agent, { body: '오타 잇음' }))
      .body as CommentJson;
    expect(created.updatedAt).toBe(created.createdAt);
    const edited = await viewer.agent
      .patch(`/api/comments/${created.id}`)
      .send({ body: '오타 있음' });
    expect(edited.status).toBe(200);
    const [after] = await list();
    expect(after).toMatchObject({
      id: created.id,
      body: '오타 있음',
      createdAt: created.createdAt,
    });
    expect(Date.parse(after!.updatedAt)).toBeGreaterThan(
      Date.parse(created.createdAt),
    );
  });

  it('removes the comments of a broadcast its streamer deletes', async () => {
    await post(viewer.agent, { body: '잘 봤습니다' });
    const removed = await streamer.agent.delete(
      `/api/broadcasts/${broadcastId}`,
    );
    expect(removed.status).toBe(204);
    expect(await prisma.comment.count()).toBe(0);
    expect(
      (await anonymous().get(`/api/broadcasts/${broadcastId}/comments`)).status,
    ).toBe(404);
  });

  it('answers 404 to the author for a comment already deleted', async () => {
    const created = (await post(viewer.agent, { body: '지울 댓글' }))
      .body as CommentJson;
    const url = `/api/comments/${created.id}`;
    expect((await viewer.agent.delete(url)).status).toBe(204);
    expect((await viewer.agent.delete(url)).status).toBe(404);
    expect((await viewer.agent.patch(url).send({ body: '다시' })).status).toBe(
      404,
    );
  });
});
