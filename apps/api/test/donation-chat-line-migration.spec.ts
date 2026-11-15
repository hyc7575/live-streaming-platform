import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 실제 마이그레이션 파일을 일회용 스키마에서 실행해, 기존 후원의 후원 줄
// 채우기를 운영에서 실행될 SQL 그대로 검증한다(#166).
const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url)
  .pathname;
const MIGRATION = '20261115120000_donation_chat_line';
const SCHEMA = `donation_chat_line_migration_${process.pid}`;

const STREAMER = '10000000-0000-4000-8000-000000000001';
const DONOR = '10000000-0000-4000-8000-000000000002';
const BROADCAST = '20000000-0000-4000-8000-000000000001';
const DONATION = {
  paid: '30000000-0000-4000-8000-000000000001',
  // #114로 방송이 지워졌다. 줄을 놓을 채팅이 없다.
  orphaned: '30000000-0000-4000-8000-000000000002',
  pending: '30000000-0000-4000-8000-000000000003',
};
const APPROVED_AT = new Date('2026-11-12T10:00:05.000Z');

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
      `INSERT INTO "Donation"
         ("id", "orderId", "broadcastId", "recipientId", "donorId", "amount",
          "message", "status", "method", "approvedAt")
       VALUES ($1, 'don_a', $4, $5, $6, 1000, '응원해요', 'PAID', 'LIME', $7),
              ($2, 'don_b', NULL, $5, $6, 2000, '', 'PAID', 'TOSS', $7),
              ($3, 'don_c', $4, $5, $6, 3000, '', 'PENDING', 'TOSS', NULL)`,
      [
        DONATION.paid,
        DONATION.orphaned,
        DONATION.pending,
        BROADCAST,
        STREAMER,
        DONOR,
        APPROVED_AT,
      ],
    );
    await client.query(await sqlOf(MIGRATION));
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.end();
  });

  it('adds a line at approval time for each paid donation still on a broadcast', async () => {
    const rows = await client.query<{
      broadcastId: string;
      authorId: string;
      body: string;
      createdAt: Date;
      donationId: string | null;
    }>(
      `SELECT "broadcastId", "authorId", "body", "createdAt", "donationId"
       FROM "ChatMessage"`,
    );
    expect(rows.rows).toEqual([
      {
        broadcastId: BROADCAST,
        authorId: DONOR,
        body: '응원해요',
        createdAt: APPROVED_AT,
        donationId: DONATION.paid,
      },
    ]);
  });
});
