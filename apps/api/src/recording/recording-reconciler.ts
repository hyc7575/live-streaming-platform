import { readdir, rm, stat } from 'node:fs/promises';
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
// Broadcast.recordingFiles. Every step the lifecycle hooks may miss (a failed
// startRecord or stopRecord, a file finalized after the broadcast ended, a
// deleted broadcast) is settled here on the next tick.
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
      select: { id: true, status: true, endedAt: true, recordingFiles: true },
    });
    const plan = planRecordings(dirs, rows, this.config.maxBytes);

    // The column is cleared first so a listed replay never points at a
    // deleted file.
    for (const id of plan.evict) {
      await this.prisma.broadcast.updateMany({
        where: { id },
        data: { recordingFiles: [] },
      });
      await this.removeDir(id);
      this.logger.log(`Evicted the recording of ${id} to stay under the cap`);
    }
    for (const id of plan.remove) {
      await this.removeDir(id);
    }
    for (const { id, files } of plan.setFiles) {
      await this.prisma.broadcast.updateMany({
        where: { id },
        data: { recordingFiles: files },
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
      files: await readFiles(join(root, entry.name)),
    });
  }
  return dirs;
}

async function readFiles(dir: string): Promise<RecordingFile[]> {
  const files: RecordingFile[] = [];
  for (const name of await readdir(dir)) {
    // OME renames tmp_ files as it finalizes them, so a listed name may be
    // gone by the time it is read. The next tick sees the new name.
    const stats = await stat(join(dir, name)).catch((error: unknown) => {
      if (isNotFound(error)) return null;
      throw error;
    });
    if (stats?.isFile()) {
      files.push({ name, bytes: stats.size, mtimeMs: stats.mtimeMs });
    }
  }
  return files;
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
