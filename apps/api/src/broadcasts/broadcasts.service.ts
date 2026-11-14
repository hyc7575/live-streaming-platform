import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import {
  Prisma,
  type BroadcastCategory,
  type BroadcastStatus,
} from '../generated/prisma/client.js';
import {
  ImageStore,
  userImageUrl,
  thumbnailUrl,
} from '../images/image-store.js';
import { OME_API, type OmeApi } from '../ome/ome-api.js';

// 목록에서 고른 게임이거나 직접 입력한 이름. 본문의 gameQid·gameName을
// 컨트롤러가 이 모양으로 접는다. null은 게임을 비우고, undefined는 그대로 둔다.
export type GameChoice = { qid: string } | { name: string };

export interface CreateBroadcastInput {
  title: string;
  description: string;
  category?: BroadcastCategory | undefined;
  game?: GameChoice | null | undefined;
}

export interface UpdateBroadcastInput {
  title?: string | undefined;
  description?: string | undefined;
  category?: BroadcastCategory | undefined;
  game?: GameChoice | null | undefined;
}

export const END_READY_MESSAGE =
  '아직 시작하지 않은 방송은 종료할 수 없습니다.';
export const DROP_STREAM_FAILED_MESSAGE =
  '송출 연결을 끊지 못했습니다. 다시 시도하세요.';
export const THUMBNAIL_NOT_LIVE_MESSAGE =
  '방송 중일 때만 썸네일을 올릴 수 있습니다.';
export const GAME_NEEDS_GAME_CATEGORY_MESSAGE =
  '게임 카테고리 방송에만 게임을 붙일 수 있습니다.';
export const UNKNOWN_GAME_MESSAGE = '게임 목록에 없는 게임입니다.';

export type PublicStatus = Extract<BroadcastStatus, 'LIVE' | 'READY' | 'ENDED'>;

// API가 방송에 대해 공개하는 정보. 스트리머는 닉네임으로만 나오고
// 이메일로는 절대 나오지 않는다.
const broadcastSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  gameQid: true,
  gameName: true,
  status: true,
  startedAt: true,
  endedAt: true,
  disconnectedAt: true,
  createdAt: true,
  recordingFiles: true,
  recordingStartedAt: true,
  thumbnailUpdatedAt: true,
  streamer: {
    select: {
      id: true,
      nickname: true,
      standbyImageExt: true,
      standbyImageUpdatedAt: true,
    },
  },
} as const satisfies Prisma.BroadcastSelect;

type BroadcastRow = Prisma.BroadcastGetPayload<{
  select: typeof broadcastSelect;
}>;

// startedAt은 그 파트 영상의 0초 지점이 찍힌 시각이다. 어느 한 파트라도
// 시작 시각을 모르면 모든 파트에서 null이다.
export interface RecordingPart {
  file: string;
  startedAt: Date | null;
}

// 업로드 시각과 확장자는 URL을 만들 때만 쓰므로 클라이언트는 URL을
// 받는다. 기본 대기 이미지는 스트리머 것이라 그 스트리머의 모든 방송이 함께 쓴다.
export type BroadcastView = Omit<
  BroadcastRow,
  | 'recordingStartedAt'
  | 'thumbnailUpdatedAt'
  | 'streamer'
  | 'gameQid'
  | 'gameName'
> & {
  // qid가 null이면 직접 입력한 게임이다.
  game: { qid: string | null; name: string } | null;
  recordingParts: RecordingPart[];
  streamer: { id: string; nickname: string };
  thumbnailUrl: string | null;
  standbyImageUrl: string | null;
};

function toView({
  recordingStartedAt,
  thumbnailUpdatedAt,
  gameQid,
  gameName,
  streamer: { standbyImageExt, standbyImageUpdatedAt, ...streamer },
  ...row
}: BroadcastRow): BroadcastView {
  return {
    ...row,
    game: gameName === null ? null : { qid: gameQid, name: gameName },
    recordingParts: row.recordingFiles.map((file, i) => ({
      file,
      startedAt: recordingStartedAt[i] ?? null,
    })),
    streamer,
    thumbnailUrl: thumbnailUrl(row.id, thumbnailUpdatedAt),
    standbyImageUrl: userImageUrl(
      streamer.id,
      'standby',
      standbyImageExt,
      standbyImageUpdatedAt,
    ),
  };
}

// 페이지네이션이 없다. 공모전 규모 배포 하나에는 방송이 수십 개라서
// 커서 API 없이 고정 상한만으로 응답 크기를 묶어 둔다.
export const PUBLIC_LIST_LIMIT = 100;

