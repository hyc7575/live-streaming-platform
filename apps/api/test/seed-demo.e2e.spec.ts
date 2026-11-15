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
      author: { id: string };
      donation: { amount: number; method: string } | null;
    }[];
    const comments = (await api.get(`/api/broadcasts/${first.id}/comments`))
      .body as { createdAt: string; author: { id: string } }[];
    expect(chat.length).toBeGreaterThan(0);
    expect(comments.map((c) => c.author.id)).toContain(users.B.id);
    for (const m of chat) expect(m.createdAt < endedAt).toBe(true);
    for (const c of comments) expect(c.createdAt > endedAt).toBe(true);

    // README 다시보기 절차가 채팅 기록에서 후원 줄을 볼 수 있게 한다(#166).
    // 후원 영역의 합계도 같은 후원을 센다.
    const lines = chat.filter((m) => m.donation !== null);
    expect(lines.length).toBeGreaterThan(0);
    for (const m of lines) expect(m.author.id).toBe(users.B.id);
    const donations = (await api.get(`/api/broadcasts/${first.id}/donations`))
      .body as { total: number; count: number };
    expect(donations).toMatchObject({
      count: lines.length,
      total: lines.reduce((sum, m) => sum + m.donation!.amount, 0),
    });
  });
});
