import { expect } from 'vitest';
import type { PrismaService } from '../../src/database/database.module.js';
import { Prisma } from '../../src/generated/prisma/client.js';

// PRD §8.4: every user's balance equals the sum of their ledger deltas, and
// no balance is negative.
export async function expectLedgerMatchesBalances(
  prisma: PrismaService,
): Promise<void> {
  const rows = await prisma.$queryRaw<
    { id: string; limeBalance: number; ledgerSum: number }[]
  >(Prisma.sql`
    SELECT u.id, u."limeBalance",
      COALESCE(SUM(l.delta), 0)::int AS "ledgerSum"
    FROM "User" u LEFT JOIN "LimeLedger" l ON l."userId" = u.id
    GROUP BY u.id`);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.ledgerSum, `ledger of ${row.id}`).toBe(row.limeBalance);
    expect(row.limeBalance, `balance of ${row.id}`).toBeGreaterThanOrEqual(0);
  }
}
