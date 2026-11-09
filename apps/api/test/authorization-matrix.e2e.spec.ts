import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Response } from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BroadcastView } from '../src/broadcasts/broadcasts.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';

// PRD §7.5 authorization matrix (KR3), driven as one table. Every row that
// exists in the API today runs for each caller against an owner's broadcast
// in every status. A cell is the expected HTTP status. A rejected cell also
// proves the database did not change, and an allowed cell proves its effect
// through the API the way a user would see it.

type Actor = 'anonymous' | 'other' | 'owner';
type Cell = number | Record<BroadcastStatus, number>;

interface World {
  status: BroadcastStatus;
  owner: TestUser;
  other: TestUser;
  // The owner's broadcast that resource rows act on.
  targetId: string;
  // An ENDED broadcast of the other user, so lists have something to leave out.
  othersId: string;
  as: Record<Actor, TestAgent>;
}

// Same columns and labels as the PRD table. '—' means the PRD has no cell:
// nobody owns a broadcast before creating it.
const ACTORS: Actor[] = ['anonymous', 'other', 'owner'];

// prettier-ignore
const MATRIX = {
  //                 비로그인  로그인(타인)  소유자
  '방송 목록 조회': [200,      200,          200],
  '방송 상세 조회': [200,      200,          200],
  '방송 생성':      [401,      201,          '—'],
  '방송 수정':      [401,      403,          200],
  '방송 삭제':      [401,      403,          { READY: 204, LIVE: 409, ENDED: 204 }],
  '내 방송 조회':   [401,      200,          200],
  '송출 토큰 발급': [401,      403,          { READY: 201, LIVE: 201, ENDED: 409 }],
} satisfies Record<string, [Cell, Cell, Cell | '—']>;
// The owner's LIVE delete is 409 until ending a broadcast exists (#11). PRD
// §7.4 then wants it to end the broadcast and delete it. An ENDED broadcast
// never goes LIVE again, so it gets no publish token.

type Action = keyof typeof MATRIX;

interface ActionDriver {
  send: (client: TestAgent, world: World) => Promise<Response>;
  // Checks the effect of an allowed call through the API, as a user sees it.
  verifyAllowed: (
    res: Response,
    world: World,
    actor: Actor,
  ) => Promise<void> | void;
}

const STATUSES: BroadcastStatus[] = ['READY', 'LIVE', 'ENDED'];

const ACTOR_LABEL: Record<Actor, string> = {
  anonymous: '비로그인',
  other: '로그인(타인)',
  owner: '소유자',
};

const EDITED = { title: '고친 제목', description: '고친 설명' };

