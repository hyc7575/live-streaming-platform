import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CHAT_ENDED_MESSAGE,
  CHAT_MAX_LENGTH,
  CHAT_PAGE_LIMIT,
  type ChatMessageView,
} from '../src/chat/chat.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';

// A chat message as it arrives over HTTP, with its date as an ISO string.
type ChatJson = Omit<ChatMessageView, 'createdAt'> & { createdAt: string };

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const START = Date.parse('2026-11-10T00:00:00.000Z');

describe('chat', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let streamer: { user: TestUser; agent: TestAgent };
  let viewer: { user: TestUser; agent: TestAgent };
  let broadcastId: string;

  const anonymous = () => request(app.getHttpServer());
  const read = (after?: string, id = broadcastId) =>
    anonymous()
      .get(`/api/broadcasts/${id}/chat`)
      .query(after === undefined ? {} : { after });
  const list = async (after?: string) => (await read(after)).body as ChatJson[];
  const post = (agent: TestAgent, body: unknown, id = broadcastId) =>
    agent.post(`/api/broadcasts/${id}/chat`).send(body as object);

  const setStatus = (status: BroadcastStatus) =>
    prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status,
        startedAt: status === 'READY' ? null : new Date(),
        endedAt: status === 'ENDED' ? new Date() : null,
      },
    });

  // Inserts `count` messages one second apart, or all at one instant with
  // `tied`, and returns their ids in (createdAt, id) order.
  async function seedMessages(
    count: number,
    { tied = false, from = START } = {},
  ): Promise<string[]> {
    await prisma.chatMessage.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        broadcastId,
        authorId: viewer.user.id,
        body: `채팅 ${i}`,
        createdAt: new Date(tied ? from : from + i * 1000),
      })),
    });
    const rows = await prisma.chatMessage.findMany({
      where: { broadcastId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    streamer = await signUpAndLogIn(app, { nickname: '불씨' });
    viewer = await signUpAndLogIn(app, { nickname: '구경꾼' });
    const row = await prisma.broadcast.create({
      data: {
        streamerId: streamer.user.id,
        title: '방송',
        status: 'LIVE',
        startedAt: new Date(),
      },
    });
    broadcastId = row.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('sending', () => {
    it.each<BroadcastStatus>(['READY', 'LIVE'])(
      'accepts a message while the broadcast is %s',
      async (status) => {
        await setStatus(status);
        const res = await post(viewer.agent, { body: '  안녕하세요  ' });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({
          id: expect.any(String) as string,
          body: '안녕하세요',
          createdAt: expect.any(String) as string,
          author: { id: viewer.user.id, nickname: '구경꾼' },
        });
        expect(await list()).toEqual([res.body]);
      },
    );

    it('refuses a message on an ended broadcast with 409 and a message for the viewer', async () => {
      await setStatus('ENDED');
      const res = await post(viewer.agent, { body: '늦었나요' });
      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        CHAT_ENDED_MESSAGE,
      );
      expect(await prisma.chatMessage.count()).toBe(0);
    });

    it('answers 401 to an anonymous sender', async () => {
      expect((await post(anonymous(), { body: '안녕' })).status).toBe(401);
      expect(await prisma.chatMessage.count()).toBe(0);
    });

    it('accepts exactly the maximum length', async () => {
      const longest = 'ㄱ'.repeat(CHAT_MAX_LENGTH);
      expect((await post(viewer.agent, { body: longest })).status).toBe(201);
    });

    it.each([
      ['empty', { body: '' }],
      ['whitespace only', { body: '   ' }],
      ['too long', { body: 'ㄱ'.repeat(CHAT_MAX_LENGTH + 1) }],
      ['missing', {}],
      ['not a string', { body: 42 }],
    ])('rejects a %s body with 400', async (_label, bad) => {
      expect((await post(viewer.agent, bad)).status).toBe(400);
      expect(await prisma.chatMessage.count()).toBe(0);
    });

    it.each([UNKNOWN_ID, 'not-a-uuid'])(
      'answers 404 for the chat of a missing broadcast %s',
      async (id) => {
        expect((await read(undefined, id)).status).toBe(404);
        expect((await post(viewer.agent, { body: '안녕' }, id)).status).toBe(
          404,
        );
      },
    );
  });

  describe('deleting', () => {
    let messageId: string;
    const url = () => `/api/chat/${messageId}`;

    beforeEach(async () => {
      messageId = (
        (await post(viewer.agent, { body: '지울 채팅' })).body as ChatJson
      ).id;
    });

    it('lets the author delete their message', async () => {
      expect((await viewer.agent.delete(url())).status).toBe(204);
      expect(await list()).toEqual([]);
    });

    it('lets the author delete after the broadcast ended', async () => {
      await setStatus('ENDED');
      expect((await viewer.agent.delete(url())).status).toBe(204);
      expect(await list()).toEqual([]);
    });

    it('refuses anyone else, the streamer included, with 403', async () => {
      expect((await streamer.agent.delete(url())).status).toBe(403);
      expect((await list()).map((m) => m.id)).toEqual([messageId]);
    });

    it('answers 401 when anonymous', async () => {
      expect((await anonymous().delete(url())).status).toBe(401);
      expect((await list()).map((m) => m.id)).toEqual([messageId]);
    });

    it.each([UNKNOWN_ID, 'not-a-uuid'])(
      'answers 404 for a missing message %s',
      async (id) => {
        expect((await viewer.agent.delete(`/api/chat/${id}`)).status).toBe(404);
      },
    );
  });

  describe('reading', () => {
    it('lists messages oldest first with the author’s nickname, never the email', async () => {
      await post(viewer.agent, { body: '첫 채팅' });
      await post(streamer.agent, { body: '둘째 채팅' });
      const messages = await list();
      expect(messages.map((m) => [m.body, m.author.nickname])).toEqual([
        ['첫 채팅', '구경꾼'],
        ['둘째 채팅', '불씨'],
      ]);
      expect(Object.keys(messages[0]!).sort()).toEqual([
        'author',
        'body',
        'createdAt',
        'id',
      ]);
      expect(messages[0]!.author).toEqual({
        id: viewer.user.id,
        nickname: '구경꾼',
      });
    });

    it(`starts from the oldest and stops at ${CHAT_PAGE_LIMIT}`, async () => {
      const ids = await seedMessages(CHAT_PAGE_LIMIT + 1);
      expect((await list()).map((m) => m.id)).toEqual(
        ids.slice(0, CHAT_PAGE_LIMIT),
      );
    });

    it('returns only messages after the cursor', async () => {
      const ids = await seedMessages(5);
      expect((await list(ids[2])).map((m) => m.id)).toEqual(ids.slice(3));
      expect(await list(ids[4])).toEqual([]);
    });

    it('neither skips nor repeats messages that share the cursor’s createdAt', async () => {
      await seedMessages(2);
      await seedMessages(5, { tied: true, from: START + 10_000 });
      const ids = await seedMessages(2, { from: START + 20_000 });
      // ids[2..6] share one createdAt; the cursor sits in the middle of them.
      expect((await list(ids[4])).map((m) => m.id)).toEqual(ids.slice(5));
    });

    it('visits every message exactly once when walking pages', async () => {
      await seedMessages(CHAT_PAGE_LIMIT - 1);
      await seedMessages(CHAT_PAGE_LIMIT + 3, {
        tied: true,
        from: START + CHAT_PAGE_LIMIT * 1000,
      });
      const all = (
        await prisma.chatMessage.findMany({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        })
      ).map((r) => r.id);
      const seen: string[] = [];
      let after: string | undefined;
      for (;;) {
        const page = await list(after);
        seen.push(...page.map((m) => m.id));
        if (page.length < CHAT_PAGE_LIMIT) break;
        after = page.at(-1)!.id;
      }
      expect(seen).toEqual(all);
    });

    it('answers a cursor on a 1,000-message broadcast with only the newer messages', async () => {
      const ids = await seedMessages(1000);
      const full = await read();
      const cursor = await read(ids[994]);
      expect((cursor.body as ChatJson[]).map((m) => m.id)).toEqual(
        ids.slice(995),
      );
      const fullBytes = Buffer.byteLength(full.text);
      const cursorBytes = Buffer.byteLength(cursor.text);
      console.log(
        `chat GET bytes: no after (first ${CHAT_PAGE_LIMIT} of 1000) = ${fullBytes}, after=#995 (5 newer) = ${cursorBytes}`,
      );
      expect(cursorBytes).toBeLessThan(fullBytes);
    });

    it('reads from the start when the cursor is not a message of this broadcast', async () => {
      const ids = await seedMessages(3);
      expect((await list(UNKNOWN_ID)).map((m) => m.id)).toEqual(ids);
    });

    it('rejects a malformed cursor with 400', async () => {
      expect((await read('not-a-uuid')).status).toBe(400);
    });

    it('removes the chat of a broadcast its streamer deletes', async () => {
      await post(viewer.agent, { body: '잘 봤습니다' });
      expect(
        (await streamer.agent.delete(`/api/broadcasts/${broadcastId}`)).status,
      ).toBe(204);
      expect(await prisma.chatMessage.count()).toBe(0);
    });
  });
});
