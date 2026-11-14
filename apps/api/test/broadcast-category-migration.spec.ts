import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 실제 마이그레이션 파일을 일회용 스키마에서 실행해, 운영에서 실행될
// SQL 그대로 기존 방송이 어떻게 채워지는지 검증한다.
const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url)
  .pathname;
const MIGRATION = '20261114180000_broadcast_category';
const SCHEMA = `broadcast_category_migration_${process.pid}`;

const STREAMER = '10000000-0000-4000-8000-000000000001';
const BROADCAST = {
  ready: '20000000-0000-4000-8000-000000000001',
  ended: '20000000-0000-4000-8000-000000000002',
};

async function migrationsBefore(name: string): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name < name)
    .map((e) => e.name)
    .sort();
}

const sqlOf = (name: string) =>
  readFile(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

describe(`migration ${MIGRATION}`, () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.query(`CREATE SCHEMA "${SCHEMA}"`);
    await client.query(`SET search_path TO "${SCHEMA}"`);
    for (const name of await migrationsBefore(MIGRATION)) {
      await client.query(await sqlOf(name));
    }
    await client.query(
      `INSERT INTO "User" ("id", "email", "nickname", "passwordHash")
       VALUES ($1, 'a@example.com', 'A', 'x')`,
      [STREAMER],
    );
    await client.query(
      `INSERT INTO "Broadcast" ("id", "streamerId", "title", "status", "updatedAt")
       VALUES ($1, $3, '준비', 'READY', now()), ($2, $3, '종료', 'ENDED', now())`,
      [BROADCAST.ready, BROADCAST.ended, STREAMER],
    );
    await client.query(await sqlOf(MIGRATION));
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.end();
  });

  it('files every existing broadcast under ETC', async () => {
    const rows = await client.query<{ id: string; category: string }>(
      `SELECT "id", "category" FROM "Broadcast" ORDER BY "id"`,
    );
    expect(rows.rows).toEqual([
      { id: BROADCAST.ready, category: 'ETC' },
      { id: BROADCAST.ended, category: 'ETC' },
    ]);
  });
});
