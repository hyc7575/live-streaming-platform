import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Response } from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BroadcastView } from '../src/broadcasts/broadcasts.service.js';
import type { ChatMessageView } from '../src/chat/chat.service.js';
import type { CommentView } from '../src/comments/comments.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { DonationOrder } from '../src/donations/donations.service.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import type { AuthUser } from '../src/auth/auth-user.js';
import type { AdmissionRejection } from '../src/publish/admission.js';
import { seedGames } from '../src/games/seed-games.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  thumbnailsDirOf,
  type TestUser,
} from './support/app.js';
import { fakeClockOf } from './support/fake-clock.js';
import { fakeOmeApiOf, type FakeOmeApi } from './support/fake-ome-api.js';
import {
  fakeTossPaymentsOf,
  type FakeTossPayments,
} from './support/fake-toss-payments.js';
import { mintedToken, openPublish } from './support/webhook.js';

// PRD §7.5 인가 매트릭스(KR3)를 표 하나로 돌린다. 지금 API에 있는 행은
// 모두 호출자마다, 모든 상태의 소유자 방송을 대상으로 실행한다. 칸 값은
// 기대하는 HTTP 상태다. 거부된 칸은 데이터베이스가 바뀌지 않았고 OME와
// Toss에도 아무것도 묻지 않았음을 함께 증명한다. 허용된 칸은 그 효과를
// 사용자가 보는 방식대로 API를 거쳐
// 증명한다.

type Actor = 'anonymous' | 'other' | 'owner';
type Cell = number | Record<BroadcastStatus, number>;

interface World {
  status: BroadcastStatus;
  owner: TestUser;
  other: TestUser;
  // 리소스 행이 대상으로 삼는 소유자의 방송.
  targetId: string;
  targetEndedAt: Date | null;
  // 소유자가 대상 방송에 쓴 댓글. 그래서 댓글 행에서는
  // 소유자 열이 댓글 작성자이고 'other'는 그 외 모든 사람이다.
  targetCommentId: string;
  // 마찬가지로 소유자가 대상 방송에 보낸 채팅 메시지.
  targetChatId: string;
  // 타인이 대상 방송에 넣은 미결제 주문. 그래서 '후원 승인'에서는
  // 소유자 열이 후원자가 아니라 스트리머다. 남의 주문이다.
  pendingOrder: { paymentKey: string; orderId: string; amount: number };
  // 타인의 ENDED 방송. 목록이 빼야 할 대상이 있도록 둔다.
  othersId: string;
  as: Record<Actor, TestAgent>;
}

// PRD 표와 같은 열과 이름을 쓴다. '—'는 PRD에 칸이 없다는 뜻이다.
// 방송을 만들기 전에는 아무도 그 방송의 소유자가 아니다.
const ACTORS: Actor[] = ['anonymous', 'other', 'owner'];

// prettier-ignore
const MATRIX = {
  //                 비로그인  로그인(타인)  소유자
  '방송 목록 조회': [200,      200,          200],
  '방송 상세 조회': [200,      200,          200],
  '방송 생성':      [401,      201,          '—'],
  '방송 수정':      [401,      403,          200],
  '방송 삭제':      [401,      403,          204],
  '방송 종료':      [401,      403,          { READY: 409, LIVE: 200, ENDED: 200 }],
  '내 방송 조회':   [401,      200,          200],
  '송출 토큰 발급': [401,      403,          { READY: 201, LIVE: 201, ENDED: 409 }],
  '송출 토큰 발급 (OBS)': [401, 403,         { READY: 201, LIVE: 201, ENDED: 409 }],
  '썸네일 업로드':  [401,      403,          { READY: 409, LIVE: 204, ENDED: 409 }],
  '채팅 조회':      [200,      200,          200],
  '채팅 작성':      [401,      { READY: 201, LIVE: 201, ENDED: 409 }, { READY: 201, LIVE: 201, ENDED: 409 }],
  '채팅 삭제':      [404,      404,          404],
  '댓글 목록 조회': [200,      200,          200],
  '댓글 작성':      [401,      { READY: 409, LIVE: 409, ENDED: 201 }, { READY: 409, LIVE: 409, ENDED: 201 }],
  '댓글 수정':      [401,      403,          200],
  '댓글 삭제':      [401,      403,          204],
  '후원':           [401,      { READY: 409, LIVE: 201, ENDED: 409 }, 403],
  '라임 후원':      [401,      { READY: 409, LIVE: 201, ENDED: 409 }, 403],
  '후원 승인':      [401,      200,          403],
  '후원 내역 조회': [200,      200,          200],
  '팔로우':         [401,      204,          400],
  '언팔로우':       [401,      204,          400],
  '내 팔로우 목록': [401,      200,          '—'],
  '대기 이미지 등록': [401,    200,          200],
  '대기 이미지 삭제': [401,    204,          204],
  '라임 내역 조회': [401,      200,          200],
  '보낸 후원 조회': [401,      200,          200],
  '받은 후원 조회': [401,      200,          200],
  '팔로워 조회':    [401,      200,          200],
  '채널 조회':      [200,      200,          200],
  '프로필 수정':    [401,      200,          200],
  '프로필 이미지 등록': [401,  200,          200],
  '프로필 이미지 삭제': [401,  204,          204],
  '채널 방송 목록': [200,      200,          200],
  '게임 검색':      [401,      200,          200],
  '방송 검색':      [200,      200,          200],
} satisfies Record<string, [Cell, Cell, Cell | '—']>;
// §7.4에는 READY → ENDED 전이가 없어서, READY 방송은 종료할 수 없고
// 삭제만 할 수 있다. ENDED 방송은 다시 LIVE가 되지 않으므로 송출
// 토큰을 받지 않는다. 썸네일은 라이브 스트림의 한 프레임이라 LIVE 방송만
// 받는다. 채팅과 댓글은 상세 페이지가 열리는 곳이면 어디서나 읽지만,
// 쓰기는 상태를 따른다. 채팅은 방송이 끝나기 전(READY와 LIVE),
// 댓글은 끝난 뒤(ENDED)에 쓴다. 채팅에는 누구에게도 수정·삭제 경로가 없고
// 작성자도 마찬가지라서, 그 행은 모든 칸이 404다. 후원 주문은
// LIVE일 때만 받고 스트리머는 할 수 없다. 스트리머의 403은 상태보다 먼저 나온다.
// 승인은 상태를 보지 않는다. 그때 후원자는 이미 결제했다. 라임
// 후원은 카드 주문과 같은 대상 규칙을 따른다(§7.5 "직접결제·라임
// 공통"). 두 사용자 모두 라임이 있어서 잔액 때문에 달라지는 칸은 없다.
// PRD의 "팔로우·언팔로우" 한 행은 여기서 요청마다 하나씩 두 행이다.
// 소유자 열은 소유자가 자기 자신을 팔로우하는 경우이고, "내 팔로우 목록"에는
// 그런 칸이 없다. 언제나 호출자 자신의 목록이기 때문이다. 기본 대기 이미지는
// 호출자 자신의 채널 것이라서 'other'와 소유자는 각자 자기 것에 작용하고
// 방송 상태와 상관없다. PRD의 "라임
// 내역·보낸·받은 후원·팔로워 조회" 한 행은 여기서 네 행이고, 대기 화면
// 이미지처럼 호출자마다 자기 것만 읽는다. 타인은 소유자에게 후원했고
// 소유자는 타인을 팔로우하므로, 목록은 호출자마다 다르다.

