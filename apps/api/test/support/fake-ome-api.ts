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

export interface RecordCall extends DropStreamCall {
  kind: 'start' | 'stop';
}

// Stands in for OME's admin API, which CI does not run.
export class FakeOmeApi implements OmeApi {
  calls: DropStreamCall[] = [];
  failing = false;
  streams: string[] = [];
  listFailing = false;
  recordCalls: RecordCall[] = [];
  // The recording tasks OME holds, keyed by broadcast id.
  records: string[] = [];
  recordFailing = false;
  // Lets a test hold startRecord open, like an OME that never answers.
  startRecordHangs = false;

  constructor(private readonly prisma: PrismaService) {}

  async dropStream(broadcastId: string): Promise<void> {
    const row = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: { status: true },
    });
    this.calls.push({ broadcastId, statusAtCall: row?.status ?? null });
    if (this.failing) throw new Error('OME is unreachable');
  }

  listStreams(): Promise<string[]> {
    if (this.listFailing) {
      return Promise.reject(new Error('OME is unreachable'));
    }
    return Promise.resolve([...this.streams]);
  }

  async startRecord(broadcastId: string): Promise<void> {
    await this.recordCall('start', broadcastId);
    if (this.startRecordHangs) return new Promise(() => {});
    if (this.recordFailing) throw new Error('OME is unreachable');
    if (!this.records.includes(broadcastId)) this.records.push(broadcastId);
  }

  async stopRecord(broadcastId: string): Promise<void> {
    await this.recordCall('stop', broadcastId);
    if (this.recordFailing) throw new Error('OME is unreachable');
    this.records = this.records.filter((id) => id !== broadcastId);
  }

  listRecords(): Promise<string[]> {
    if (this.recordFailing) {
      return Promise.reject(new Error('OME is unreachable'));
    }
    return Promise.resolve([...this.records]);
  }

  reset(): void {
    this.calls = [];
    this.failing = false;
    this.streams = [];
    this.listFailing = false;
    this.recordCalls = [];
    this.records = [];
    this.recordFailing = false;
    this.startRecordHangs = false;
  }

  private async recordCall(
    kind: RecordCall['kind'],
    broadcastId: string,
  ): Promise<void> {
    const row = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: { status: true },
    });
    this.recordCalls.push({
      kind,
      broadcastId,
      statusAtCall: row?.status ?? null,
    });
  }
}

export function fakeOmeApiOf(app: NestExpressApplication): FakeOmeApi {
  return app.get<FakeOmeApi>(OME_API);
}
