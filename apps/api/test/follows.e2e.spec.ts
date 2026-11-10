import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import { SELF_FOLLOW_MESSAGE } from '../src/follows/follows.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';

interface FollowedJson {
  id: string;
  nickname: string;
  live: { broadcastId: string; title: string; startedAt: string } | null;
}

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('follows', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let viewer: { user: TestUser; agent: TestAgent };
  let streamer: { user: TestUser; agent: TestAgent };

  const followUrl = (id: string) => `/api/streamers/${id}/follow`;
  const follows = async (agent = viewer.agent) =>
    (await agent.get('/api/me/follows')).body as FollowedJson[];

  const goLive = (streamerId: string, title: string, startedAt: Date) =>
    prisma.broadcast.create({
      data: { streamerId, title, status: 'LIVE', startedAt },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    viewer = await signUpAndLogIn(app, { nickname: '구경꾼' });
    streamer = await signUpAndLogIn(app, { nickname: '불씨' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps one row however many times a viewer follows or unfollows', async () => {
    const url = followUrl(streamer.user.id);
    expect((await viewer.agent.put(url)).status).toBe(204);
    expect((await viewer.agent.put(url)).status).toBe(204);
    expect(await prisma.follow.count()).toBe(1);
    expect(await follows()).toEqual([
      { id: streamer.user.id, nickname: '불씨', live: null },
    ]);

    expect((await viewer.agent.delete(url)).status).toBe(204);
    expect((await viewer.agent.delete(url)).status).toBe(204);
    expect(await prisma.follow.count()).toBe(0);
    expect(await follows()).toEqual([]);
  });

  it.each(['put', 'delete'] as const)(
    '%s checks login, then the id, then self, then the streamer',
    async (method) => {
      const send = (agent: TestAgent, id: string) =>
        agent[method](followUrl(id));
      const anonymous = request.agent(app.getHttpServer());
      expect((await send(anonymous, 'not-a-uuid')).status).toBe(401);
      expect((await send(viewer.agent, 'not-a-uuid')).status).toBe(400);
      const self = await send(viewer.agent, viewer.user.id);
      expect(self.status).toBe(400);
      expect((self.body as { message: string }).message).toBe(
        SELF_FOLLOW_MESSAGE,
      );
      expect((await send(viewer.agent, UNKNOWN_ID)).status).toBe(404);
      expect(await prisma.follow.count()).toBe(0);
    },
  );

  it('lists live streamers first, latest start on top, then the rest by nickname', async () => {
    const user = async (nickname: string) =>
      (await signUpAndLogIn(app, { nickname })).user;
    const squirrel = await user('다람쥐');
    const garam = await user('가람');
    const nabi = await user('나비');
    const lime = await user('라임');
    for (const s of [streamer.user, squirrel, garam, nabi, lime]) {
      await viewer.agent.put(followUrl(s.id));
    }
    const earlier = await goLive(nabi.id, '먼저 켠 방송', new Date(1_000));
    const later = await goLive(lime.id, '나중에 켠 방송', new Date(2_000));

    expect(await follows()).toEqual([
      {
        id: lime.id,
        nickname: '라임',
        live: {
          broadcastId: later.id,
          title: '나중에 켠 방송',
          startedAt: new Date(2_000).toISOString(),
        },
      },
      {
        id: nabi.id,
        nickname: '나비',
        live: {
          broadcastId: earlier.id,
          title: '먼저 켠 방송',
          startedAt: new Date(1_000).toISOString(),
        },
      },
      { id: garam.id, nickname: '가람', live: null },
      { id: squirrel.id, nickname: '다람쥐', live: null },
      { id: streamer.user.id, nickname: '불씨', live: null },
    ]);
  });

  it('drops the live info once the broadcast ends', async () => {
    await viewer.agent.put(followUrl(streamer.user.id));
    const live = await goLive(streamer.user.id, '지금 방송', new Date());
    expect((await follows())[0]?.live).toMatchObject({
      broadcastId: live.id,
      title: '지금 방송',
    });

    const ended = await streamer.agent.post(`/api/broadcasts/${live.id}/end`);
    expect(ended.status).toBe(200);
    expect(await follows()).toEqual([
      { id: streamer.user.id, nickname: '불씨', live: null },
    ]);
  });

  it('shows no READY or ENDED broadcast as live', async () => {
    await viewer.agent.put(followUrl(streamer.user.id));
    await prisma.broadcast.create({
      data: { streamerId: streamer.user.id, title: '방송 전' },
    });
    await prisma.broadcast.create({
      data: {
        streamerId: streamer.user.id,
        title: '끝난 방송',
        status: 'ENDED',
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });
    expect((await follows())[0]?.live).toBeNull();
  });

  it('removes a deleted user’s follows on both sides', async () => {
    const third = await signUpAndLogIn(app, { nickname: '셋째' });
    await viewer.agent.put(followUrl(streamer.user.id));
    await streamer.agent.put(followUrl(viewer.user.id));
    await third.agent.put(followUrl(streamer.user.id));

    await prisma.user.delete({ where: { id: streamer.user.id } });

    expect(await prisma.follow.count()).toBe(0);
    expect(await follows(third.agent)).toEqual([]);
  });
});
