import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  READY_LISTED_MS,
  type BroadcastView,
} from '../src/broadcasts/broadcasts.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import type { StreamerProfile } from '../src/streamers/streamers.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// PRD-mypage 7.2: 스트리머의 공개 채널 페이지. 로그인 여부와
// 상관없이 누구나 읽을 수 있다.
describe('streamer channel', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let streamer: { user: TestUser; agent: TestAgent };
  let other: { user: TestUser; agent: TestAgent };

  const anonymous = () => request(app.getHttpServer());
  const ago = (ms: number) => new Date(clock.now().getTime() - ms);

  const seed = async (
    streamerId: string,
    title: string,
    status: BroadcastStatus,
    createdAt = ago(60_000),
  ) =>
    (
      await prisma.broadcast.create({
        data: {
          streamerId,
          title,
          status,
          createdAt,
          startedAt: status === 'READY' ? null : createdAt,
          endedAt: status === 'ENDED' ? createdAt : null,
        },
      })
    ).id;

  const profile = async (id: string) => {
    const res = await anonymous().get(`/api/streamers/${id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StreamerProfile;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clock = fakeClockOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    streamer = await signUpAndLogIn(app, { nickname: '불씨' });
    other = await signUpAndLogIn(app, { nickname: '구경꾼' });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['', '/broadcasts'])(
    'answers %s with 400 for a malformed id and 404 for an unknown one',
    async (suffix) => {
      expect((await anonymous().get(`/api/streamers/x${suffix}`)).status).toBe(
        400,
      );
      expect(
        (await anonymous().get(`/api/streamers/${UNKNOWN_ID}${suffix}`)).status,
      ).toBe(404);
    },
  );

  it('shows the nickname, follower count and LIVE broadcast, never the followers', async () => {
    expect(await profile(streamer.user.id)).toEqual({
      id: streamer.user.id,
      nickname: '불씨',
      bio: '',
      avatarUrl: null,
      followerCount: 0,
      liveBroadcastId: null,
    });

    const follow = await other.agent.put(
      `/api/streamers/${streamer.user.id}/follow`,
    );
    expect(follow.status).toBe(204);
    const live = await seed(streamer.user.id, '지금 방송', 'LIVE');
    await seed(other.user.id, '다른 사람 LIVE', 'LIVE');

    const shown = await profile(streamer.user.id);
    expect(shown).toEqual({
      id: streamer.user.id,
      nickname: '불씨',
      bio: '',
      avatarUrl: null,
      followerCount: 1,
      liveBroadcastId: live,
    });
    expect(JSON.stringify(shown)).not.toContain(other.user.id);
    expect(JSON.stringify(shown)).not.toContain('@');
  });

  it('lists only this streamer’s public broadcasts, LIVE first, like the public list', async () => {
    const ended = await seed(
      streamer.user.id,
      '지난 방송',
      'ENDED',
      ago(5_000),
    );
    const ready = await seed(streamer.user.id, '곧 할 방송', 'READY');
    await seed(streamer.user.id, '버려진 준비', 'READY', ago(READY_LISTED_MS));
    const live = await seed(streamer.user.id, '지금 방송', 'LIVE');
    await seed(other.user.id, '다른 사람 방송', 'ENDED');

    const res = await anonymous().get(
      `/api/streamers/${streamer.user.id}/broadcasts`,
    );
    expect(res.status).toBe(200);
    const list = res.body as BroadcastView[];
    expect(list.map((b) => b.id)).toEqual([live, ready, ended]);
    for (const b of list) {
      expect(b.streamer.id).toBe(streamer.user.id);
    }
  });

  it('answers a streamer with no broadcasts with an empty list', async () => {
    const res = await other.agent.get(
      `/api/streamers/${streamer.user.id}/broadcasts`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
