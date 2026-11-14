import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../../src/database/database.module.js';
import type { BroadcastStatus } from '../../src/generated/prisma/client.js';
import { OME_API, type OmeApi } from '../../src/ome/ome-api.js';

export interface DropStreamCall {
  broadcastId: string;
  // OME에 요청했을 때 데이터베이스의 방송 상태. 테스트가
  // 상태 변경 뒤에 연결 끊기가 왔는지 볼 수 있다.
  statusAtCall: BroadcastStatus | null;
}

export interface RecordCall extends DropStreamCall {
  kind: 'start' | 'stop';
}

// OME 관리 API를 대신한다. CI에서는 OME를 실행하지 않는다.
export class FakeOmeApi implements OmeApi {
  calls: DropStreamCall[] = [];
  failing = false;
  streams: string[] = [];
  listFailing = false;
  recordCalls: RecordCall[] = [];
  // OME가 들고 있는 녹화 작업. 방송 id를 키로 한다.
  records: string[] = [];
  recordFailing = false;
  // 테스트가 startRecord를 열린 채로 붙잡게 한다. 응답하지 않는 OME와 같다.
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
