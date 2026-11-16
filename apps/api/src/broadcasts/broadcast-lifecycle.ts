import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import { Prisma, type BroadcastStatus } from '../generated/prisma/client.js';
import { OME_API, type OmeApi } from '../ome/ome-api.js';

// PRD §7.4
export const RECONNECT_GRACE_MS = 30_000;

// 유예 경계의 양쪽이 하나의 기준 시각에서 나온다. 그래서 웹훅과
// sweeper가 같은 방송에 함께 손대는 일은 없다.
export function graceWindow(now: Date) {
  const cutoff = new Date(now.getTime() - RECONNECT_GRACE_MS);
  return {
    within: { gt: cutoff },
    past: { lte: cutoff },
    contains: (disconnectedAt: Date) => disconnectedAt > cutoff,
  };
}

export interface PublishState {
  status: BroadcastStatus;
  disconnectedAt: Date | null;
}

export type PublishPhase = 'ready' | 'connected' | 'reconnectable' | 'ended';

// 송출 연결 쪽에서 본 방송의 단계. 유예를 넘긴 LIVE는 sweeper가
// 아직 ENDED로 바꾸지 않았어도 이미 끝난 것으로 본다.
export function publishPhaseOf(state: PublishState, now: Date): PublishPhase {
  if (state.status === 'READY') return 'ready';
  if (state.status === 'ENDED') return 'ended';
  if (state.disconnectedAt === null) return 'connected';
  return graceWindow(now).contains(state.disconnectedAt)
    ? 'reconnectable'
    : 'ended';
}

// 실패 결과는 송출 허가 거절 사유 문자열과 같다. 호출자는 그대로 OME에 돌려준다.
export type GoLiveResult =
  'live' | 'broadcast not ready' | 'streamer already live';
export type ReconnectResult =
  'reconnected' | 'broadcast already live' | 'broadcast ended';
export type EndResult = 'ended' | 'ready' | 'missing' | 'drop failed';

const uuid = z.uuid();

