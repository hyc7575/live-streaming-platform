import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../../src/database/database.module.js';
import type { BroadcastStatus } from '../../src/generated/prisma/client.js';
import { OME_API, type OmeApi } from '../../src/ome/ome-api.js';

export interface DropStreamCall {
  broadcastId: string;
  // The broadcast's status in the database when OME was asked, so a test can
  // see whether the drop came after the status change.
  statusAtCall: BroadcastStatus | null;
}

// Stands in for OME's admin API, which CI does not run.
export class FakeOmeApi implements OmeApi {
  calls: DropStreamCall[] = [];
  failing = false;

  constructor(private readonly prisma: PrismaService) {}

  async dropStream(broadcastId: string): Promise<void> {
    const row = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: { status: true },
    });
    this.calls.push({ broadcastId, statusAtCall: row?.status ?? null });
    if (this.failing) throw new Error('OME is unreachable');
  }

  reset(): void {
    this.calls = [];
    this.failing = false;
  }
}

export function fakeOmeApiOf(app: NestExpressApplication): FakeOmeApi {
  return app.get<FakeOmeApi>(OME_API);
}
