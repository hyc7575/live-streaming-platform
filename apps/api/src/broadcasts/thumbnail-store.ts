import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';

export const THUMBNAILS_DIR = Symbol('THUMBNAILS_DIR');

// Resolves to the repository root from both src/broadcasts and
// dist/broadcasts, which sit at the same depth.
const DEFAULT_DIR = fileURLToPath(
  new URL('../../../../thumbnails/', import.meta.url),
);

export function thumbnailsDirFromEnv(
  env: Record<string, string | undefined>,
): string {
  return resolve(env.THUMBNAILS_DIR || DEFAULT_DIR);
}

export function thumbnailUrl(
  broadcastId: string,
  updatedAt: Date | null,
): string | null {
  return updatedAt
    ? `/thumbnails/${broadcastId}/live.jpg?v=${updatedAt.getTime()}`
    : null;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// One folder per broadcast, holding live.jpg. The server picks every file
// name, so nothing the client sends reaches the path.
@Injectable()
export class ThumbnailStore {
  constructor(@Inject(THUMBNAILS_DIR) private readonly dir: string) {}

  // Writing beside the target and renaming over it means a reader sees the
  // old image or the new one, never a half-written file.
  async write(broadcastId: string, bytes: Uint8Array): Promise<void> {
    const folder = join(this.dir, broadcastId);
    await mkdir(folder, { recursive: true });
    const tmp = join(folder, `.live-${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, bytes);
      await rename(tmp, join(folder, 'live.jpg'));
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }

  async remove(broadcastId: string): Promise<void> {
    await rm(join(this.dir, broadcastId), { recursive: true, force: true });
  }
}
