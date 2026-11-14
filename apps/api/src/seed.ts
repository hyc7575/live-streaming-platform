import 'reflect-metadata';
import pg from 'pg';
import { seedTestAccounts } from './auth/test-accounts.js';
import { PrismaService } from './database/database.module.js';
import { seedGamesFileAndLog } from './games/seed-games.js';
import { DEMO_ENDED_TITLE, seedDemoEndedBroadcast } from './seed-demo.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');
const pool = new pg.Pool({ connectionString });
const prisma = new PrismaService(pool);

try {
  const users = await seedTestAccounts(prisma, process.env);
  for (const [key, user] of Object.entries(users)) {
    console.log(`Test account ${key}: ${user.email} (${user.nickname})`);
  }
  const demo = await seedDemoEndedBroadcast(prisma, users);
  console.log(
    `Demo ended broadcast ${demo.created ? 'created' : 'kept'}: ${demo.id} (${DEMO_ENDED_TITLE})`,
  );
  await seedGamesFileAndLog(prisma);
} catch (err) {
  console.error(
    `Seed failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await pool.end();
}
