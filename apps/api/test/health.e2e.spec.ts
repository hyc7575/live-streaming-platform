import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PrismaService } from '../src/database/database.module.js';
import { HEALTH_DB_TIMEOUT_MS } from '../src/health.controller.js';
import { createTestApp } from './support/app.js';

describe('GET /api/health', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok under the /api prefix', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('does not serve routes outside the /api prefix', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(404);
  });

  // UptimeRobot Keyword 모니터가 `ok`로 정상을 판정하므로 503 본문에 `ok`가 없어야 한다.
  it('returns 503 without "ok" in the body when the DB query fails', async () => {
    vi.spyOn(app.get(PrismaService), '$queryRaw').mockRejectedValue(
      new Error('connection refused'),
    );
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.text).not.toMatch(/ok/i);
  });

  it(
    'returns 503 when the DB query does not answer within the timeout',
    async () => {
      vi.spyOn(app.get(PrismaService), '$queryRaw').mockReturnValue(
        new Promise(() => {}) as never,
      );
      const started = Date.now();
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(503);
      expect(res.text).not.toMatch(/ok/i);
      expect(Date.now() - started).toBeGreaterThanOrEqual(
        HEALTH_DB_TIMEOUT_MS - 50,
      );
    },
    HEALTH_DB_TIMEOUT_MS + 3_000,
  );
});
