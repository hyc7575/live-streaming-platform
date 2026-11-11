import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTestAccounts } from '../src/auth/test-accounts.js';
import { PrismaService } from '../src/database/database.module.js';
import { DEMO_ENDED_TITLE, seedDemoEndedBroadcast } from '../src/seed-demo.js';
import { createTestApp, resetDatabase } from './support/app.js';

describe('demo ended broadcast seed', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const seedAccounts = () =>
    seedTestAccounts(prisma, {
      TEST_ACCOUNT_A_PASSWORD: randomBytes(12).toString('base64url'),
      TEST_ACCOUNT_B_PASSWORD: randomBytes(12).toString('base64url'),
    });

  it('leaves one ended broadcast by A, with chat before the end and comments after, however often it runs', async () => {
    const users = await seedAccounts();
    const first = await seedDemoEndedBroadcast(prisma, users);
    const second = await seedDemoEndedBroadcast(prisma, await seedAccounts());
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });

    const api = request(app.getHttpServer());
    const list = await api.get('/api/broadcasts?status=ENDED');
    expect(list.body).toEqual([
      expect.objectContaining({
        id: first.id,
        title: DEMO_ENDED_TITLE,
        status: 'ENDED',
        streamer: expect.objectContaining({ id: users.A.id }) as unknown,
      }),
    ]);
    const { endedAt } = (await api.get(`/api/broadcasts/${first.id}`)).body as {
      endedAt: string;
    };
    const chat = (await api.get(`/api/broadcasts/${first.id}/chat`)).body as {
      createdAt: string;
    }[];
    const comments = (await api.get(`/api/broadcasts/${first.id}/comments`))
      .body as { createdAt: string; author: { id: string } }[];
    expect(chat.length).toBeGreaterThan(0);
    expect(comments.map((c) => c.author.id)).toContain(users.B.id);
    for (const m of chat) expect(m.createdAt < endedAt).toBe(true);
    for (const c of comments) expect(c.createdAt > endedAt).toBe(true);
  });
});
