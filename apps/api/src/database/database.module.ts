import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';

export const PG_POOL = Symbol('PG_POOL');

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    super({ adapter: new PrismaPg(pool) });
  }
}

// Prisma와 세션 저장소가 pg 풀 하나를 함께 쓴다. 그래서 앱은 연결 묶음을 하나만 갖고,
// 모든 사용처가 끝난 뒤 한 번만 닫는다.
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error('DATABASE_URL is not set');
        return new pg.Pool({ connectionString });
      },
    },
    PrismaService,
  ],
  exports: [PG_POOL, PrismaService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