describe('authorization matrix (PRD §7.5)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let world: World;

  const anonymous = () => request.agent(app.getHttpServer());

  const ids = (body: unknown) => (body as BroadcastView[]).map((b) => b.id);

  // Public list per §7.4: LIVE and ENDED only, READY never.
  const publicIds = (w: World) =>
    w.status === 'READY' ? [w.othersId] : [w.targetId, w.othersId];

  const broadcastRows = () =>
    prisma.broadcast.findMany({ orderBy: { id: 'asc' } });

  const DRIVERS: Record<Action, ActionDriver> = {
    '방송 목록 조회': {
      send: (client) => client.get('/api/broadcasts'),
      verifyAllowed: (res, w) => {
        expect(ids(res.body).sort()).toEqual(publicIds(w).sort());
      },
    },
    '방송 상세 조회': {
      send: (client, w) => client.get(`/api/broadcasts/${w.targetId}`),
      verifyAllowed: (res, w) => {
        expect(res.body).toMatchObject({
          id: w.targetId,
          status: w.status,
          streamer: { id: w.owner.id },
        });
      },
    },
    '방송 생성': {
      send: (client) =>
        client.post('/api/broadcasts').send({ title: '새 방송' }),
      verifyAllowed: async (res, w, actor) => {
        const created = res.body as BroadcastView;
        const creator = actor === 'owner' ? w.owner : w.other;
        expect(created).toMatchObject({
          title: '새 방송',
          status: 'READY',
          streamer: { id: creator.id },
        });
        const mine = await w.as[actor].get('/api/me/broadcasts');
        expect(ids(mine.body)).toContain(created.id);
        const list = await anonymous().get('/api/broadcasts');
        expect(ids(list.body)).not.toContain(created.id);
      },
    },
    '방송 수정': {
      // `status` and `streamerId` ride along to prove a client can neither
      // move the lifecycle nor hand the broadcast to someone else.
      send: (client, w) =>
        client
          .patch(`/api/broadcasts/${w.targetId}`)
          .send({ ...EDITED, status: 'ENDED', streamerId: w.other.id }),
      verifyAllowed: async (res, w) => {
        expect(res.body).toMatchObject({
          ...EDITED,
          status: w.status,
          streamer: { id: w.owner.id },
        });
        const detail = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        expect(detail.body).toMatchObject({ ...EDITED, status: w.status });
        const mine = await w.as.owner.get('/api/me/broadcasts');
        expect(mine.body).toEqual([
          expect.objectContaining({ id: w.targetId, ...EDITED }),
        ]);
        const list = await anonymous().get('/api/broadcasts');
        const listed = (list.body as BroadcastView[]).find(
          (b) => b.id === w.targetId,
        );
        expect(listed?.title).toBe(
          w.status === 'READY' ? undefined : EDITED.title,
        );
      },
    },
    '방송 삭제': {
      send: (client, w) => client.delete(`/api/broadcasts/${w.targetId}`),
      verifyAllowed: async (_res, w) => {
        const detail = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        expect(detail.status).toBe(404);
        const mine = await w.as.owner.get('/api/me/broadcasts');
        expect(mine.body).toEqual([]);
        const list = await anonymous().get('/api/broadcasts');
        expect(ids(list.body)).toEqual([w.othersId]);
      },
    },
    '송출 토큰 발급': {
      send: (client, w) =>
        client.post(`/api/broadcasts/${w.targetId}/publish-token`),
      // Issuing a token changes no state: the broadcast goes LIVE only when
      // OME admits the connection.
      verifyAllowed: async (res, w) => {
        expect((res.body as { publishUrl: string }).publishUrl).toMatch(
          new RegExp(`^/app/${w.targetId}\\?.*&token=`),
        );
        const detail = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        expect(detail.body).toMatchObject({ status: w.status });
      },
    },
    '내 방송 조회': {
      send: (client) => client.get('/api/me/broadcasts'),
      verifyAllowed: (res, w, actor) => {
        expect(ids(res.body)).toEqual(
          actor === 'owner' ? [w.targetId] : [w.othersId],
        );
      },
    },
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
    const owner = await signUpAndLogIn(app, { nickname: '소유자' });
    const other = await signUpAndLogIn(app, { nickname: '타인' });
    world = {
      status: 'READY',
      owner: owner.user,
      other: other.user,
      targetId: '',
      othersId: '',
      as: { anonymous: anonymous(), other: other.agent, owner: owner.agent },
    };
  });

  afterAll(async () => {
    await app.close();
  });

  // Written directly so every status is one insert away, without driving the
  // publish flow.
  async function seed(status: BroadcastStatus): Promise<void> {
    await prisma.broadcast.deleteMany();
    const now = new Date();
    const target = await prisma.broadcast.create({
      data: {
        streamerId: world.owner.id,
        title: '원래 제목',
        description: '원래 설명',
        status,
        startedAt: status === 'READY' ? null : now,
        endedAt: status === 'ENDED' ? now : null,
      },
    });
    const others = await prisma.broadcast.create({
      data: {
        streamerId: world.other.id,
        title: '타인의 방송',
        status: 'ENDED',
        startedAt: now,
        endedAt: now,
      },
    });
    world = { ...world, status, targetId: target.id, othersId: others.id };
  }

  describe.each(STATUSES)('owner’s broadcast is %s', (status) => {
    beforeEach(async () => {
      await seed(status);
    });

    const cases = (Object.keys(MATRIX) as Action[]).flatMap((action) =>
      ACTORS.flatMap((actor, column) => {
        const cell = MATRIX[action][column] as Cell | '—';
        if (cell === '—') return [];
        const expected = typeof cell === 'number' ? cell : cell[status];
        return [{ action, actor, who: ACTOR_LABEL[actor], expected }];
      }),
    );

    it.each(cases)(
      '$action | $who → $expected',
      async ({ action, actor, expected }) => {
        const driver = DRIVERS[action];
        const before = await broadcastRows();
        const res = await driver.send(world.as[actor], world);
        expect(res.status, JSON.stringify(res.body)).toBe(expected);
        if (expected >= 400) {
          expect(await broadcastRows()).toEqual(before);
        } else {
          await driver.verifyAllowed(res, world, actor);
        }
      },
    );
  });

  // The guard checks login before ownership, and ownership before the body.
  describe('check order', () => {
    const unknownId = '00000000-0000-4000-8000-000000000000';

    beforeEach(async () => {
      await seed('READY');
    });

    it.each([
      ['PATCH', unknownId],
      ['DELETE', unknownId],
      ['PATCH', 'not-a-uuid'],
      ['DELETE', 'not-a-uuid'],
    ])(
      '%s on a missing broadcast %s is 401 when anonymous and 404 when logged in',
      async (method, id) => {
        const send = (client: TestAgent) =>
          method === 'PATCH'
            ? client.patch(`/api/broadcasts/${id}`).send(EDITED)
            : client.delete(`/api/broadcasts/${id}`);
        expect((await send(world.as.anonymous)).status).toBe(401);
        expect((await send(world.as.other)).status).toBe(404);
      },
    );

    it('rejects a non-owner before looking at the body', async () => {
      const bad = { title: '' };
      const url = `/api/broadcasts/${world.targetId}`;
      expect((await world.as.anonymous.patch(url).send(bad)).status).toBe(401);
      expect((await world.as.other.patch(url).send(bad)).status).toBe(403);
      expect((await world.as.owner.patch(url).send(bad)).status).toBe(400);
    });

    it('treats an owner who logged out as anonymous', async () => {
      const { agent } = await signUpAndLogIn(app);
      const own = await agent
        .post('/api/broadcasts')
        .send({ title: '내 방송' });
      expect((await agent.post('/api/auth/logout')).status).toBeLessThan(300);
      const before = await broadcastRows();
      const url = `/api/broadcasts/${(own.body as BroadcastView).id}`;
      expect((await agent.patch(url).send(EDITED)).status).toBe(401);
      expect((await agent.delete(url)).status).toBe(401);
      expect(await broadcastRows()).toEqual(before);
    });
  });

  // §7.5 rows whose API does not exist yet. Each becomes a matrix row when
  // its issue lands, so a missing row stays visible here.
  describe('rows not built yet', () => {
    it.todo('방송 종료: 비로그인 401, 타인 403, 소유자 허용 (#11)');
    // The rest of the webhook rules are in publish.e2e.spec.ts.
    it.todo(
      'OME 송출 연결 Webhook 판정: 소유자 LIVE 유예 중 재접속 허용 (#12)',
    );
    it.todo('LIVE 방송 삭제: 소유자는 종료 처리 후 삭제 (#11, 지금은 409)');
    it.todo('스트림 키 조회·재발급: 비로그인 401, 타인 403, 소유자 허용 (P3)');
    it.todo('댓글 작성: 비로그인 401, 타인·소유자 허용 (#18)');
    it.todo('댓글 수정·삭제: 비로그인 401, 작성자만 허용 (#18)');
    it.todo('후원: 비로그인 401, 타인 허용, 자기 방송 후원 거절 (#20)');
  });
});
