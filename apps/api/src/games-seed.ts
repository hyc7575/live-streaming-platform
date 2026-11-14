import 'reflect-metadata';
import pg from 'pg';
import { PrismaService } from './database/database.module.js';
import { seedGamesFile } from './games/seed-games.js';

// 컨테이너가 시작할 때 커밋된 games.json을 Game에 옮긴다(PRD-category 7.2).
// 테스트 계정과 데모 방송은 db:seed(seed.ts)의 몫이다.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');
const pool = new pg.Pool({ connectionString });
const prisma = new PrismaService(pool);

try {
  const startedAt = performance.now();
  const games = await seedGamesFile(prisma);
  console.log(
    `Games: ${games} in ${Math.round(performance.now() - startedAt)}ms`,
  );
} catch (err) {
  console.error(
    `Game seed failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await pool.end();
}
