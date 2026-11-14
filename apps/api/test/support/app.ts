import 'reflect-metadata';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { expect } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import type { AuthUser } from '../../src/auth/auth-user.js';
import { THUMBNAILS_DIR } from '../../src/images/image-store.js';
import { CLOCK } from '../../src/clock.js';
import {
  TEST_ACCOUNTS_CONFIG,
  type TestAccountsConfig,
} from '../../src/auth/test-accounts.js';
import { configureApp } from '../../src/configure-app.js';
import { PrismaService } from '../../src/database/database.module.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import {
  TOSS_CONFIG,
  TOSS_PAYMENTS,
  type TossConfig,
} from '../../src/donations/toss-payments.js';
import { OME_API } from '../../src/ome/ome-api.js';
import {
  PUBLISH_CONFIG,
  publishConfig,
} from '../../src/publish/publish-config.js';
import {
  PublishSweeper,
  SWEEP_INTERVAL_MS,
} from '../../src/publish/publish-sweeper.js';
import {
  RECONCILE_INTERVAL_MS,
  RecordingReconciler,
} from '../../src/recording/recording-reconciler.js';
import {
  RECORDINGS_CONFIG,
  type RecordingsConfig,
} from '../../src/recording/recordings-config.js';
import { FakeClock } from './fake-clock.js';
import { FakeOmeApi } from './fake-ome-api.js';
import { FakeTossPayments, TEST_TOSS_CONFIG } from './fake-toss-payments.js';

export const TEST_SESSION_SECRET = 'test-session-secret';
export const TEST_OME_WEBHOOK_SECRET = 'test-ome-webhook-secret';

// 실제 AppModule을 DATABASE_URL에 대고 실행한다(마이그레이션은 이미 적용됨).
// 테스트 계정은 .env와 상관없이, 테스트가 설정을 넘기지 않으면 꺼져 있다.
// Toss는 늘 가짜 키와 가짜 API를 받는다. 키가 없는 앱이 필요하면 `toss: null`을 넘긴다.
// 썸네일은 테스트가 폴더를 넘기지 않으면 새 임시 폴더에
// 저장한다.
export async function createTestApp(
  options: {
    cookieSecure?: boolean;
    testAccounts?: TestAccountsConfig;
    sweepIntervalMs?: number;
    recordings?: RecordingsConfig;
    reconcileIntervalMs?: number;
    toss?: TossConfig | null;
    thumbnailsDir?: string;
  } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(TEST_ACCOUNTS_CONFIG)
    .useValue(options.testAccounts ?? { enabled: false })
    .overrideProvider(PUBLISH_CONFIG)
    .useValue(
      publishConfig({
        sessionSecret: TEST_SESSION_SECRET,
        omeWebhookSecret: TEST_OME_WEBHOOK_SECRET,
      }),
    )
    .overrideProvider(OME_API)
    .useFactory({
      factory: (prisma: PrismaService) => new FakeOmeApi(prisma),
      inject: [PrismaService],
    })
    .overrideProvider(CLOCK)
    .useValue(new FakeClock())
    .overrideProvider(SWEEP_INTERVAL_MS)
    .useValue(options.sweepIntervalMs ?? null)
    .overrideProvider(RECORDINGS_CONFIG)
    .useValue(
      options.recordings ?? {
        dir: join(tmpdir(), 'lsp-test-no-recordings'),
        maxBytes: 1024 ** 3,
      },
    )
    .overrideProvider(THUMBNAILS_DIR)
    .useValue(
      options.thumbnailsDir ??
        mkdtempSync(join(tmpdir(), 'lsp-test-thumbnails-')),
    )
    .overrideProvider(RECONCILE_INTERVAL_MS)
    .useValue(options.reconcileIntervalMs ?? null)
    .overrideProvider(TOSS_CONFIG)
    .useValue(options.toss === undefined ? TEST_TOSS_CONFIG : options.toss)
    .overrideProvider(TOSS_PAYMENTS)
    .useValue(new FakeTossPayments())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });
  configureApp(app, {
    secret: TEST_SESSION_SECRET,
    cookieSecure: options.cookieSecure ?? false,
  });
  await app.init();
  return app;
}

export function sweeperOf(app: NestExpressApplication): PublishSweeper {
  return app.get(PublishSweeper);
}

export function thumbnailsDirOf(app: NestExpressApplication): string {
  return app.get<string>(THUMBNAILS_DIR);
}

export function reconcilerOf(app: NestExpressApplication): RecordingReconciler {
  return app.get(RecordingReconciler);
}

// Prisma 마이그레이션 기록을 뺀 모든 테이블을 비운다.
export async function resetDatabase(
  app: NestExpressApplication,
): Promise<void> {
  const prisma = app.get(PrismaService);
  const rows = await prisma.$queryRaw<{ tablename: string }[]>(Prisma.sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
}

let clientCounter = 0;

// 클라이언트마다 고유한 전달 IP를 줘서, IP별로 세는 요청 제한이
// 한 테스트 파일 안의 서로 무관한 호출자 사이에 새지 않게 한다.
export function newClientIp(): string {
  clientCounter += 1;
  return `10.0.${Math.floor(clientCounter / 250)}.${(clientCounter % 250) + 1}`;
}

export interface TestUser extends AuthUser {
  password: string;
}

export async function signUp(
  app: NestExpressApplication,
  overrides: Partial<Omit<TestUser, 'id'>> = {},
): Promise<TestUser> {
  clientCounter += 1;
  const input = {
    email: `user${clientCounter}-${Date.now()}@example.com`,
    password: 'correct-horse-battery',
    nickname: `user${clientCounter}`,
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .set('X-Forwarded-For', newClientIp())
    .send(input);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { ...(res.body as AuthUser), password: input.password };
}

// supertest agent는 브라우저 탭처럼 요청 사이에 쿠키를 유지한다.
export async function logIn(
  app: NestExpressApplication,
  user: Pick<TestUser, 'email' | 'password'>,
): Promise<TestAgent> {
  const agent = request
    .agent(app.getHttpServer())
    .set('X-Forwarded-For', newClientIp());
  const res = await agent
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return agent;
}

// 인가 테스트의 흔한 출발점: 로그인한 새 사용자.
// 두 번 호출하면 소유자와 타인이 된다.
export async function signUpAndLogIn(
  app: NestExpressApplication,
  overrides: Partial<Omit<TestUser, 'id'>> = {},
): Promise<{ user: TestUser; agent: TestAgent }> {
  const user = await signUp(app, overrides);
  return { user, agent: await logIn(app, user) };
}
