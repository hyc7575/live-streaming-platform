import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 실제 마이그레이션 파일을 일회용 스키마에서 실행해, 백필을
// 운영에서 실행될 SQL 그대로 검증한다.
const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url)
  .pathname;
const MIGRATION = '20261114090000_donation_recipient';
const SCHEMA = `donation_recipient_migration_${process.pid}`;

const STREAMER = '10000000-0000-4000-8000-000000000001';
const DONOR = '10000000-0000-4000-8000-000000000002';
const BROADCAST = '20000000-0000-4000-8000-000000000001';
const DONATION = {
  onBroadcast: '30000000-0000-4000-8000-000000000001',
  // #114에서 이미 broadcastId가 지워졌다. 누가 받았는지 아무도 모른다.
  orphaned: '30000000-0000-4000-8000-000000000002',
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
       VALUES ($1, 'a@example.com', 'A', 'x'), ($2, 'b@example.com', 'B', 'x')`,
      [STREAMER, DONOR],
    );
    await client.query(
      `INSERT INTO "Broadcast" ("id", "streamerId", "title", "status", "updatedAt")
       VALUES ($1, $2, 't', 'ENDED', now())`,
      [BROADCAST, STREAMER],
    );
    await client.query(
      `INSERT INTO "Donation" ("id", "orderId", "broadcastId", "donorId", "amount", "status")
       VALUES ($1, 'don_a', $3, $4, 1000, 'PAID'),
              ($2, 'don_b', NULL, $4, 2000, 'PAID')`,
      [DONATION.onBroadcast, DONATION.orphaned, BROADCAST, DONOR],
    );
    await client.query(await sqlOf(MIGRATION));
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.end();
  });

  it('names the broadcast’s streamer as the recipient, and leaves orphans null', async () => {
    const rows = await client.query<{ id: string; recipientId: string | null }>(
      `SELECT "id", "recipientId" FROM "Donation" ORDER BY "id"`,
    );
    expect(rows.rows).toEqual([
      { id: DONATION.onBroadcast, recipientId: STREAMER },
      { id: DONATION.orphaned, recipientId: null },
    ]);
  });

  it('keeps the recipient when the broadcast is deleted afterwards', async () => {
    await client.query(`DELETE FROM "Broadcast" WHERE "id" = $1`, [BROADCAST]);
    const row = await client.query<{
      broadcastId: string | null;
      recipientId: string | null;
    }>(`SELECT "broadcastId", "recipientId" FROM "Donation" WHERE "id" = $1`, [
      DONATION.onBroadcast,
    ]);
    expect(row.rows).toEqual([{ broadcastId: null, recipientId: STREAMER }]);
  });
});
