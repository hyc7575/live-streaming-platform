import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/auth/auth-user.js';
import type { BroadcastView } from '../src/broadcasts/broadcasts.service.js';
import { PrismaService } from '../src/database/database.module.js';
import { IMAGE_RULES, type ImageKind } from '../src/images/image-rules.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';

const MB = 1024 * 1024;

// 세 라우트가 모두 받는 형식이 JPEG라서 같은 바이트를 쓴다.
const JPEG = (() => {
  const bytes = Buffer.alloc(64, 0x11);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
})();

const attachImage = (r: request.Test, field = 'image') =>
  r.attach(field, JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });

// #211: 이미지 라우트는 `image` 파일 파트 하나만 받는다. 그 밖의 파트는
// 메모리에 쌓기 전에 거절하고, 다른 무효한 이미지와 같은 400 문구를 준다.
describe('image upload multipart limits', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let owner: TestUser;
  let ownerAgent: TestAgent;
  let broadcastId: string;

  const me = async () =>
    (await ownerAgent.get('/api/auth/me')).body as AuthUser;

  const thumbnailUrl = async () =>
    (
      (await request(app.getHttpServer()).get(`/api/broadcasts/${broadcastId}`))
        .body as BroadcastView
    ).thumbnailUrl;

  const routes: {
    kind: ImageKind;
    path: () => string;
    stored: () => Promise<string | null>;
  }[] = [
    {
      kind: 'avatar',
      path: () => '/api/me/avatar',
      stored: async () => (await me()).avatarUrl,
    },
    {
      kind: 'standby',
      path: () => '/api/me/standby-image',
      stored: async () => (await me()).standbyImageUrl,
    },
    {
      kind: 'thumbnail',
      path: () => `/api/broadcasts/${broadcastId}/thumbnail`,
      stored: thumbnailUrl,
    },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clock = fakeClockOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ({ user: owner, agent: ownerAgent } = await signUpAndLogIn(app));
    const row = await prisma.broadcast.create({
      data: {
        streamerId: owner.id,
        title: '업로드 한도 방송',
        status: 'LIVE',
        startedAt: clock.now(),
      },
    });
    broadcastId = row.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(routes)('$kind', ({ kind, path, stored }) => {
    it('accepts a request with only the image file', async () => {
      const res = await attachImage(ownerAgent.put(path()));

      expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
      expect(await stored()).not.toBeNull();
    });

    it.each([
      [
        'a text field after the image',
        (r: request.Test) => attachImage(r).field('note', 'x'),
      ],
      [
        'a text field before the image',
        (r: request.Test) => attachImage(r.field('note', 'x')),
      ],
      [
        'a 1 MiB text field',
        (r: request.Test) => attachImage(r).field('note', 'x'.repeat(MB)),
      ],
      [
        'many text fields',
        (r: request.Test) => {
          let req = attachImage(r);
          for (let i = 0; i < 32; i++) req = req.field(`f${i}`, 'x');
          return req;
        },
      ],
      ['a second image file', (r: request.Test) => attachImage(attachImage(r))],
      [
        'a file under another field name',
        (r: request.Test) => attachImage(attachImage(r), 'other'),
      ],
    ])('rejects %s with 400', async (_name, send) => {
      const res = await send(ownerAgent.put(path()));

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body).toMatchObject({
        message: IMAGE_RULES[kind].invalidMessage,
      });
      expect(await stored()).toBeNull();
    });
  });
});