// 목록 순서. enum은 READY를 먼저 선언하므로 status로 정렬해서는
// 이 순서가 나오지 않는다.
const PUBLIC_STATUSES = [
  'LIVE',
  'READY',
  'ENDED',
] as const satisfies readonly PublicStatus[];

// READY 방송은 생성 후 하루 동안 목록에 올라, 시작 전에 시청자가 모일 수
// 있게 한다. 버려진 방송은 목록에서 빠지지만 종료되거나 삭제되지는
// 않는다.
export const READY_LISTED_MS = 24 * 60 * 60 * 1000;

const uuid = z.uuid();

const NO_GAME = { gameQid: null, gameName: null };

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OME_API) private readonly ome: OmeApi,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly images: ImageStore,
  ) {}

  async create(
    streamerId: string,
    { game, ...fields }: CreateBroadcastInput,
  ): Promise<BroadcastView> {
    return toView(
      await this.prisma.broadcast.create({
        data: {
          ...fields,
          ...(game ? await this.gameColumns(game) : {}),
          streamerId,
        },
        select: broadcastSelect,
      }),
    );
  }

  // 목록 게임의 이름은 클라이언트가 보낸 값이 아니라 그때의 Game.nameKo다.
  private async gameColumns(
    game: GameChoice | null,
  ): Promise<{ gameQid: string | null; gameName: string | null }> {
    if (game === null) return NO_GAME;
    if ('name' in game) return { gameQid: null, gameName: game.name };
    const listed = await this.prisma.game.findUnique({
      where: { qid: game.qid },
      select: { nameKo: true },
    });
    if (!listed) throw new BadRequestException(UNKNOWN_GAME_MESSAGE);
    return { gameQid: game.qid, gameName: listed.nameKo };
  }

  // 공개 목록, 또는 채널 페이지용으로 그중 한 스트리머의 몫.
  // 둘 다 같은 status 규칙을 따른다.
  async listPublic({
    status,
    streamerId,
  }: { status?: PublicStatus; streamerId?: string } = {}): Promise<
    BroadcastView[]
  > {
    const listedSince = new Date(this.clock.now().getTime() - READY_LISTED_MS);
    const groups = await Promise.all(
      (status ? [status] : PUBLIC_STATUSES).map((s) =>
        this.prisma.broadcast.findMany({
          where:
            s === 'READY'
              ? { streamerId, status: s, createdAt: { gt: listedSince } }
              : { streamerId, status: s },
          orderBy: [
            { startedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          take: PUBLIC_LIST_LIMIT,
          select: broadcastSelect,
        }),
      ),
    );
    return groups.flat().slice(0, PUBLIC_LIST_LIMIT).map(toView);
  }

  async listReplays(): Promise<BroadcastView[]> {
    const rows = await this.prisma.broadcast.findMany({
      where: { status: 'ENDED', recordingFiles: { isEmpty: false } },
      orderBy: { endedAt: 'desc' },
      take: PUBLIC_LIST_LIMIT,
      select: broadcastSelect,
    });
    return rows.map(toView);
  }

  async listByStreamer(streamerId: string): Promise<BroadcastView[]> {
    const rows = await this.prisma.broadcast.findMany({
      where: { streamerId },
      orderBy: { createdAt: 'desc' },
      select: broadcastSelect,
    });
    return rows.map(toView);
  }

  // 형식이 틀린 id는 어떤 방송도 가리키지 않으므로 모르는 id와 같은 404를
  // 받는다. 먼저 확인하면 Postgres가 uuid가 아닌 값을 거부하는 일도 막는다.
  async get(id: string): Promise<BroadcastView> {
    const broadcast = uuid.safeParse(id).success
      ? await this.prisma.broadcast.findUnique({
          where: { id },
          select: broadcastSelect,
        })
      : null;
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    return toView(broadcast);
  }

  async streamerIdOf(id: string): Promise<string> {
    const broadcast = uuid.safeParse(id).success
      ? await this.prisma.broadcast.findUnique({
          where: { id },
          select: { streamerId: true },
        })
      : null;
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    return broadcast.streamerId;
  }

  // 제목·설명·카테고리·게임은 status 생애주기에 속하지 않는다. 그래서 LIVE를
  // 포함한 모든 status에서 수정을 받는다. 카테고리를 GAME이 아닌 것으로 바꾸면
  // 게임을 비운다.
  async update(
    id: string,
    { game, ...fields }: UpdateBroadcastInput,
  ): Promise<BroadcastView> {
    const columns: { gameQid?: string | null; gameName?: string | null } =
      fields.category !== undefined && fields.category !== 'GAME'
        ? NO_GAME
        : game === undefined
          ? {}
          : await this.gameColumns(game);
    // 본문에 카테고리 없이 게임을 붙이면 저장된 카테고리가 GAME이어야 한다.
    // 따로 읽지 않고 같은 UPDATE의 조건으로 확인해서, 그사이 다른 요청이
    // 카테고리를 바꿔도 CHECK 위반(500)이 아니라 400이 된다.
    const needsGameCategory =
      fields.category === undefined && columns.gameName != null;
    try {
      return toView(
        await this.prisma.broadcast.update({
          where: needsGameCategory ? { id, category: 'GAME' } : { id },
          data: { ...fields, ...columns },
          select: broadcastSelect,
        }),
      );
    } catch (error) {
      if (!isRecordNotFound(error)) throw error;
      if (
        needsGameCategory &&
        (await this.prisma.broadcast.count({ where: { id } })) > 0
      ) {
        throw new BadRequestException(GAME_NEEDS_GAME_CATEGORY_MESSAGE);
      }
      throw new NotFoundException('Broadcast not found');
    }
  }

  // PRD §7.4: OME가 스트림을 끊기 전에 데이터베이스가 먼저 ENDED가 된다. 그래서
  // 그 사이에 다시 연결하는 송출자는 Admission Webhook에서 거부된다.
  // 순서를 뒤집으면 다시 끼어들 수 있다. ENDED 방송에도 끊기를 다시
  // 보내므로, 끊기에 실패한 뒤 재시도하면 같은 상태로 수렴한다. 녹화 중지는
  // 맨 마지막이고 실패해도 된다. RecordingReconciler가 방송이 더 이상
  // LIVE가 아닌 작업을 모두 멈춘다.
  async end(id: string): Promise<BroadcastView> {
    await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    const broadcast = await this.get(id);
    // §7.4에는 READY → ENDED 전이가 없다. READY 방송은 대신 삭제한다.
    if (broadcast.status === 'READY') {
      throw new ConflictException(END_READY_MESSAGE);
    }
    try {
      await this.ome.dropStream(id);
    } catch (error) {
      this.logger.error(`Dropping the stream of ${id} failed`, error);
      throw new BadGatewayException(DROP_STREAM_FAILED_MESSAGE);
    }
    try {
      await this.ome.stopRecord(id);
    } catch (error) {
      this.logger.error(`Stopping the recording of ${id} failed`, error);
    }
    return broadcast;
  }

  // READY 방송은 스트림을 가진 적이 없으므로 바로 삭제한다. 그 밖의
  // 방송은 먼저 종료한다. 이때 앞서 스트림 끊기에 실패한 ENDED 방송의
  // 끊기도 다시 시도한다. 방송은 한 번 READY를 벗어나면
  // 돌아오지 않으므로, 조건부 삭제가 종료와 경합할 일이 없다.
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.broadcast.deleteMany({
      where: { id, status: 'READY' },
    });
    if (count === 0) {
      await this.end(id);
      await this.prisma.broadcast.deleteMany({ where: { id } });
    }
    // 방송은 이미 없으므로, 남은 폴더는 디스크 공간만 차지할 뿐이다.
    // 그 때문에 삭제를 실패시킬 가치는 없다.
    try {
      await this.images.removeThumbnail(id);
    } catch (error) {
      this.logger.error(`Removing the thumbnail of ${id} failed`, error);
    }
  }

  // 업데이트에서 LIVE 확인을 한 번 더 한다. 그래서 업로드 도중 끝난 방송은
  // 시각을 그대로 유지한다. 파일은 여전히 교체될 수 있지만, 그래 봐야
  // 예전 URL 아래 조금 더 최근 프레임이 보일 뿐이다.
  async saveThumbnail(id: string, bytes: Uint8Array): Promise<void> {
    const { status } = await this.get(id);
    if (status !== 'LIVE') {
      throw new ConflictException(THUMBNAIL_NOT_LIVE_MESSAGE);
    }
    await this.images.writeThumbnail(id, bytes);
    await this.prisma.broadcast.updateMany({
      where: { id, status: 'LIVE' },
      data: { thumbnailUpdatedAt: this.clock.now() },
    });
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
