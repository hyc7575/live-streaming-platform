import { open, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../database/database.module.js';
import { OME_API, type OmeApi } from '../ome/ome-api.js';
import {
  parseRecordingInfo,
  readVideoSeconds,
  recordingStartedAt,
  type RecordingInfoEntry,
} from './recording-info.js';
import {
  planRecordings,
  type RecordingDir,
  type RecordingFile,
} from './recording-plan.js';
import {
  RECORDINGS_CONFIG,
  type RecordingsConfig,
} from './recordings-config.js';

export const RECONCILE_INTERVAL_MS = Symbol('RECONCILE_INTERVAL_MS');
export const DEFAULT_RECONCILE_INTERVAL_MS = 30_000;

const uuid = z.uuid();

// Converges OME's recording tasks, the recordings directory and
// Broadcast.recordingFiles with recordingStartedAt. Every step the lifecycle
// hooks may miss (a failed startRecord or stopRecord, a file finalized after
// the broadcast ended, a deleted broadcast) is settled here on the next tick.
@Injectable()
export class RecordingReconciler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecordingReconciler.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OME_API) private readonly ome: OmeApi,
    @Inject(RECORDINGS_CONFIG) private readonly config: RecordingsConfig,
    @Inject(RECONCILE_INTERVAL_MS) private readonly intervalMs: number | null,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs === null) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  private tick(): void {
    if (this.running) return;
    this.running = this.reconcile()
      .catch((error: unknown) =>
        this.logger.error('Reconciling recordings failed', error),
      )
      .finally(() => {
        this.running = null;
      });
  }

  async reconcile(): Promise<void> {
    await this.convergeTasks();
    await this.convergeFiles();
  }

  // Tasks are listed before the LIVE broadcasts are read. A broadcast that
  // goes LIVE in between starts its own task, and one that ends in between
  // may get a task here that the next tick stops again.
  private async convergeTasks(): Promise<void> {
    let tasks: string[];
    try {
      tasks = await this.ome.listRecords();
    } catch (error) {
      this.logger.warn(
        'Skipping recording tasks: OME did not list them',
        error,
      );
      return;
    }
    const live = await this.prisma.broadcast.findMany({
      where: { status: 'LIVE' },
      select: { id: true },
    });
    const liveIds = new Set(live.map((b) => b.id));
    for (const id of tasks.filter((task) => !liveIds.has(task))) {
      await this.attempt(`Stopping the recording of ${id}`, () =>
        this.ome.stopRecord(id),
      );
    }
    for (const id of [...liveIds].filter((id) => !tasks.includes(id))) {
      await this.attempt(`Starting the recording of ${id}`, () =>
        this.ome.startRecord(id),
      );
    }
  }

  // The disk is read before the rows: a directory exists only after its
  // broadcast went LIVE, so a directory without a row means a deleted one.
  private async convergeFiles(): Promise<void> {
    const dirs = await readRecordingDirs(this.config.dir);
    const rows = await this.prisma.broadcast.findMany({
      where: {
        OR: [
          { id: { in: dirs.map((dir) => dir.broadcastId) } },
          { recordingFiles: { isEmpty: false } },
        ],
      },
      select: {
        id: true,
        status: true,
        endedAt: true,
        recordingFiles: true,
        recordingStartedAt: true,
      },
    });
    const plan = planRecordings(dirs, rows, this.config.maxBytes);

    // The columns are cleared first so a listed replay never points at a
    // deleted file.
    for (const id of plan.evict) {
      await this.prisma.broadcast.updateMany({
        where: { id },
        data: { recordingFiles: [], recordingStartedAt: [] },
      });
      await this.removeDir(id);
      this.logger.log(`Evicted the recording of ${id} to stay under the cap`);
    }
    for (const id of plan.remove) {
      await this.removeDir(id);
    }
    for (const { id, files, startedAt } of plan.setFiles) {
      await this.prisma.broadcast.updateMany({
        where: { id },
        data: { recordingFiles: files, recordingStartedAt: startedAt },
      });
    }
    if (plan.overCapBytes > 0) {
      this.logger.warn(
        `Recordings exceed the cap by ${plan.overCapBytes} bytes with only LIVE or unfinished recordings left`,
      );
    }
  }

  private removeDir(broadcastId: string): Promise<void> {
    return rm(join(this.config.dir, broadcastId), {
      recursive: true,
      force: true,
    });
  }

  private async attempt(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`${what} failed`, error);
    }
  }
}

// A missing root reads as no recordings yet. Directories whose name is not a
// broadcast id are left alone.
export async function readRecordingDirs(root: string): Promise<RecordingDir[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(
    (error: unknown) => {
      if (isNotFound(error)) return [];
      throw error;
    },
  );
  const dirs: RecordingDir[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !uuid.safeParse(entry.name).success) continue;
    dirs.push({
      broadcastId: entry.name,
      files: await readFiles(root, entry.name),
    });
  }
  return dirs;
}

async function readFiles(
  root: string,
  broadcastId: string,
): Promise<RecordingFile[]> {
  const dir = join(root, broadcastId);
  const names = await readdir(dir);
  const info = await readInfo(dir, names);
  const files: RecordingFile[] = [];
  for (const name of names) {
    // OME renames tmp_ files as it finalizes them, so a listed name may be
    // gone by the time it is read. The next tick sees the new name.
    const stats = await stat(join(dir, name)).catch(nullIfNotFound);
    if (!stats?.isFile()) continue;
    const entry = name.endsWith('.mp4')
      ? info.get(`${broadcastId}/${name}`)
      : undefined;
    files.push({
      name,
      bytes: stats.size,
      mtimeMs: stats.mtimeMs,
      startedAt: entry ? await readStartedAt(join(dir, name), entry) : null,
    });
  }
  return files;
}

// Every transaction's XML in the directory, keyed by file. A restarted
// recording task starts a new transaction and so a new XML.
async function readInfo(
  dir: string,
  names: string[],
): Promise<Map<string, RecordingInfoEntry>> {
  const info = new Map<string, RecordingInfoEntry>();
  for (const name of names.filter((name) => name.endsWith('.xml'))) {
    const xml = await readFile(join(dir, name), 'utf8').catch(nullIfNotFound);
    for (const entry of xml === null ? [] : parseRecordingInfo(xml)) {
      info.set(entry.file, entry);
    }
  }
  return info;
}

async function readStartedAt(
  path: string,
  entry: RecordingInfoEntry,
): Promise<Date | null> {
  const handle = await open(path, 'r').catch(nullIfNotFound);
  if (!handle) return null;
  try {
    const { size } = await handle.stat();
    const seconds = await readVideoSeconds(async (offset, length) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    }, size);
    return seconds === null ? null : recordingStartedAt(entry, seconds);
  } finally {
    await handle.close();
  }
}

function nullIfNotFound(error: unknown): null {
  if (isNotFound(error)) return null;
  throw error;
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
