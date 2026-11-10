import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/auth/auth-user.js';
import type { BroadcastView } from '../src/broadcasts/broadcasts.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import { IMAGE_RULES } from '../src/images/image-rules.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  thumbnailsDirOf,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';

const MB = 1024 * 1024;
const INVALID = IMAGE_RULES.standby.invalidMessage;

function image(signature: number[], size: number, fill: number): Buffer {
  const bytes = Buffer.alloc(size, fill);
  bytes.set(signature);
  return bytes;
}

const jpeg = (size = 64, fill = 0x11) =>
  image([0xff, 0xd8, 0xff, 0xe0], size, fill);
const png = (size = 64, fill = 0x22) =>
  image([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size, fill);
// RIFF, a 4-byte length, then WEBP.
const webp = (size = 64, fill = 0x33) =>
  image(
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    size,
    fill,
  );
const gif = () => image([...Buffer.from('GIF89a')], 64, 0x44);

describe('channel standby image', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let dir: string;
  let owner: TestUser;
  let ownerAgent: TestAgent;
  let other: TestUser;
  let otherAgent: TestAgent;

  const anonymous = () => request(app.getHttpServer());

  const upload = (client: TestAgent, bytes: Buffer, filename = 'a.png') =>
    client
      .put('/api/me/standby-image')
      .attach('image', bytes, { filename, contentType: 'image/png' });

  const me = async (client: TestAgent) =>
    (await client.get('/api/auth/me')).body as AuthUser;

  const detail = async (id: string) =>
    (await anonymous().get(`/api/broadcasts/${id}`)).body as BroadcastView;

  const folder = (user: TestUser) => join(dir, 'users', user.id);

  const standbyFiles = async (user: TestUser) =>
    existsSync(folder(user))
      ? (await readdir(folder(user))).filter((n) => !n.endsWith('.tmp'))
      : [];

  // The file a viewer's browser gets for the URL: the static server's root is
  // the thumbnails folder, with the /thumbnails prefix stripped.
  const served = (url: string) =>
    readFile(
      join(dir, new URL(url, 'http://x').pathname.replace(/^\/thumbnails/, '')),
    );

  async function seed(
    streamer: TestUser,
    status: BroadcastStatus,
  ): Promise<string> {
    const now = clock.now();
    const row = await prisma.broadcast.create({
      data: {
        streamerId: streamer.id,
        title: '대기 이미지 방송',
        status,
        startedAt: status === 'READY' ? null : now,
        endedAt: status === 'ENDED' ? now : null,
      },
    });
    return row.id;
  }

  async function uploaded(bytes: Buffer): Promise<string> {
    const res = await upload(ownerAgent, bytes);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const url = (res.body as AuthUser).standbyImageUrl;
    expect(url).not.toBeNull();
    return url!;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    clock = fakeClockOf(app);
    dir = thumbnailsDirOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ({ user: owner, agent: ownerAgent } = await signUpAndLogIn(app));
    ({ user: other, agent: otherAgent } = await signUpAndLogIn(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts with no standby image', async () => {
    expect((await me(ownerAgent)).standbyImageUrl).toBeNull();
  });

  it.each([
    ['JPEG', jpeg, 'jpg'],
    ['PNG', png, 'png'],
    ['WebP', webp, 'webp'],
  ])(
    'stores a %s image and serves it at the returned URL',
    async (_name, make, ext) => {
      const bytes = make();

      const res = await upload(ownerAgent, bytes);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const user = res.body as AuthUser;
      expect(user).toEqual({
        id: owner.id,
        email: owner.email,
        nickname: owner.nickname,
        standbyImageUrl: expect.stringMatching(
          new RegExp(
            `^/thumbnails/users/${owner.id}/standby\\.${ext}\\?v=\\d+$`,
          ),
        ) as string,
      });
      expect(await served(user.standbyImageUrl!)).toEqual(bytes);
      expect(await me(ownerAgent)).toEqual(user);
    },
  );

  it('accepts exactly 2 MB', async () => {
    expect((await upload(ownerAgent, png(2 * MB))).status).toBe(200);
  });

  describe('rejects with 400', () => {
    it.each([
      [
        'GIF bytes named a.png',
        (r: request.Test) =>
          r.attach('image', gif(), {
            filename: 'a.png',
            contentType: 'image/png',
          }),
      ],
      [
        'text named a.webp',
        (r: request.Test) =>
          r.attach('image', Buffer.from('not an image'), {
            filename: 'a.webp',
            contentType: 'image/webp',
          }),
      ],
      [
        'RIFF bytes that are not WebP',
        (r: request.Test) =>
          r.attach(
            'image',
            image([...Buffer.from('RIFF\0\0\0\0WAVE')], 64, 0),
            {
              filename: 'a.webp',
              contentType: 'image/webp',
            },
          ),
      ],
      [
        'an image over 2 MB',
        (r: request.Test) =>
          r.attach('image', png(2 * MB + 1), {
            filename: 'a.png',
            contentType: 'image/png',
          }),
      ],
      [
        'a request with no image field',
        (r: request.Test) => r.field('other', 'x'),
      ],
      ['a body that is not multipart', (r: request.Test) => r.send({})],
    ])('%s', async (_name, send) => {
      const res = await send(ownerAgent.put('/api/me/standby-image'));

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body).toMatchObject({ message: INVALID });
      expect((await me(ownerAgent)).standbyImageUrl).toBeNull();
      expect(await standbyFiles(owner)).toEqual([]);
    });

    it('and keeps the previous image', async () => {
      const url = await uploaded(png());

      expect((await upload(ownerAgent, gif())).status).toBe(400);

      expect((await me(ownerAgent)).standbyImageUrl).toBe(url);
      expect(await standbyFiles(owner)).toEqual(['standby.png']);
    });
  });

  it('rejects an anonymous caller with 401', async () => {
    const put = await anonymous()
      .put('/api/me/standby-image')
      .attach('image', png(), 'a.png');
    expect(put.status).toBe(401);
    expect((await anonymous().delete('/api/me/standby-image')).status).toBe(
      401,
    );
  });

  describe('replacing', () => {
    it('keeps only the new format and gives a new URL', async () => {
      const first = await uploaded(png());
      clock.advance(1_000);
      const bytes = webp();

      const second = await uploaded(bytes);

      expect(second).not.toBe(first);
      expect(second).toMatch(/\/standby\.webp\?v=\d+$/);
      expect(new URL(second, 'http://x').searchParams.get('v')).not.toBe(
        new URL(first, 'http://x').searchParams.get('v'),
      );
      expect(await standbyFiles(owner)).toEqual(['standby.webp']);
      expect(await served(second)).toEqual(bytes);
    });

    it('gives a new URL for the same format uploaded later', async () => {
      const first = await uploaded(png(64, 0x01));
      clock.advance(1_000);
      const bytes = png(64, 0x02);

      const second = await uploaded(bytes);

      expect(second).not.toBe(first);
      expect(second).toMatch(/\/standby\.png\?v=\d+$/);
      expect(await served(second)).toEqual(bytes);
      expect(await standbyFiles(owner)).toEqual(['standby.png']);
    });

    it('converges on the last recorded format when uploads race', async () => {
      const results = await Promise.all([
        upload(ownerAgent, png()),
        upload(ownerAgent, webp()),
        upload(ownerAgent, jpeg()),
      ]);

      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      const { standbyImageUrl } = await me(ownerAgent);
      const name = new URL(standbyImageUrl!, 'http://x').pathname
        .split('/')
        .pop();
      expect(await standbyFiles(owner)).toEqual([name]);
    });
  });

  describe('on broadcasts', () => {
    it('gives every response for the streamer’s broadcasts the same URL', async () => {
      const ready = await seed(owner, 'READY');
      const live = await seed(owner, 'LIVE');
      const othersLive = await seed(other, 'LIVE');
      const url = await uploaded(png());

      const created = await ownerAgent
        .post('/api/broadcasts')
        .send({ title: '올린 뒤 만든 방송' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        standbyImageUrl: url,
        streamer: { id: owner.id, nickname: owner.nickname },
      });
      expect(Object.keys((created.body as BroadcastView).streamer)).toEqual([
        'id',
        'nickname',
      ]);

      expect((await detail(ready)).standbyImageUrl).toBe(url);
      expect((await detail(live)).standbyImageUrl).toBe(url);
      expect((await detail(othersLive)).standbyImageUrl).toBeNull();

      const list = (await anonymous().get('/api/broadcasts'))
        .body as BroadcastView[];
      expect(
        Object.fromEntries(list.map((b) => [b.id, b.standbyImageUrl])),
      ).toEqual({ [live]: url, [othersLive]: null });

      const mine = (await ownerAgent.get('/api/me/broadcasts'))
        .body as BroadcastView[];
      expect(mine.map((b) => b.standbyImageUrl)).toEqual([url, url, url]);
      const theirs = (await otherAgent.get('/api/me/broadcasts'))
        .body as BroadcastView[];
      expect(theirs.map((b) => b.standbyImageUrl)).toEqual([null]);
    });

    it.each<BroadcastStatus>(['READY', 'LIVE', 'ENDED'])(
      'keeps the image when a %s broadcast is deleted',
      async (status) => {
        const id = await seed(owner, status);
        const bytes = png();
        const url = await uploaded(bytes);

        expect((await ownerAgent.delete(`/api/broadcasts/${id}`)).status).toBe(
          204,
        );

        expect((await me(ownerAgent)).standbyImageUrl).toBe(url);
        expect(await served(url)).toEqual(bytes);
      },
    );
  });

  describe('deleting', () => {
    it('clears the URL everywhere and removes the file', async () => {
      const id = await seed(owner, 'READY');
      await uploaded(webp());

      const res = await ownerAgent.delete('/api/me/standby-image');

      expect(res.status).toBe(204);
      expect((await me(ownerAgent)).standbyImageUrl).toBeNull();
      expect((await detail(id)).standbyImageUrl).toBeNull();
      expect(await standbyFiles(owner)).toEqual([]);
    });

    it('succeeds again when nothing is left', async () => {
      expect((await ownerAgent.delete('/api/me/standby-image')).status).toBe(
        204,
      );
      expect((await ownerAgent.delete('/api/me/standby-image')).status).toBe(
        204,
      );
      expect((await me(ownerAgent)).standbyImageUrl).toBeNull();
    });

    it('leaves other users’ images alone', async () => {
      const res = await upload(otherAgent, png());
      const url = (res.body as AuthUser).standbyImageUrl;

      expect((await ownerAgent.delete('/api/me/standby-image')).status).toBe(
        204,
      );

      expect((await me(otherAgent)).standbyImageUrl).toBe(url);
      expect(await standbyFiles(other)).toEqual(['standby.png']);
    });
  });
});
