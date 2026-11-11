import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { BroadcastView } from '../src/broadcasts/broadcasts.service.js';
import { PrismaService } from '../src/database/database.module.js';
import type { BroadcastStatus } from '../src/generated/prisma/client.js';
import type { RecordingReconciler } from '../src/recording/recording-reconciler.js';
import type { RecordingsConfig } from '../src/recording/recordings-config.js';
import {
  createTestApp,
  reconcilerOf,
  resetDatabase,
  signUp,
  type TestUser,
} from './support/app.js';
import { fakeOmeApiOf, type FakeOmeApi } from './support/fake-ome-api.js';
import { omeMp4 } from './support/mp4.js';

describe('recording reconciler', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ome: FakeOmeApi;
  let reconciler: RecordingReconciler;
  let config: RecordingsConfig;
  let streamer: TestUser;

  beforeAll(async () => {
    config = {
      dir: await mkdtemp(join(tmpdir(), 'lsp-recordings-')),
      maxBytes: 1024 ** 3,
    };
    app = await createTestApp({ recordings: config });
    prisma = app.get(PrismaService);
    ome = fakeOmeApiOf(app);
    reconciler = reconcilerOf(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ome.reset();
    await rm(config.dir, { recursive: true, force: true });
    await mkdir(config.dir);
    config.maxBytes = 1024 ** 3;
    streamer = await signUp(app);
  });

  afterAll(async () => {
    await app.close();
    await rm(config.dir, { recursive: true, force: true });
  });

  async function seed(
    status: BroadcastStatus,
    endedAt: Date | null = status === 'ENDED' ? new Date() : null,
  ): Promise<string> {
    const row = await prisma.broadcast.create({
      data: {
        streamerId: streamer.id,
        title: `${status} 방송`,
        status,
        startedAt: status === 'READY' ? null : new Date(),
        endedAt,
      },
    });
    return row.id;
  }

  // Writes a file the way OME leaves it, with an mtime in seconds since the
  // epoch so recording order is under the test's control.
  async function record(
    id: string,
    name: string,
    mtime: number,
    bytes = 10,
  ): Promise<void> {
    await mkdir(join(config.dir, id), { recursive: true });
    const path = join(config.dir, id, name);
    await writeFile(path, Buffer.alloc(bytes));
    await utimes(path, mtime, mtime);
  }

  // A part OME finished, with a video track of the given length.
  async function recordPart(
    id: string,
    name: string,
    mtime: number,
    videoSeconds: number,
  ): Promise<void> {
    await mkdir(join(config.dir, id), { recursive: true });
    const path = join(config.dir, id, name);
    await writeFile(path, omeMp4(videoSeconds));
    await utimes(path, mtime, mtime);
  }

  async function writeInfo(
    id: string,
    transaction: string,
    parts: { recordTime: number; startTime: string }[],
  ): Promise<void> {
    const files = parts.map(
      ({ recordTime, startTime }, sequence) => `  <file>
    <transactionId>${transaction}</transactionId>
    <stream>${id}</stream>
    <filePath><![CDATA[/${id}/${transaction}_${sequence}.mp4]]></filePath>
    <recordTime>${recordTime}</recordTime>
    <sequence>${sequence}</sequence>
    <startTime>${startTime}</startTime>
    <finishTime>2026-11-11T06:40:00.000+00:00</finishTime>
  </file>`,
    );
    await writeFile(
      join(config.dir, id, `${transaction}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>\n<files>\n${files.join('\n')}\n</files>\n`,
    );
  }

  const viewOf = async (target: NestExpressApplication, id: string) => {
    const res = await request(target.getHttpServer()).get(
      `/api/broadcasts/${id}`,
    );
    expect(res.status).toBe(200);
    return res.body as BroadcastView;
  };

  const filesOf = async (id: string) =>
    (await prisma.broadcast.findUniqueOrThrow({ where: { id } }))
      .recordingFiles;

  const replayIds = async () => {
    const res = await request(app.getHttpServer()).get('/api/replays');
    expect(res.status).toBe(200);
    return (res.body as BroadcastView[]).map((b) => b.id);
  };

  describe('recording tasks', () => {
    it('starts a LIVE broadcast without a task and stops a task of a broadcast that is not LIVE', async () => {
      const live = await seed('LIVE');
      const ended = await seed('ENDED');
      ome.records = [ended];
      await reconciler.reconcile();
      expect(ome.records).toEqual([live]);
      expect(ome.recordCalls).toEqual([
        { kind: 'stop', broadcastId: ended, statusAtCall: 'ENDED' },
        { kind: 'start', broadcastId: live, statusAtCall: 'LIVE' },
      ]);
    });

    it('leaves a LIVE broadcast that already has its task', async () => {
      const live = await seed('LIVE');
      ome.records = [live];
      await reconciler.reconcile();
      expect(ome.recordCalls).toEqual([]);
    });

    it('still settles the files when OME cannot list its tasks', async () => {
      const id = await seed('ENDED');
      await record(id, '1_0.mp4', 1000);
      ome.recordFailing = true;
      await reconciler.reconcile();
      expect(await filesOf(id)).toEqual([`${id}/1_0.mp4`]);
    });
  });

  describe('files', () => {
    it('lists every finished part of an ENDED broadcast and shows it as a replay', async () => {
      const id = await seed('ENDED');
      await record(id, '7_1.mp4', 2000);
      await record(id, '7_0.mp4', 1000);
      await writeFile(join(config.dir, id, '7.xml'), '<info/>');
      await reconciler.reconcile();
      expect(await filesOf(id)).toEqual([`${id}/7_0.mp4`, `${id}/7_1.mp4`]);
      expect(await replayIds()).toEqual([id]);
    });

    it('waits for OME to finish writing before listing the parts', async () => {
      const id = await seed('ENDED');
      await record(id, '7_0.mp4', 1000);
      await record(id, 'tmp_5b2c', 2000);
      await reconciler.reconcile();
      expect(await filesOf(id)).toEqual([]);
      expect(await replayIds()).toEqual([]);

      await rename(
        join(config.dir, id, 'tmp_5b2c'),
        join(config.dir, id, '7_1.mp4'),
      );
      await reconciler.reconcile();
      expect(await filesOf(id)).toEqual([`${id}/7_0.mp4`, `${id}/7_1.mp4`]);
    });

    it('does not list a LIVE broadcast’s recording yet', async () => {
      const id = await seed('LIVE');
      await record(id, '7_0.mp4', 1000);
      await reconciler.reconcile();
      expect(await filesOf(id)).toEqual([]);
      expect(existsSync(join(config.dir, id))).toBe(true);
    });

    it('clears the files of a broadcast whose directory is gone', async () => {
      const id = await seed('ENDED');
      await prisma.broadcast.update({
        where: { id },
        data: { recordingFiles: [`${id}/7_0.mp4`] },
      });
      await reconciler.reconcile();
      expect(await filesOf(id)).toEqual([]);
    });

    it('deletes the directory of a deleted broadcast and leaves other directories', async () => {
      const deleted = '00000000-0000-4000-8000-000000000000';
      await record(deleted, '7_0.mp4', 1000);
      await mkdir(join(config.dir, 'not-a-broadcast'));
      await reconciler.reconcile();
      expect(existsSync(join(config.dir, deleted))).toBe(false);
      expect(existsSync(join(config.dir, 'not-a-broadcast'))).toBe(true);
    });

    it('reads a missing recordings directory as empty', async () => {
      const id = await seed('ENDED');
      await prisma.broadcast.update({
        where: { id },
        data: { recordingFiles: [`${id}/7_0.mp4`] },
      });
      await rm(config.dir, { recursive: true });
      await reconciler.reconcile();
      expect(await filesOf(id)).toEqual([]);
    });
  });

  describe('starts', () => {
    async function recordTwoParts(id: string): Promise<void> {
      await recordPart(id, 'Tx_0.mp4', 1000, 13.248);
      await recordPart(id, 'Tx_1.mp4', 2000, 13.271);
    }

    it('shows when each part’s video starts and keeps the file list', async () => {
      const id = await seed('ENDED');
      await recordTwoParts(id);
      await writeInfo(id, 'Tx', [
        { recordTime: 15347, startTime: '2026-11-11T06:37:51.739+00:00' },
        { recordTime: 15480, startTime: '2026-11-11T06:38:49.479+00:00' },
      ]);
      await reconciler.reconcile();
      const view = await viewOf(app, id);
      expect(view.recordingFiles).toEqual([`${id}/Tx_0.mp4`, `${id}/Tx_1.mp4`]);
      expect(view.recordingParts).toEqual([
        { file: `${id}/Tx_0.mp4`, startedAt: '2026-11-11T06:37:53.838Z' },
        { file: `${id}/Tx_1.mp4`, startedAt: '2026-11-11T06:38:51.688Z' },
      ]);
      expect(view).not.toHaveProperty('recordingStartedAt');
    });

    it('shows no start for any part when a part is missing from the XML', async () => {
      const id = await seed('ENDED');
      await recordTwoParts(id);
      await writeInfo(id, 'Tx', [
        { recordTime: 15347, startTime: '2026-11-11T06:37:51.739+00:00' },
      ]);
      await reconciler.reconcile();
      expect((await viewOf(app, id)).recordingParts).toEqual([
        { file: `${id}/Tx_0.mp4`, startedAt: null },
        { file: `${id}/Tx_1.mp4`, startedAt: null },
      ]);
    });

    it('fills the starts in once the XML shows up', async () => {
      const id = await seed('ENDED');
      await recordTwoParts(id);
      await reconciler.reconcile();
      expect((await viewOf(app, id)).recordingParts).toEqual([
        { file: `${id}/Tx_0.mp4`, startedAt: null },
        { file: `${id}/Tx_1.mp4`, startedAt: null },
      ]);

      await writeInfo(id, 'Tx', [
        { recordTime: 15347, startTime: '2026-11-11T06:37:51.739+00:00' },
        { recordTime: 15480, startTime: '2026-11-11T06:38:49.479+00:00' },
      ]);
      await reconciler.reconcile();
      expect(
        (await viewOf(app, id)).recordingParts.map((part) => part.startedAt),
      ).toEqual(['2026-11-11T06:37:53.838Z', '2026-11-11T06:38:51.688Z']);
    });

    it('keeps the starts across a restart without the disk', async () => {
      const id = await seed('ENDED');
      await recordTwoParts(id);
      await writeInfo(id, 'Tx', [
        { recordTime: 15347, startTime: '2026-11-11T06:37:51.739+00:00' },
        { recordTime: 15480, startTime: '2026-11-11T06:38:49.479+00:00' },
      ]);
      await reconciler.reconcile();
      await rm(join(config.dir, id), { recursive: true });
      const restarted = await createTestApp({ recordings: config });
      try {
        expect(
          (await viewOf(restarted, id)).recordingParts.map(
            (part) => part.startedAt,
          ),
        ).toEqual(['2026-11-11T06:37:53.838Z', '2026-11-11T06:38:51.688Z']);
      } finally {
        await restarted.close();
      }
    });

    it('clears the starts with the files when the recording is evicted', async () => {
      const id = await seed('ENDED');
      await recordTwoParts(id);
      await writeInfo(id, 'Tx', [
        { recordTime: 15347, startTime: '2026-11-11T06:37:51.739+00:00' },
        { recordTime: 15480, startTime: '2026-11-11T06:38:49.479+00:00' },
      ]);
      await reconciler.reconcile();
      config.maxBytes = 10;
      await reconciler.reconcile();
      const row = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
      expect(row.recordingFiles).toEqual([]);
      expect(row.recordingStartedAt).toEqual([]);
    });

    it('refuses starts that do not match the files one for one', async () => {
      const id = await seed('ENDED');
      await expect(
        prisma.broadcast.update({
          where: { id },
          data: {
            recordingFiles: [`${id}/Tx_0.mp4`, `${id}/Tx_1.mp4`],
            recordingStartedAt: [new Date()],
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('cap', () => {
    it('deletes the oldest ENDED recordings first and never a LIVE one', async () => {
      const oldest = await seed('ENDED', new Date('2026-11-01T00:00:00Z'));
      const newer = await seed('ENDED', new Date('2026-11-02T00:00:00Z'));
      const live = await seed('LIVE');
      await record(oldest, '1_0.mp4', 1000, 40);
      await record(newer, '1_0.mp4', 1000, 40);
      await record(live, 'tmp_1', 1000, 40);
      await reconciler.reconcile();
      expect(await replayIds()).toEqual([newer, oldest]);

      config.maxBytes = 90;
      await reconciler.reconcile();
      expect(existsSync(join(config.dir, oldest))).toBe(false);
      expect(await filesOf(oldest)).toEqual([]);
      expect(await replayIds()).toEqual([newer]);
      expect(existsSync(join(config.dir, live))).toBe(true);

      config.maxBytes = 10;
      await reconciler.reconcile();
      expect(await replayIds()).toEqual([]);
      expect(existsSync(join(config.dir, live, 'tmp_1'))).toBe(true);
    });
  });
});

describe('reconcile timer', () => {
  it('reconciles on its own every interval until the app closes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lsp-recordings-'));
    const app = await createTestApp({
      recordings: { dir, maxBytes: 1024 ** 3 },
      reconcileIntervalMs: 20,
    });
    await resetDatabase(app);
    const user = await signUp(app);
    const { id } = await app.get(PrismaService).broadcast.create({
      data: { streamerId: user.id, title: '타이머', status: 'LIVE' },
    });
    await vi.waitFor(() => {
      expect(fakeOmeApiOf(app).records).toEqual([id]);
    });
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
});
