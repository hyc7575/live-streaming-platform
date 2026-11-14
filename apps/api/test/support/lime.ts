import { expect } from 'vitest';
import type { PrismaService } from '../../src/database/database.module.js';
import { Prisma } from '../../src/generated/prisma/client.js';

// PRD §8.4: 모든 사용자의 잔액은 원장 변동분의 합과 같고,
// 음수 잔액은 없으며, 모든 원장 행은 자신의 충전이나
// 후원으로 연결된다.
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

  // #114: 후원의 방송이 삭제된 뒤에도, 모든 원장 행은
  // 자신의 근거인 충전이나 후원을 여전히 가리킨다.
  const dangling = await prisma.$queryRaw<{ id: string; kind: string }[]>(
    Prisma.sql`
      SELECT l.id, l.kind::text AS kind FROM "LimeLedger" l
      WHERE (l.kind = 'CHARGE'
          AND NOT EXISTS (SELECT 1 FROM "LimeCharge" c WHERE c.id = l."refId"))
        OR (l.kind = 'DONATION'
          AND NOT EXISTS (SELECT 1 FROM "Donation" d WHERE d.id = l."refId"))`,
  );
  expect(dangling, 'ledger rows whose refId points at nothing').toEqual([]);
}
