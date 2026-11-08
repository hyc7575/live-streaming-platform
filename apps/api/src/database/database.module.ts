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

// Prisma and the session store share one pg pool, so the app holds a single
// set of connections and closes it once, after every consumer is done.
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