// 방송 상태 전이(PRD §7.4). Broadcast의 status·startedAt·endedAt·
// disconnectedAt을 쓰는 곳은 여기뿐이다. 모든 쓰기는 조건부 갱신이라
// 경합에서 진 쪽은 아무것도 바꾸지 않는다. 시각은 주입된 CLOCK에서 오고,
// 전이에 딸린 OME 부수효과(녹화 시작·중지, 송출 강제 종료)와 그 실패
// 처리도 여기 있다.
@Injectable()
export class BroadcastLifecycle {
  private readonly logger = new Logger(BroadcastLifecycle.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OME_API) private readonly ome: OmeApi,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // READY → LIVE. status 필터로 조건부 쓰기 한 번으로 만든다. 그래서 한
  // 방송을 두고 경합하는 송출 허가 두 개 중 정확히 하나만 통과한다. 부분
  // unique index는 한 스트리머의 방송들 사이에서 같은 일을 한다.
  async goLive(id: string): Promise<GoLiveResult> {
    try {
      const { count } = await this.prisma.broadcast.updateMany({
        where: { id, status: 'READY' },
        data: { status: 'LIVE', startedAt: this.clock.now() },
      });
      if (count !== 1) return 'broadcast not ready';
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'streamer already live';
      }
      throw error;
    }
    // OME는 송출 허가 응답을 최대 3초 기다리고, 시간이 넘으면 송출을
    // 거부한다. 그래서 녹화 요청을 기다리지 않는다. OME는 스트림이
    // 생기기 전에도 작업을 시작하고, 시작에 실패하면 RecordingReconciler가
    // 재시도한다.
    void this.startRecording(id);
    return 'live';
  }

  // 유예 시간 안에 같은 방송으로 다시 연결되면 끊긴 시각을 지운다.
  async reconnect(id: string): Promise<ReconnectResult> {
    const now = this.clock.now();
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE', disconnectedAt: graceWindow(now).within },
      data: { disconnectedAt: null },
    });
    if (count === 1) return 'reconnected';
    const row = await this.prisma.broadcast.findUnique({
      where: { id },
      select: { status: true, disconnectedAt: true },
    });
    return row && publishPhaseOf(row, now) === 'connected'
      ? 'broadcast already live'
      : 'broadcast ended';
  }

  // 송출 연결이 끊겼다. 유예 시간이 여기서 시작한다. 이미 끊긴
  // 방송이면 처음 끊긴 시각을 지킨다.
  async disconnect(id: string): Promise<boolean> {
    if (!uuid.safeParse(id).success) return false;
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE', disconnectedAt: null },
      data: { disconnectedAt: this.clock.now() },
    });
    return count === 1;
  }

  // 스트리머가 끝냈다. PRD §7.4: OME가 스트림을 끊기 전에 데이터베이스가
  // 먼저 ENDED가 된다. 그래서 그 사이에 다시 연결하는 송출자는 송출 허가에서
  // 거부된다. 순서를 뒤집으면 다시 끼어들 수 있다. ENDED 방송에도 끊기를
  // 다시 보내므로, 끊기에 실패한 뒤 재시도하면 같은 상태로 수렴한다. 녹화
  // 중지는 맨 마지막이고 실패해도 된다. RecordingReconciler가 방송이 더 이상
  // LIVE가 아닌 작업을 모두 멈춘다.
  async end(id: string): Promise<EndResult> {
    await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE' },
      data: { status: 'ENDED', endedAt: this.clock.now() },
    });
    const row = await this.prisma.broadcast.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!row) return 'missing';
    // §7.4에는 READY → ENDED 전이가 없다. READY 방송은 대신 삭제한다.
    if (row.status === 'READY') return 'ready';
    try {
      await this.ome.dropStream(id);
    } catch (error) {
      this.logger.error(`Dropping the stream of ${id} failed`, error);
      return 'drop failed';
    }
    await this.stopRecording(id);
    return 'ended';
  }

  // PRD §7.4 좀비 정리(T8). OME의 `closing`은 빠지거나, 그보다 먼저 와야 할
  // 재연결보다 늦게 올 수 있다. 그래서 LIVE 방송을 OME가 실제로 받고 있는
  // 스트림과 맞추고, 유예 시간이 지난 방송을 끝낸다. `now`는 스트림 목록을
  // 읽기 전의 시각이어야 한다.
  async sweep(now: Date = this.clock.now()): Promise<void> {
    let listed: string[];
    try {
      // Postgres는 uuid 컬럼의 `in` 필터에 uuid가 아닌 값이 있으면 거부한다.
      listed = (await this.ome.listStreams()).filter(
        (name) => uuid.safeParse(name).success,
      );
    } catch (error) {
      this.logger.warn('Skipping the sweep: OME did not list streams', error);
      return;
    }
    const reconnected = await this.prisma.broadcast.updateMany({
      where: {
        status: 'LIVE',
        id: { in: listed },
        // `now` 이후의 끊김은 목록보다 새로울 수 있다. 목록은
        // `now`를 읽은 뒤에 가져왔기 때문이다. 다음 sweep이 정리한다.
        disconnectedAt: { lt: now },
      },
      data: { disconnectedAt: null },
    });
    const lostWithoutClosing = await this.prisma.broadcast.updateMany({
      where: { status: 'LIVE', id: { notIn: listed }, disconnectedAt: null },
      data: { disconnectedAt: now },
    });
    // end()와 달리 OME DELETE를 보내지 않는다. 이 스트림들은 방금 가져온
    // 목록에 없고, ENDED가 저장되면 송출 허가가 이후 재연결을 거부한다.
    const ended = await this.prisma.broadcast.updateManyAndReturn({
      where: {
        status: 'LIVE',
        id: { notIn: listed },
        disconnectedAt: graceWindow(now).past,
      },
      data: { status: 'ENDED', endedAt: now },
      select: { id: true },
    });
    if (reconnected.count + lostWithoutClosing.count + ended.length > 0) {
      this.logger.log(
        `Swept: ${reconnected.count} reconnected, ${lostWithoutClosing.count} lost without closing, ${ended.length} ended`,
      );
    }
    for (const { id } of ended) {
      await this.stopRecording(id);
    }
  }

  // 녹화 시작·중지는 실패해도 전이를 되돌리지 않고 로그만 남긴다.
  // RecordingReconciler가 다음 틱에 같은 메서드로 다시 맞춘다.
  async startRecording(id: string): Promise<void> {
    try {
      await this.ome.startRecord(id);
    } catch (error) {
      this.logger.error(`Starting the recording of ${id} failed`, error);
    }
  }

  async stopRecording(id: string): Promise<void> {
    try {
      await this.ome.stopRecord(id);
    } catch (error) {
      this.logger.error(`Stopping the recording of ${id} failed`, error);
    }
  }
}
