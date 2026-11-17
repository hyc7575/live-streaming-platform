import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './database/database.module.js';
import { Prisma } from './generated/prisma/client.js';

// compose healthcheck의 timeout(5s)보다 짧아야 503이 제때 나간다.
export const HEALTH_DB_TIMEOUT_MS = 2_000;

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  // DB에 닿지 못하면 503을 돌려준다. UptimeRobot Keyword 모니터가
  // 본문의 `ok`로 정상을 판정하므로 503 본문에는 `ok`가 들어가지 않는다.
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`DB 확인이 ${HEALTH_DB_TIMEOUT_MS}ms를 넘었다`)),
        HEALTH_DB_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([
        this.prisma.$queryRaw(Prisma.sql`SELECT 1`),
        timeout,
      ]);
    } catch (err) {
      this.logger.warn(`헬스체크 DB 확인 실패: ${String(err)}`);
      throw new ServiceUnavailableException('Database unreachable');
    } finally {
      clearTimeout(timer);
    }
    return { status: 'ok' };
  }
}
