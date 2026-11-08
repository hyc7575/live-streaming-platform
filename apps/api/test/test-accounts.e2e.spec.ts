import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { LOGIN_RATE_LIMIT } from '../src/auth/auth.controller.js';
import {
  seedTestAccounts,
  testAccountsConfigFromEnv,
} from '../src/auth/test-accounts.js';
import { PrismaService } from '../src/database/database.module.js';
import {
  createTestApp,
  logIn,
  newClientIp,
  resetDatabase,
} from './support/app.js';

// Generated per run so no password is ever written into the repository.
function seedEnv(): Record<string, string> {
  return {
    TEST_ACCOUNT_A_PASSWORD: randomBytes(12).toString('base64url'),
    TEST_ACCOUNT_B_PASSWORD: randomBytes(12).toString('base64url'),
  };
}

function testLogin(app: NestExpressApplication, account: unknown) {
  return request
    .agent(app.getHttpServer())
    .set('X-Forwarded-For', newClientIp())
    .post('/api/auth/test-login')
    .send({ account });
}

describe('test accounts, enabled', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({
      testAccounts: testAccountsConfigFromEnv({
        TEST_ACCOUNTS_ENABLED: 'true',
      }),
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('seeds the same two users however often it runs, and applies a changed password', async () => {
    const env = seedEnv();
    await seedTestAccounts(prisma, env);
    await seedTestAccounts(prisma, env);
    const users = await prisma.user.findMany({
      select: { email: true, nickname: true },
      orderBy: { email: 'asc' },
    });
    expect(users).toEqual([
      { email: 'streamer-a@modak.test', nickname: '스트리머 A' },
      { email: 'user-b@modak.test', nickname: '사용자 B' },
    ]);

    const changed = { ...env, TEST_ACCOUNT_A_PASSWORD: 'changed-password-1' };
    await seedTestAccounts(prisma, changed);
    expect(await prisma.user.count()).toBe(2);
    await logIn(app, {
      email: 'streamer-a@modak.test',
      password: 'changed-password-1',
    });
    const oldPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({
        email: 'streamer-a@modak.test',
        password: env.TEST_ACCOUNT_A_PASSWORD,
      });
    expect(oldPassword.status).toBe(401);
  });

  it('takes emails and nicknames from the environment', async () => {
    const users = await seedTestAccounts(prisma, {
      ...seedEnv(),
      TEST_ACCOUNT_A_EMAIL: 'Judge-A@Example.com',
      TEST_ACCOUNT_A_NICKNAME: '심사 스트리머',
    });
    expect(users.A).toMatchObject({
      email: 'judge-a@example.com',
      nickname: '심사 스트리머',
    });
  });

  it('refuses to seed without a password and writes nothing', async () => {
    const env = { TEST_ACCOUNT_A_PASSWORD: 'long-enough-password' };
    await expect(seedTestAccounts(prisma, env)).rejects.toThrow(
      'TEST_ACCOUNT_B_PASSWORD is not set',
    );
    await expect(
      seedTestAccounts(prisma, { ...env, TEST_ACCOUNT_B_PASSWORD: 'short' }),
    ).rejects.toThrow('TEST_ACCOUNT_B_PASSWORD is invalid');
    expect(await prisma.user.count()).toBe(0);
  });

  it('logs in as A and as B with one request each', async () => {
    const users = await seedTestAccounts(prisma, seedEnv());
    for (const account of ['A', 'B'] as const) {
      const agent = request
        .agent(app.getHttpServer())
        .set('X-Forwarded-For', newClientIp());
      const login = await agent.post('/api/auth/test-login').send({ account });
      expect(login.status).toBe(200);
      expect(login.body).toEqual(users[account]);
      const me = await agent.get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(me.body).toEqual(users[account]);
    }
  });

  it('lists only the accounts that were seeded', async () => {
    const before = await request(app.getHttpServer()).get(
      '/api/auth/test-accounts',
    );
    expect(before.body).toEqual({ accounts: [] });
    expect((await testLogin(app, 'A')).status).toBe(404);

    await seedTestAccounts(prisma, seedEnv());
    const after = await request(app.getHttpServer()).get(
      '/api/auth/test-accounts',
    );
    expect(after.body).toEqual({ accounts: ['A', 'B'] });
  });

  it('returns 400 for an account other than A or B', async () => {
    for (const account of ['C', 'a', undefined, 1]) {
      expect((await testLogin(app, account)).status).toBe(400);
    }
  });

  it('never puts a password in a response or a log line', async () => {
    const env = seedEnv();
    const output: string[] = [];
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);

    await seedTestAccounts(prisma, env);
    const responses = [
      await testLogin(app, 'A'),
      await testLogin(app, 'B'),
      await request(app.getHttpServer()).get('/api/auth/test-accounts'),
    ];
    vi.restoreAllMocks();

    const seen = [...output, ...responses.map((r) => r.text)].join('\n');
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(seen).not.toContain(env.TEST_ACCOUNT_A_PASSWORD);
    expect(seen).not.toContain(env.TEST_ACCOUNT_B_PASSWORD);
    expect(seen).not.toMatch(/password/i);
  });

  it('answers 429 once one client exceeds the login limit', async () => {
    await seedTestAccounts(prisma, seedEnv());
    const ip = newClientIp();
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/test-login')
        .set('X-Forwarded-For', ip)
        .send({ account: 'A' });
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i += 1) {
      expect((await attempt()).status).toBe(200);
    }
    expect((await attempt()).status).toBe(429);
  });
});

describe('test accounts, disabled', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    await seedTestAccounts(app.get(PrismaService), seedEnv());
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 404 to test-login even for a seeded account', async () => {
    expect((await testLogin(app, 'A')).status).toBe(404);
    expect((await testLogin(app, 'B')).status).toBe(404);
  });

  it('lists no accounts, so the login page hides the buttons', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/auth/test-accounts',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accounts: [] });
  });
});

describe('test accounts config', () => {
  it('stays off unless TEST_ACCOUNTS_ENABLED is exactly true', () => {
    expect(testAccountsConfigFromEnv({})).toEqual({ enabled: false });
    expect(testAccountsConfigFromEnv({ TEST_ACCOUNTS_ENABLED: '1' })).toEqual({
      enabled: false,
    });
  });

  it('rejects an invalid email at startup', () => {
    expect(() =>
      testAccountsConfigFromEnv({
        TEST_ACCOUNTS_ENABLED: 'true',
        TEST_ACCOUNT_B_EMAIL: 'not-an-email',
      }),
    ).toThrow('TEST_ACCOUNT_B_EMAIL is invalid');
  });
});
