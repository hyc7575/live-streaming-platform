import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the real migration files in a throwaway schema, so the data move is
// checked against the SQL that production will run, not a copy of its rule.
const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url)
  .pathname;
const CHAT_MIGRATION = '20261111150000_chat_messages';
const SCHEMA = `chat_migration_${process.pid}`;

const USER_ID = '10000000-0000-4000-8000-000000000001';
const BROADCAST = {
  ready: '20000000-0000-4000-8000-000000000001',
  live: '20000000-0000-4000-8000-000000000002',
  ended: '20000000-0000-4000-8000-000000000003',
};
const ENDED_AT = '2026-11-10T12:00:00.000Z';

// [comment id, broadcast, createdAt]
const COMMENTS = [
  [
    '30000000-0000-4000-8000-000000000001',
    BROADCAST.ready,
    '2026-11-10T10:00:00.000Z',
  ],
  [
    '30000000-0000-4000-8000-000000000002',
    BROADCAST.live,
    '2026-11-10T10:00:00.000Z',
  ],
  [
    '30000000-0000-4000-8000-000000000003',
    BROADCAST.ended,
    '2026-11-10T11:59:59.999Z',
  ],
  ['30000000-0000-4000-8000-000000000004', BROADCAST.ended, ENDED_AT],
  [
    '30000000-0000-4000-8000-000000000005',
    BROADCAST.ended,
    '2026-11-10T13:00:00.000Z',
  ],
] as const;

async function migrationsBefore(name: string): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name < name)
    .map((e) => e.name)
    .sort();
}

const sqlOf = (name: string) =>
  readFile(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

describe(`migration ${CHAT_MIGRATION}`, () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.query(`CREATE SCHEMA "${SCHEMA}"`);
    await client.query(`SET search_path TO "${SCHEMA}"`);
    for (const name of await migrationsBefore(CHAT_MIGRATION)) {
      await client.query(await sqlOf(name));
    }
    await client.query(
      `INSERT INTO "User" ("id", "email", "nickname", "passwordHash")
       VALUES ($1, 'a@example.com', 'A', 'x')`,
      [USER_ID],
    );
    await client.query(
      `INSERT INTO "Broadcast" ("id", "streamerId", "title", "status", "startedAt", "endedAt", "updatedAt")
       VALUES ($1, $4, 'r', 'READY', NULL, NULL, now()),
              ($2, $4, 'l', 'LIVE', '2026-11-10T09:00:00Z', NULL, now()),
              ($3, $4, 'e', 'ENDED', '2026-11-10T09:00:00Z', $5, now())`,
      [BROADCAST.ready, BROADCAST.live, BROADCAST.ended, USER_ID, ENDED_AT],
    );
    for (const [id, broadcastId, createdAt] of COMMENTS) {
      await client.query(
        `INSERT INTO "Comment" ("id", "broadcastId", "authorId", "body", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [id, broadcastId, USER_ID, `body ${id}`, createdAt],
      );
    }
    await client.query(await sqlOf(CHAT_MIGRATION));
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.end();
  });

  it('moves comments written before the end, or on an unended broadcast, to chat with their ids', async () => {
    // createdAt is a timestamp without time zone holding UTC, so it is read
    // back as text rather than through pg's local-time Date parsing.
    const chat = await client.query<{
      id: string;
      createdAt: string;
      body: string;
    }>(
      `SELECT "id", "body",
              to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
       FROM "ChatMessage" ORDER BY "id"`,
    );
    expect(chat.rows).toEqual(
      [COMMENTS[0], COMMENTS[1], COMMENTS[2]].map(([id, , createdAt]) => ({
        id,
        createdAt,
        body: `body ${id}`,
      })),
    );
  });

  it('keeps comments written at or after the end as comments', async () => {
    const comments = await client.query<{ id: string }>(
      `SELECT "id" FROM "Comment" ORDER BY "id"`,
    );
    expect(comments.rows.map((r) => r.id)).toEqual([
      COMMENTS[3][0],
      COMMENTS[4][0],
    ]);
  });
});
