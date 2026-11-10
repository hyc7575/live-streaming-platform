import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { IMAGE_FORMATS, type ImageFormat } from './image-rules.js';

export const THUMBNAILS_DIR = Symbol('THUMBNAILS_DIR');

// Resolves to the repository root from both src/images and dist/images,
// which sit at the same depth.
const DEFAULT_DIR = fileURLToPath(
  new URL('../../../../thumbnails/', import.meta.url),
);

export function thumbnailsDirFromEnv(
  env: Record<string, string | undefined>,
): string {
  return resolve(env.THUMBNAILS_DIR || DEFAULT_DIR);
}

// The folder layout, shared by the writes and the URLs the static server
// answers. Broadcast ids are uuids, so no broadcast folder is named `users`.
const STANDBY_NAME = 'standby';
const thumbnailPath = (broadcastId: string) => [broadcastId, 'live.jpg'];
const standbyFolder = (userId: string) => ['users', userId];
const standbyPath = (userId: string, ext: string) => [
  ...standbyFolder(userId),
  `${STANDBY_NAME}.${ext}`,
];

function publicUrl(path: string[], updatedAt: Date): string {
  return `/thumbnails/${path.join('/')}?v=${updatedAt.getTime()}`;
}

export function thumbnailUrl(
  broadcastId: string,
  updatedAt: Date | null,
): string | null {
  return updatedAt ? publicUrl(thumbnailPath(broadcastId), updatedAt) : null;
}

export function standbyImageUrl(
  userId: string,
  ext: string | null,
  updatedAt: Date | null,
): string | null {
  return ext && updatedAt
    ? publicUrl(standbyPath(userId, ext), updatedAt)
    : null;
}

// The server picks every file name, so nothing the client sends reaches the
// path.
@Injectable()
export class ImageStore {
  constructor(@Inject(THUMBNAILS_DIR) private readonly dir: string) {}

  writeThumbnail(broadcastId: string, bytes: Uint8Array): Promise<void> {
    return this.write(thumbnailPath(broadcastId), bytes);
  }

  async removeThumbnail(broadcastId: string): Promise<void> {
    await rm(join(this.dir, broadcastId), { recursive: true, force: true });
  }

  async writeStandby(
    userId: string,
    format: ImageFormat,
    bytes: Uint8Array,
  ): Promise<string> {
    const { ext } = IMAGE_FORMATS[format];
    await this.write(standbyPath(userId, ext), bytes);
    return ext;
  }

  // Removes every standby file but the one with extension `keep`, or all of
  // them when `keep` is null.
  async pruneStandby(userId: string, keep: string | null): Promise<void> {
    const folder = join(this.dir, ...standbyFolder(userId));
    const names = await readdir(folder).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    const kept = keep && `${STANDBY_NAME}.${keep}`;
    await Promise.all(
      names
        .filter((n) => n.startsWith(`${STANDBY_NAME}.`) && n !== kept)
        .map((n) => rm(join(folder, n), { force: true })),
    );
  }

  // Writing beside the target and renaming over it means a reader sees the
  // old image or the new one, never a half-written file.
  private async write(path: string[], bytes: Uint8Array): Promise<void> {
    const target = join(this.dir, ...path);
    const folder = join(target, '..');
    await mkdir(folder, { recursive: true });
    const tmp = join(folder, `.${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, bytes);
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }
}