type Action = keyof typeof MATRIX;

// §7.5의 "OME 송출 연결 (Webhook 판정)" 행. OME는 쿠키 없이
// 송출 URL의 토큰만 보낸다. 그래서 호출자는 토큰으로 구분한다.
type PublishState =
  'READY' | 'LIVE 연결 중' | 'LIVE 유예 중' | 'LIVE 유예 초과' | 'ENDED';
type WebhookCell = '허용' | AdmissionRejection;

// prettier-ignore
const WEBHOOK_MATRIX: Record<PublishState, [WebhookCell, WebhookCell, WebhookCell]> = {
  //                 비로그인         로그인(타인)     소유자
  'READY':          ['missing token', 'invalid token', '허용'],
  'LIVE 연결 중':   ['missing token', 'invalid token', 'broadcast already live'],
  'LIVE 유예 중':   ['missing token', 'invalid token', '허용'],
  'LIVE 유예 초과': ['missing token', 'invalid token', 'broadcast ended'],
  'ENDED':          ['missing token', 'invalid token', 'broadcast ended'],
};

const DROPPED_AGO_MS: Partial<Record<PublishState, number>> = {
  'LIVE 유예 중': 10_000,
  'LIVE 유예 초과': 30_000,
};

interface ActionDriver {
  send: (client: TestAgent, world: World) => Promise<Response>;
  // 허용된 호출의 효과를 사용자가 보는 방식대로 API로 확인한다.
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

// 목록 게임의 이름은 서버가 채운다. 그래서 보낸 gameName과 보이는 이름이 다르다.
const EDITED = {
  title: '고친 제목',
  description: '고친 설명',
  category: 'GAME',
  gameQid: 'Q223341',
  gameName: '아무거나',
};
const EDITED_VIEW = {
  title: '고친 제목',
  description: '고친 설명',
  category: 'GAME',
  game: { qid: 'Q223341', name: '리그 오브 레전드' },
};
const ORIGINAL_COMMENT = '원래 댓글';
const ORIGINAL_CHAT = '원래 채팅';
const PAID_AMOUNT = 1000;
// seed()가 사용자마다 충전해 두는 금액. 그래서 라임 후원은
// 잔액이 아니라 대상 때문에만 실패할 수 있다.
const SEEDED_LIME = 10_000;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('authorization matrix (PRD §7.5)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ome: FakeOmeApi;
  let toss: FakeTossPayments;
  let world: World;

  const anonymous = () => request.agent(app.getHttpServer());

  const ids = (body: unknown) => (body as BroadcastView[]).map((b) => b.id);

  // §7.4에 따른 공개 목록. 시드한 READY 대상은 만든 지 몇 분밖에 안 돼
  // READY 방송이 목록에 남는 하루 안에 있으므로, 모든 상태가 목록에 나온다.
  const publicIds = (w: World) => [w.targetId, w.othersId];

  const broadcastRows = () =>
    prisma.broadcast.findMany({ orderBy: { id: 'asc' } });

  // 거부된 호출이 건드리지 말아야 하는 것.
  const rows = async () => ({
    broadcasts: await broadcastRows(),
    comments: await prisma.comment.findMany({ orderBy: { id: 'asc' } }),
    chatMessages: await prisma.chatMessage.findMany({
      orderBy: { id: 'asc' },
    }),
    donations: await prisma.donation.findMany({ orderBy: { id: 'asc' } }),
    follows: await prisma.follow.findMany({
      orderBy: [{ followerId: 'asc' }, { streamerId: 'asc' }],
    }),
    standbyImages: await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, standbyImageExt: true, standbyImageUpdatedAt: true },
    }),
    profiles: await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        nickname: true,
        bio: true,
        avatarExt: true,
        avatarUpdatedAt: true,
      },
    }),
    lime: await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, limeBalance: true },
    }),
    limeLedger: await prisma.limeLedger.findMany({ orderBy: { id: 'asc' } }),
  });

  const comments = async (w: World) =>
    (await anonymous().get(`/api/broadcasts/${w.targetId}/comments`))
      .body as CommentView[];

  const chat = async (w: World) =>
    (await anonymous().get(`/api/broadcasts/${w.targetId}/chat`))
      .body as ChatMessageView[];

  const donations = async (w: World) =>
    (await anonymous().get(`/api/broadcasts/${w.targetId}/donations`)).body as {
      total: number;
      count: number;
      donations: { id: string }[];
    };

  const follows = async (w: World, actor: 'owner' | 'other') =>
    (await w.as[actor].get('/api/me/follows')).body as unknown;

  // 타인이 소유자를 팔로우한 뒤의 타인 목록. 패널이 읽는 그대로다.
  const followingOwner = (w: World) => [
    {
      id: w.owner.id,
      nickname: w.owner.nickname,
      live:
        w.status === 'LIVE'
          ? {
              broadcastId: w.targetId,
              title: '원래 제목',
              startedAt: expect.any(String) as string,
            }
          : null,
    },
  ];

  const standbyUrl = async (w: World, actor: 'owner' | 'other') =>
    ((await w.as[actor].get('/api/auth/me')).body as AuthUser).standbyImageUrl;

  const uploadStandby = (client: TestAgent) =>
    client.put('/api/me/standby-image').attach('image', PNG, 'a.png');

  // 소유자가 시드해 둔 타인 팔로우가 소유자에게 보이는 모습.
  const ownerFollowsOther = (w: World) => [
    { id: w.other.id, nickname: w.other.nickname, live: null },
  ];

  const publishTokenDriver = (body: object | undefined): ActionDriver => ({
    send: (client, w) => {
      const req = client.post(`/api/broadcasts/${w.targetId}/publish-token`);
      return body === undefined ? req : req.send(body);
    },
    // 토큰 발급은 상태를 바꾸지 않는다. 방송은 OME가 연결을
    // 승인할 때만 LIVE가 된다.
    verifyAllowed: async (res, w) => {
      expect((res.body as { publishUrl: string }).publishUrl).toMatch(
        new RegExp(`^/app/${w.targetId}\\?.*&token=`),
      );
      const detail = await anonymous().get(`/api/broadcasts/${w.targetId}`);
      expect(detail.body).toMatchObject({ status: w.status });
    },
  });

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
        expect(ids(list.body)).toContain(created.id);
      },
    },
    '방송 수정': {
      // `status`와 `streamerId`를 함께 실어 보내, 클라이언트가 수명 주기를
      // 옮기지도, 방송을 남에게 넘기지도 못함을 증명한다.
      send: (client, w) =>
        client
          .patch(`/api/broadcasts/${w.targetId}`)
          .send({ ...EDITED, status: 'ENDED', streamerId: w.other.id }),
      verifyAllowed: async (res, w) => {
        expect(res.body).toMatchObject({
          ...EDITED_VIEW,
          status: w.status,
          streamer: { id: w.owner.id },
        });
        const detail = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        expect(detail.body).toMatchObject({ ...EDITED_VIEW, status: w.status });
        const mine = await w.as.owner.get('/api/me/broadcasts');
        expect(mine.body).toEqual([
          expect.objectContaining({ id: w.targetId, ...EDITED_VIEW }),
        ]);
        const list = await anonymous().get('/api/broadcasts');
        const listed = (list.body as BroadcastView[]).find(
          (b) => b.id === w.targetId,
        );
        expect(listed?.title).toBe(EDITED.title);
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
        expect(ome.calls).toEqual(
          w.status === 'READY'
            ? []
            : [{ broadcastId: w.targetId, statusAtCall: 'ENDED' }],
        );
      },
    },
    '방송 종료': {
      send: (client, w) => client.post(`/api/broadcasts/${w.targetId}/end`),
      verifyAllowed: async (res, w) => {
        const detail = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        expect(detail.body).toMatchObject({ status: 'ENDED' });
        expect(res.body).toEqual(detail.body);
        const endedAt = (detail.body as { endedAt: string }).endedAt;
        if (w.targetEndedAt) {
          expect(endedAt).toBe(w.targetEndedAt.toISOString());
        } else {
          expect(endedAt).toEqual(expect.any(String));
        }
        expect(ome.calls).toEqual([
          { broadcastId: w.targetId, statusAtCall: 'ENDED' },
        ]);
      },
    },
    '송출 토큰 발급': publishTokenDriver(undefined),
    '송출 토큰 발급 (OBS)': publishTokenDriver({ client: 'obs' }),
    '썸네일 업로드': {
      send: (client, w) =>
        client
          .put(`/api/broadcasts/${w.targetId}/thumbnail`)
          .attach('image', JPEG, 'a.jpg'),
      verifyAllowed: async (_res, w) => {
        const detail = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        const { thumbnailUrl } = detail.body as BroadcastView;
        expect(thumbnailUrl).toMatch(
          new RegExp(`^/thumbnails/${w.targetId}/live\\.jpg\\?v=\\d+$`),
        );
        const file = join(thumbnailsDirOf(app), w.targetId, 'live.jpg');
        expect(await readFile(file)).toEqual(JPEG);
      },
    },
    '채팅 조회': {
      send: (client, w) => client.get(`/api/broadcasts/${w.targetId}/chat`),
      verifyAllowed: (res, w) => {
        expect(res.body).toEqual([
          expect.objectContaining({
            id: w.targetChatId,
            body: ORIGINAL_CHAT,
            author: { id: w.owner.id, nickname: w.owner.nickname },
          }),
        ]);
      },
    },
    '채팅 작성': {
      // `authorId`를 함께 실어 보내, 클라이언트가 남의
      // 이름으로 말할 수 없음을 증명한다.
      send: (client, w) =>
        client
          .post(`/api/broadcasts/${w.targetId}/chat`)
          .send({ body: '새 채팅', authorId: w.owner.id }),
      verifyAllowed: async (res, w, actor) => {
        const author = actor === 'owner' ? w.owner : w.other;
        expect(res.body).toMatchObject({
          body: '새 채팅',
          author: { id: author.id, nickname: author.nickname },
        });
        expect((await chat(w)).map((m) => m.id)).toEqual([
          w.targetChatId,
          (res.body as ChatMessageView).id,
        ]);
      },
    },
    '채팅 삭제': {
      send: (client, w) => client.delete(`/api/chat/${w.targetChatId}`),
      verifyAllowed: () => {
        throw new Error('No caller may delete a chat message');
      },
    },
    '댓글 목록 조회': {
      send: (client, w) => client.get(`/api/broadcasts/${w.targetId}/comments`),
      verifyAllowed: (res, w) => {
        expect(res.body).toEqual([
          expect.objectContaining({
            id: w.targetCommentId,
            body: ORIGINAL_COMMENT,
            author: { id: w.owner.id, nickname: w.owner.nickname },
          }),
        ]);
      },
    },
    '댓글 작성': {
      send: (client, w) =>
        client
          .post(`/api/broadcasts/${w.targetId}/comments`)
          .send({ body: '새 댓글' }),
      verifyAllowed: async (res, w, actor) => {
        const author = actor === 'owner' ? w.owner : w.other;
        expect(res.body).toMatchObject({
          body: '새 댓글',
          author: { id: author.id, nickname: author.nickname },
        });
        expect((await comments(w)).map((c) => c.id)).toEqual([
          w.targetCommentId,
          (res.body as CommentView).id,
        ]);
      },
    },
    '댓글 수정': {
      // `authorId`를 함께 실어 보내, 클라이언트가 댓글을
      // 남에게 넘길 수 없음을 증명한다.
      send: (client, w) =>
        client
          .patch(`/api/comments/${w.targetCommentId}`)
          .send({ body: '고친 댓글', authorId: w.other.id }),
      verifyAllowed: async (res, w) => {
        expect(res.body).toMatchObject({
          id: w.targetCommentId,
          body: '고친 댓글',
          author: { id: w.owner.id },
        });
        expect(await comments(w)).toEqual([res.body]);
      },
    },
    '댓글 삭제': {
      send: (client, w) => client.delete(`/api/comments/${w.targetCommentId}`),
      verifyAllowed: async (_res, w) => {
        expect(await comments(w)).toEqual([]);
      },
    },
    후원: {
      // `donorId`를 함께 실어 보내, 클라이언트가 남의
      // 이름으로 주문할 수 없음을 증명한다.
      send: (client, w) =>
        client
          .post(`/api/broadcasts/${w.targetId}/donations`)
          .send({ amount: 3000, donorId: w.owner.id }),
      verifyAllowed: async (res, w) => {
        const placed = res.body as DonationOrder;
        expect(placed).toMatchObject({ amount: 3000, customerKey: w.other.id });
        expect(await donations(w)).toMatchObject({ total: PAID_AMOUNT });
        const paid = await w.as.other.post('/api/donations/confirm').send({
          paymentKey: 'pay_new',
          orderId: placed.orderId,
          amount: 3000,
        });
        expect(paid.status).toBe(200);
        expect(await donations(w)).toMatchObject({
          total: PAID_AMOUNT + 3000,
          count: 2,
        });
      },
    },
    '라임 후원': {
      // `donorId`를 함께 실어 보내, 클라이언트가 남의
      // 이름이나 남의 잔액으로 후원할 수 없음을 증명한다.
      send: (client, w) =>
        client.post(`/api/broadcasts/${w.targetId}/lime-donations`).send({
          amount: 3000,
          orderId: '7d3c1f9e-2b4a-4c8d-9e1f-0a2b3c4d5e6f',
          donorId: w.owner.id,
        }),
      verifyAllowed: async (res, w) => {
        expect(res.body).toMatchObject({
          method: 'LIME',
          amount: 3000,
          donor: { id: w.other.id, nickname: w.other.nickname },
          broadcastId: w.targetId,
        });
        expect(await donations(w)).toMatchObject({
          total: PAID_AMOUNT + 3000,
          count: 2,
        });
        const lime = async (actor: 'owner' | 'other') =>
          ((await w.as[actor].get('/api/me/lime')).body as { balance: number })
            .balance;
        expect(await lime('other')).toBe(SEEDED_LIME - 3000);
        expect(await lime('owner')).toBe(SEEDED_LIME);
      },
    },
    '후원 승인': {
      send: (client, w) =>
        client.post('/api/donations/confirm').send(w.pendingOrder),
      verifyAllowed: async (res, w) => {
        expect(res.body).toMatchObject({
          amount: w.pendingOrder.amount,
          donor: { id: w.other.id, nickname: w.other.nickname },
          broadcastId: w.targetId,
        });
        expect(toss.calls).toEqual([w.pendingOrder]);
        expect(await donations(w)).toMatchObject({
          total: PAID_AMOUNT + w.pendingOrder.amount,
          count: 2,
        });
      },
    },
    '후원 내역 조회': {
      send: (client, w) =>
        client.get(`/api/broadcasts/${w.targetId}/donations`),
      verifyAllowed: (res, w) => {
        expect(res.body).toEqual({
          total: PAID_AMOUNT,
          count: 1,
          donations: [
            expect.objectContaining({
              amount: PAID_AMOUNT,
              donor: { id: w.other.id, nickname: w.other.nickname },
            }),
          ],
        });
      },
    },
    팔로우: {
      send: (client, w) => client.put(`/api/streamers/${w.owner.id}/follow`),
      verifyAllowed: async (_res, w) => {
        expect(await follows(w, 'other')).toEqual(followingOwner(w));
        expect(await follows(w, 'owner')).toEqual(ownerFollowsOther(w));
      },
    },
    언팔로우: {
      send: (client, w) => client.delete(`/api/streamers/${w.owner.id}/follow`),
      // 팔로우한 것이 없으므로 호출만으로는 변화가 보이지 않는다. 먼저 API로
      // 팔로우해 두면 삭제가 실제 팔로우를 지운다는 것이 증명된다.
      verifyAllowed: async (_res, w) => {
        expect(await follows(w, 'other')).toEqual([]);
        const url = `/api/streamers/${w.owner.id}/follow`;
        expect((await w.as.other.put(url)).status).toBe(204);
        expect(await follows(w, 'other')).toEqual(followingOwner(w));
        expect((await w.as.other.delete(url)).status).toBe(204);
        expect(await follows(w, 'other')).toEqual([]);
        expect(await follows(w, 'owner')).toEqual(ownerFollowsOther(w));
      },
    },
    '내 팔로우 목록': {
      send: (client) => client.get('/api/me/follows'),
      verifyAllowed: (res) => {
        expect(res.body).toEqual([]);
      },
    },
    '대기 이미지 등록': {
      send: uploadStandby,
      verifyAllowed: async (res, w, actor) => {
        const [self, peer] =
          actor === 'owner'
            ? (['owner', 'other'] as const)
            : (['other', 'owner'] as const);
        const caller = w[self];
        const url = (res.body as AuthUser).standbyImageUrl;
        expect(url).toMatch(
          new RegExp(`^/thumbnails/users/${caller.id}/standby\\.png\\?v=\\d+$`),
        );
        expect(await standbyUrl(w, self)).toBe(url);
        expect(await standbyUrl(w, peer)).toBeNull();
        const target = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        expect((target.body as BroadcastView).standbyImageUrl).toBe(
          actor === 'owner' ? url : null,
        );
        const file = join(
          thumbnailsDirOf(app),
          'users',
          caller.id,
          'standby.png',
        );
        expect(await readFile(file)).toEqual(PNG);
      },
    },
    '대기 이미지 삭제': {
      send: (client) => client.delete('/api/me/standby-image'),
      // 올린 것이 없으므로 호출만으로는 변화가 보이지 않는다. 먼저 API로
      // 올려 두면 삭제가 실제 이미지를 지운다는 것이 증명된다.
      verifyAllowed: async (_res, w, actor) => {
        const self = actor === 'owner' ? 'owner' : 'other';
        expect(await standbyUrl(w, self)).toBeNull();
        expect((await uploadStandby(w.as[self])).status).toBe(200);
        expect(await standbyUrl(w, self)).not.toBeNull();
        const del = await w.as[self].delete('/api/me/standby-image');
        expect(del.status).toBe(204);
        expect(await standbyUrl(w, self)).toBeNull();
        const target = await anonymous().get(`/api/broadcasts/${w.targetId}`);
        expect((target.body as BroadcastView).standbyImageUrl).toBeNull();
      },
    },
    '라임 내역 조회': {
      send: (client) => client.get('/api/me/lime/ledger'),
      verifyAllowed: async (res, w, actor) => {
        const self = actor === 'owner' ? w.owner : w.other;
        const own = await prisma.limeLedger.findMany({
          where: { userId: self.id },
          select: { id: true },
        });
        expect(res.body).toEqual([
          expect.objectContaining({
            id: own[0]?.id,
            kind: 'CHARGE',
            balanceAfter: SEEDED_LIME,
            donation: null,
          }),
        ]);
      },
    },
    '보낸 후원 조회': {
      send: (client) => client.get('/api/me/donations'),
      verifyAllowed: (res, w, actor) => {
        expect(res.body).toEqual(
          actor === 'owner'
            ? { total: 0, count: 0, donations: [] }
            : {
                total: PAID_AMOUNT,
                count: 1,
                donations: [
                  expect.objectContaining({
                    amount: PAID_AMOUNT,
                    broadcast: { id: w.targetId, title: '원래 제목' },
                    recipient: { id: w.owner.id, nickname: w.owner.nickname },
                  }),
                ],
              },
        );
      },
    },
    '받은 후원 조회': {
      send: (client) => client.get('/api/me/received-donations'),
      verifyAllowed: (res, w, actor) => {
        expect(res.body).toEqual(
          actor === 'other'
            ? { total: 0, count: 0, donations: [] }
            : {
                total: PAID_AMOUNT,
                count: 1,
                donations: [
                  expect.objectContaining({
                    amount: PAID_AMOUNT,
                    donor: { id: w.other.id, nickname: w.other.nickname },
                    broadcast: { id: w.targetId, title: '원래 제목' },
                  }),
                ],
              },
        );
      },
    },
    '팔로워 조회': {
      send: (client) => client.get('/api/me/followers'),
      verifyAllowed: (res, w, actor) => {
        expect(res.body).toEqual(
          actor === 'owner'
            ? { count: 0, followers: [] }
            : {
                count: 1,
                followers: [
                  {
                    id: w.owner.id,
                    nickname: w.owner.nickname,
                    followedAt: expect.any(String) as string,
                  },
                ],
              },
        );
      },
    },
    '프로필 수정': {
      send: (client) => client.patch('/api/me/profile').send({ bio: '소개' }),
      verifyAllowed: async (res, w, actor) => {
        const [self, peer] =
          actor === 'owner' ? [w.owner, w.other] : [w.other, w.owner];
        expect(res.body).toMatchObject({ id: self.id, bio: '소개' });
        const shown = async (id: string) =>
          (
            (await anonymous().get(`/api/streamers/${id}`)).body as {
              bio: string;
            }
          ).bio;
        expect(await shown(self.id)).toBe('소개');
        expect(await shown(peer.id)).toBe('');
      },
    },
    '프로필 이미지 등록': {
      send: (client) =>
        client.put('/api/me/avatar').attach('image', PNG, 'a.png'),
      verifyAllowed: (res, w, actor) => {
        const self = actor === 'owner' ? w.owner : w.other;
        expect((res.body as AuthUser).avatarUrl).toMatch(
          new RegExp(`^/thumbnails/users/${self.id}/avatar\\.png\\?v=\\d+$`),
        );
      },
    },
    '프로필 이미지 삭제': {
      send: (client) => client.delete('/api/me/avatar'),
      verifyAllowed: async (_res, w, actor) => {
        const self = actor === 'owner' ? 'owner' : 'other';
        const avatar = async () =>
          ((await w.as[self].get('/api/auth/me')).body as AuthUser).avatarUrl;
        expect(await avatar()).toBeNull();
      },
    },
    '채널 조회': {
      send: (client, w) => client.get(`/api/streamers/${w.owner.id}`),
      verifyAllowed: (res, w) => {
        expect(res.body).toEqual({
          id: w.owner.id,
          nickname: w.owner.nickname,
          bio: '',
          avatarUrl: null,
          followerCount: 0,
          liveBroadcastId: w.status === 'LIVE' ? w.targetId : null,
        });
      },
    },
    '채널 방송 목록': {
      send: (client, w) =>
        client.get(`/api/streamers/${w.owner.id}/broadcasts`),
      verifyAllowed: (res, w) => {
        expect(ids(res.body)).toEqual([w.targetId]);
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
    '방송 검색': {
      send: (client) => client.get('/api/search').query({ q: '원래' }),
      verifyAllowed: (res, w) => {
        const body = res.body as {
          broadcasts: { id: string }[];
          past: { id: string }[];
        };
        expect(ids([...body.broadcasts, ...body.past])).toEqual([w.targetId]);
      },
    },
    '게임 검색': {
      send: (client) => client.get('/api/games').query({ q: '롤' }),
      verifyAllowed: (res) => {
        expect(res.body).toEqual([
          {
            qid: 'Q223341',
            name: '리그 오브 레전드',
            nameEn: 'League of Legends',
          },
        ]);
      },
    },
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ome = fakeOmeApiOf(app);
    toss = fakeTossPaymentsOf(app);
    await resetDatabase(app);
    await seedGames(prisma, [
      {
        qid: 'Q223341',
        nameKo: '리그 오브 레전드',
        nameEn: 'League of Legends',
        aliasesKo: ['롤'],
      },
    ]);
    const owner = await signUpAndLogIn(app, { nickname: '소유자' });
    const other = await signUpAndLogIn(app, { nickname: '타인' });
    world = {
      status: 'READY',
      owner: owner.user,
      other: other.user,
      targetId: '',
      targetEndedAt: null,
      targetCommentId: '',
      targetChatId: '',
      pendingOrder: { paymentKey: '', orderId: '', amount: 0 },
      othersId: '',
      as: { anonymous: anonymous(), other: other.agent, owner: owner.agent },
    };
  });

  afterAll(async () => {
    await app.close();
  });

  // 직접 써 넣어서, 송출 흐름을 거치지 않고도 어떤 상태든
  // insert 한 번으로 만든다.
  async function seed(status: BroadcastStatus): Promise<void> {
    // 방송을 지워도 더는 후원이 지워지지 않으므로(#114),
    // 후원을 따로 지운다.
    await prisma.donation.deleteMany();
    await prisma.broadcast.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.user.updateMany({
      data: {
        standbyImageExt: null,
        standbyImageUpdatedAt: null,
        avatarExt: null,
        avatarUpdatedAt: null,
        bio: '',
      },
    });
    await prisma.limeLedger.deleteMany();
    for (const user of [world.owner, world.other]) {
      await prisma.user.update({
        where: { id: user.id },
        data: { limeBalance: SEEDED_LIME },
      });
      await prisma.limeLedger.create({
        data: {
          userId: user.id,
          delta: SEEDED_LIME,
          kind: 'CHARGE',
          refId: randomUUID(),
          balanceAfter: SEEDED_LIME,
        },
      });
    }
    // 타인의 팔로우 목록은 이것을 빼야 한다.
    await prisma.follow.create({
      data: { followerId: world.owner.id, streamerId: world.other.id },
    });
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
    const comment = await prisma.comment.create({
      data: {
        broadcastId: target.id,
        authorId: world.owner.id,
        body: ORIGINAL_COMMENT,
      },
    });
    const chatMessage = await prisma.chatMessage.create({
      data: {
        broadcastId: target.id,
        authorId: world.owner.id,
        body: ORIGINAL_CHAT,
      },
    });
    await prisma.donation.create({
      data: {
        orderId: 'don_matrix_paid',
        broadcastId: target.id,
        recipientId: world.owner.id,
        donorId: world.other.id,
        amount: PAID_AMOUNT,
        status: 'PAID',
        paymentKey: 'pay_matrix_paid',
        approvedAt: now,
      },
    });
    const pending = await prisma.donation.create({
      data: {
        orderId: 'don_matrix_pending',
        broadcastId: target.id,
        recipientId: world.owner.id,
        donorId: world.other.id,
        amount: 2000,
      },
    });
    world = {
      ...world,
      status,
      targetId: target.id,
      targetEndedAt: target.endedAt,
      targetCommentId: comment.id,
      targetChatId: chatMessage.id,
      pendingOrder: {
        paymentKey: 'pay_matrix_pending',
        orderId: pending.orderId,
        amount: pending.amount,
      },
      othersId: others.id,
    };
    ome.reset();
    toss.reset();
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
        const before = await rows();
        const res = await driver.send(world.as[actor], world);
        expect(res.status, JSON.stringify(res.body)).toBe(expected);
        if (expected >= 400) {
          expect(await rows()).toEqual(before);
          expect(ome.calls).toEqual([]);
          expect(toss.calls).toEqual([]);
        } else {
          await driver.verifyAllowed(res, world, actor);
        }
      },
    );
  });

  // 가드는 로그인을 소유권보다 먼저, 소유권을 본문보다 먼저 확인한다.
  describe('check order', () => {
    const unknownId = '00000000-0000-4000-8000-000000000000';

    beforeEach(async () => {
      await seed('READY');
    });

    const SENDERS = {
      PATCH: (client: TestAgent, id: string) =>
        client.patch(`/api/broadcasts/${id}`).send(EDITED),
      DELETE: (client: TestAgent, id: string) =>
        client.delete(`/api/broadcasts/${id}`),
      'POST end': (client: TestAgent, id: string) =>
        client.post(`/api/broadcasts/${id}/end`),
      'PATCH comment': (client: TestAgent, id: string) =>
        client.patch(`/api/comments/${id}`).send({ body: '고친 댓글' }),
      'DELETE comment': (client: TestAgent, id: string) =>
        client.delete(`/api/comments/${id}`),
      'POST chat': (client: TestAgent, id: string) =>
        client.post(`/api/broadcasts/${id}/chat`).send({ body: '채팅' }),
      'POST comment': (client: TestAgent, id: string) =>
        client.post(`/api/broadcasts/${id}/comments`).send({ body: '댓글' }),
      'POST donation': (client: TestAgent, id: string) =>
        client.post(`/api/broadcasts/${id}/donations`).send({ amount: 1000 }),
    };

    it.each(
      (Object.keys(SENDERS) as (keyof typeof SENDERS)[]).flatMap((method) => [
        [method, unknownId] as const,
        [method, 'not-a-uuid'] as const,
      ]),
    )(
      '%s on a missing resource %s is 401 when anonymous and 404 when logged in',
      async (method, id) => {
        const send = (client: TestAgent) => SENDERS[method](client, id);
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

    it('rejects a non-owner before looking at a game missing from the list', async () => {
      const bad = { category: 'GAME', gameQid: 'Q999999' };
      const url = `/api/broadcasts/${world.targetId}`;
      expect((await world.as.anonymous.patch(url).send(bad)).status).toBe(401);
      expect((await world.as.other.patch(url).send(bad)).status).toBe(403);
      expect((await world.as.owner.patch(url).send(bad)).status).toBe(400);
    });

    it('rejects a non-owner before looking at an unknown category', async () => {
      const bad = { category: 'COOKING' };
      const url = `/api/broadcasts/${world.targetId}`;
      expect((await world.as.anonymous.patch(url).send(bad)).status).toBe(401);
      expect((await world.as.other.patch(url).send(bad)).status).toBe(403);
      expect((await world.as.owner.patch(url).send(bad)).status).toBe(400);
    });

    it('rejects a non-author of a comment before looking at the body', async () => {
      const bad = { body: '' };
      const url = `/api/comments/${world.targetCommentId}`;
      expect((await world.as.anonymous.patch(url).send(bad)).status).toBe(401);
      expect((await world.as.other.patch(url).send(bad)).status).toBe(403);
      expect((await world.as.owner.patch(url).send(bad)).status).toBe(400);
    });

    // 채팅과 댓글 쓰기는 로그인, 본문(Nest가 핸들러보다 먼저 실행하는
    // 파라미터 파이프), 방송, 방송 상태 순으로 확인한다:
    // 401 → 400 → 404 → 409.
    it('checks a chat message’s body before the broadcast and its status', async () => {
      await seed('ENDED');
      const send = (actor: Actor, body: string, id = world.targetId) =>
        world.as[actor].post(`/api/broadcasts/${id}/chat`).send({ body });
      const before = await rows();
      expect((await send('anonymous', '')).status).toBe(401);
      expect((await send('other', '', unknownId)).status).toBe(400);
      expect((await send('other', '채팅', unknownId)).status).toBe(404);
      expect((await send('other', '')).status).toBe(400);
      expect((await send('other', '채팅')).status).toBe(409);
      expect(await rows()).toEqual(before);
    });

    it('checks a comment’s body before the broadcast and its status', async () => {
      const send = (actor: Actor, body: string, id = world.targetId) =>
        world.as[actor].post(`/api/broadcasts/${id}/comments`).send({ body });
      const before = await rows();
      expect((await send('anonymous', '')).status).toBe(401);
      expect((await send('other', '', unknownId)).status).toBe(400);
      expect((await send('other', '댓글', unknownId)).status).toBe(404);
      expect((await send('other', '')).status).toBe(400);
      expect((await send('other', '댓글')).status).toBe(409);
      expect(await rows()).toEqual(before);
    });

    it('checks a donation’s streamer and status before its body', async () => {
      const bad = { amount: 1 };
      const send = (actor: Actor) =>
        world.as[actor]
          .post(`/api/broadcasts/${world.targetId}/donations`)
          .send(bad);
      expect((await send('anonymous')).status).toBe(401);
      expect((await send('owner')).status).toBe(403);
      expect((await send('other')).status).toBe(409);
      await seed('LIVE');
      expect((await send('owner')).status).toBe(403);
      expect((await send('other')).status).toBe(400);
    });

    // 썸네일은 로그인, 소유권, 빈도(방송마다 10초에 한 번, 잘못된 시도 포함),
    // 이미지, 상태 순으로 확인한다.
    it('checks a thumbnail’s owner, rate and image before its status', async () => {
      const url = `/api/broadcasts/${world.targetId}/thumbnail`;
      const send = (actor: Actor, image: Buffer) =>
        world.as[actor].put(url).attach('image', image, 'a.jpg');
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect((await send('anonymous', JPEG)).status).toBe(401);
      expect((await send('other', JPEG)).status).toBe(403);
      expect((await send('owner', png)).status).toBe(400);
      expect((await send('owner', JPEG)).status).toBe(429);
      fakeClockOf(app).advance(10_000);
      expect((await send('owner', JPEG)).status).toBe(409);
    });

    // 기본 대기 이미지는 이미지보다 로그인을 먼저 확인하고, 400 응답은
    // 형식이 틀렸을 때와 파일이 너무 클 때 같은 메시지를 담는다.
    it('checks a standby image’s login before the image', async () => {
      const send = (actor: Actor, image: Buffer, filename: string) =>
        world.as[actor]
          .put('/api/me/standby-image')
          .attach('image', image, filename);
      const gif = Buffer.from('GIF89a');
      const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
      PNG.copy(oversized);
      const before = await rows();
      expect((await send('anonymous', gif, 'a.png')).status).toBe(401);
      const format = await send('owner', gif, 'a.png');
      expect(format.status).toBe(400);
      const size = await send('owner', oversized, 'a.png');
      expect(size.status).toBe(400);
      expect(size.body).toEqual(format.body);
      expect(await rows()).toEqual(before);
    });

    // PRD §7.5는 댓글 수정을 작성자에게만 허용한다. 그래서 방송을
    // 소유했다고 스트리머가 시청자의 댓글을 고칠 수는 없다.
    it('refuses the streamer a viewer’s comment on their own broadcast', async () => {
      await seed('ENDED');
      const posted = await world.as.other
        .post(`/api/broadcasts/${world.targetId}/comments`)
        .send({ body: '시청자 댓글' });
      const url = `/api/comments/${(posted.body as CommentView).id}`;
      const before = await rows();
      expect(
        (await world.as.owner.patch(url).send({ body: '바꿈' })).status,
      ).toBe(403);
      expect((await world.as.owner.delete(url)).status).toBe(403);
      expect(await rows()).toEqual(before);
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

  describe('OME 송출 연결 (Webhook 판정)', () => {
    async function seedPublish(state: PublishState): Promise<void> {
      await prisma.broadcast.deleteMany();
      const now = fakeClockOf(app).now();
      const status: BroadcastStatus = state.startsWith('LIVE')
        ? 'LIVE'
        : (state as BroadcastStatus);
      const droppedAgo = DROPPED_AGO_MS[state];
      const target = await prisma.broadcast.create({
        data: {
          streamerId: world.owner.id,
          title: '원래 제목',
          status,
          startedAt:
            status === 'READY' ? null : new Date(now.getTime() - 60_000),
          endedAt: status === 'ENDED' ? now : null,
          disconnectedAt:
            droppedAgo === undefined
              ? null
              : new Date(now.getTime() - droppedAgo),
        },
      });
      world = { ...world, targetId: target.id };
    }

    const tokenOf = (actor: Actor): string | null => {
      if (actor === 'anonymous') return null;
      const streamer = actor === 'owner' ? world.owner : world.other;
      return mintedToken(
        { broadcastId: world.targetId, streamerId: streamer.id },
        fakeClockOf(app).now(),
      );
    };

    const cases = (Object.keys(WEBHOOK_MATRIX) as PublishState[]).flatMap(
      (state) =>
        ACTORS.map((actor, column) => ({
          state,
          actor,
          who: ACTOR_LABEL[actor],
          expected: WEBHOOK_MATRIX[state][column] as WebhookCell,
        })),
    );

    it.each(cases)(
      '소유자 방송 $state | $who → $expected',
      async ({ state, actor, expected }) => {
        await seedPublish(state);
        const before = await broadcastRows();
        const res = await openPublish(app, world.targetId, tokenOf(actor));
        expect(res.status).toBe(200);
        if (expected !== '허용') {
          expect(res.body).toEqual({ allowed: false, reason: expected });
          expect(await broadcastRows()).toEqual(before);
          return;
        }
        expect(res.body).toEqual({ allowed: true });
        const detail = await anonymous().get(
          `/api/broadcasts/${world.targetId}`,
        );
        const startedAt = before[0]?.startedAt ?? fakeClockOf(app).now();
        expect(detail.body).toMatchObject({
          status: 'LIVE',
          startedAt: startedAt.toISOString(),
          endedAt: null,
        });
        const row = await prisma.broadcast.findUniqueOrThrow({
          where: { id: world.targetId },
        });
        expect(row.disconnectedAt).toBeNull();
      },
    );
  });

  // API가 아직 없는 §7.5 행. 해당 이슈가 들어오면 각각 매트릭스 행이 된다.
  // 그래서 빠진 행이 여기에 남아 눈에 띈다.
  describe('rows not built yet', () => {
    it.todo('스트림 키 조회·재발급: 비로그인 401, 타인 403, 소유자 허용 (P3)');
  });
});
