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

// One image per user per slot: users/<id>/<slot>.<ext>. The standby image
// shows on the streamer's READY broadcasts, the avatar on their channel.
export const USER_IMAGE_SLOTS = ['standby', 'avatar'] as const;
export type UserImageSlot = (typeof USER_IMAGE_SLOTS)[number];

// The folder layout, shared by the writes and the URLs the static server
// answers. Broadcast ids are uuids, so no broadcast folder is named `users`.
const thumbnailPath = (broadcastId: string) => [broadcastId, 'live.jpg'];
const userFolder = (userId: string) => ['users', userId];
const userImagePath = (userId: string, slot: UserImageSlot, ext: string) => [
  ...userFolder(userId),
  `${slot}.${ext}`,
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

export function userImageUrl(
  userId: string,
  slot: UserImageSlot,
  ext: string | null,
  updatedAt: Date | null,
): string | null {
  return ext && updatedAt
    ? publicUrl(userImagePath(userId, slot, ext), updatedAt)
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

  async writeUserImage(
    userId: string,
    slot: UserImageSlot,
    format: ImageFormat,
    bytes: Uint8Array,
  ): Promise<string> {
    const { ext } = IMAGE_FORMATS[format];
    await this.write(userImagePath(userId, slot, ext), bytes);
    return ext;
  }

  // Removes every file of `slot` but the one with extension `keep`, or all
  // of them when `keep` is null. Other slots' files are left alone.
  async pruneUserImage(
    userId: string,
    slot: UserImageSlot,
    keep: string | null,
  ): Promise<void> {
    const folder = join(this.dir, ...userFolder(userId));
    const names = await readdir(folder).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    const kept = keep && `${slot}.${keep}`;
    await Promise.all(
      names
        .filter((n) => n.startsWith(`${slot}.`) && n !== kept)
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
