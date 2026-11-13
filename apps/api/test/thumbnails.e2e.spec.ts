import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  THUMBNAIL_NOT_LIVE_MESSAGE,
  type BroadcastView,
} from '../src/broadcasts/broadcasts.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  thumbnailsDirOf,
  type TestUser,
} from './support/app.js';
import { fakeClockOf, type FakeClock } from './support/fake-clock.js';

const KB = 1024;

function jpeg(size = 64, fill = 0x11): Buffer {
  const bytes = Buffer.alloc(size, fill);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

describe('broadcast thumbnails', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: FakeClock;
  let dir: string;
  let owner: TestUser;
  let ownerAgent: TestAgent;
  let otherAgent: TestAgent;

  const anonymous = () => request(app.getHttpServer());

  const upload = (client: TestAgent, id: string, image: Buffer = jpeg()) =>
    client
      .put(`/api/broadcasts/${id}/thumbnail`)
      .attach('image', image, { filename: 'a.jpg', contentType: 'image/jpeg' });

  const detail = async (id: string) =>
    (await anonymous().get(`/api/broadcasts/${id}`)).body as BroadcastView;

  // 시청자 브라우저가 thumbnailUrl로 받는 파일. 정적 서버의
  // 루트는 thumbnails 폴더이고, /thumbnails 접두사는 떼어 낸다.
  const served = (url: string) =>
    readFile(
      join(dir, new URL(url, 'http://x').pathname.replace(/^\/thumbnails/, '')),
    );

  async function seed(status: BroadcastStatus): Promise<string> {
    const now = clock.now();
    const row = await prisma.broadcast.create({
      data: {
        streamerId: owner.id,
        title: '썸네일 방송',
        status,
        startedAt: status === 'READY' ? null : now,
        endedAt: status === 'ENDED' ? now : null,
      },
    });
    return row.id;
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
    ({ agent: otherAgent } = await signUpAndLogIn(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the uploaded image at the URL that list and detail give', async () => {
    const id = await seed('LIVE');
    const image = jpeg(2 * KB);

    const res = await upload(ownerAgent, id, image);

    expect(res.status, JSON.stringify(res.body)).toBe(204);
    const { thumbnailUrl } = await detail(id);
    expect(thumbnailUrl).toMatch(
      new RegExp(`^/thumbnails/${id}/live\\.jpg\\?v=\\d+$`),
    );
    expect(await served(thumbnailUrl!)).toEqual(image);
    const list = await anonymous().get('/api/broadcasts');
    expect(list.body).toEqual([expect.objectContaining({ id, thumbnailUrl })]);
    const mine = await ownerAgent.get('/api/me/broadcasts');
    expect(mine.body).toEqual([expect.objectContaining({ id, thumbnailUrl })]);
  });

  it('gives a new URL for a later upload and keeps no temporary file', async () => {
    const id = await seed('LIVE');
    expect((await upload(ownerAgent, id, jpeg(KB, 0x01))).status).toBe(204);
    const first = (await detail(id)).thumbnailUrl;

    clock.advance(10_000);
    const second = jpeg(KB, 0x02);
    expect((await upload(ownerAgent, id, second)).status).toBe(204);

    const { thumbnailUrl } = await detail(id);
    expect(thumbnailUrl).not.toBe(first);
    expect(await served(thumbnailUrl!)).toEqual(second);
    expect(await readdir(join(dir, id))).toEqual(['live.jpg']);
  });

  it('keeps the last image once the broadcast ends', async () => {
    const id = await seed('LIVE');
    const image = jpeg();
    expect((await upload(ownerAgent, id, image)).status).toBe(204);
    const { thumbnailUrl } = await detail(id);

    expect((await ownerAgent.post(`/api/broadcasts/${id}/end`)).status).toBe(
      200,
    );

    const ended = await detail(id);
    expect(ended).toMatchObject({ status: 'ENDED', thumbnailUrl });
    expect(await served(thumbnailUrl!)).toEqual(image);
  });

  it('has no thumbnail URL before any upload', async () => {
    const id = await seed('LIVE');
    expect((await detail(id)).thumbnailUrl).toBeNull();
  });

  it('accepts exactly 512 KB', async () => {
    const id = await seed('LIVE');
    expect((await upload(ownerAgent, id, jpeg(512 * KB))).status).toBe(204);
  });

  describe('rejects', () => {
    it('an anonymous caller with 401', async () => {
      const id = await seed('LIVE');
      const res = await anonymous()
        .put(`/api/broadcasts/${id}/thumbnail`)
        .attach('image', jpeg(), 'a.jpg');
      expect(res.status).toBe(401);
    });

    it('someone else’s broadcast with 403', async () => {
      const id = await seed('LIVE');
      expect((await upload(otherAgent, id)).status).toBe(403);
    });

    it('an unknown broadcast with 404', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      expect((await upload(ownerAgent, unknown)).status).toBe(404);
    });

    it.each<BroadcastStatus>(['READY', 'ENDED'])(
      'a %s broadcast with 409',
      async (status) => {
        const id = await seed(status);
        const res = await upload(ownerAgent, id);
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ message: THUMBNAIL_NOT_LIVE_MESSAGE });
        expect((await detail(id)).thumbnailUrl).toBeNull();
        expect(existsSync(join(dir, id))).toBe(false);
      },
    );

    it.each([
      [
        'PNG bytes labelled image/jpeg',
        (r: request.Test) =>
          r.attach('image', PNG, {
            filename: 'a.jpg',
            contentType: 'image/jpeg',
          }),
      ],
      [
        'a request with no image field',
        (r: request.Test) => r.field('other', 'x'),
      ],
      ['a body that is not multipart', (r: request.Test) => r.send({})],
      [
        'an image over 512 KB',
        (r: request.Test) =>
          r.attach('image', jpeg(512 * KB + 1), {
            filename: 'a.jpg',
            contentType: 'image/jpeg',
          }),
      ],
    ])('%s with 400', async (_name, send) => {
      const id = await seed('LIVE');
      const res = await send(ownerAgent.put(`/api/broadcasts/${id}/thumbnail`));
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect((await detail(id)).thumbnailUrl).toBeNull();
      expect(existsSync(join(dir, id))).toBe(false);
    });

    it('a second attempt within 10 s with 429, then accepts again', async () => {
      const id = await seed('LIVE');
      expect((await upload(ownerAgent, id, PNG)).status).toBe(400);

      clock.advance(9_999);
      expect((await upload(ownerAgent, id)).status).toBe(429);
      expect((await detail(id)).thumbnailUrl).toBeNull();

      clock.advance(10_000);
      expect((await upload(ownerAgent, id)).status).toBe(204);
    });
  });

  it('counts the 10 s per broadcast', async () => {
    const first = await seed('LIVE');
    const other = await signUpAndLogIn(app);
    const second = (
      await prisma.broadcast.create({
        data: {
          streamerId: other.user.id,
          title: '다른 방송',
          status: 'LIVE',
          startedAt: clock.now(),
        },
      })
    ).id;
    expect((await upload(ownerAgent, first)).status).toBe(204);
    expect((await upload(other.agent, second)).status).toBe(204);
  });

  describe('deleting the broadcast', () => {
    it.each<BroadcastStatus>(['LIVE', 'ENDED'])(
      'removes the thumbnail folder of a broadcast deleted while %s',
      async (status) => {
        const id = await seed('LIVE');
        expect((await upload(ownerAgent, id)).status).toBe(204);
        if (status === 'ENDED') {
          await ownerAgent.post(`/api/broadcasts/${id}/end`);
        }

        expect((await ownerAgent.delete(`/api/broadcasts/${id}`)).status).toBe(
          204,
        );

        expect(existsSync(join(dir, id))).toBe(false);
      },
    );

    it('succeeds for a READY broadcast that never had a thumbnail', async () => {
      const id = await seed('READY');
      expect((await ownerAgent.delete(`/api/broadcasts/${id}`)).status).toBe(
        204,
      );
    });
  });
});
