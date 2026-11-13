import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { IMAGE_FORMATS, type ImageFormat } from './image-rules.js';

export const THUMBNAILS_DIR = Symbol('THUMBNAILS_DIR');

// src/images와 dist/images 어디서든 저장소 루트로 풀린다.
// 두 폴더의 깊이가 같기 때문이다.
const DEFAULT_DIR = fileURLToPath(
  new URL('../../../../thumbnails/', import.meta.url),
);

export function thumbnailsDirFromEnv(
  env: Record<string, string | undefined>,
): string {
  return resolve(env.THUMBNAILS_DIR || DEFAULT_DIR);
}

// 사용자마다 슬롯마다 이미지 하나: users/<id>/<slot>.<ext>. 기본 대기 이미지는
// 스트리머의 READY 방송에, 아바타는 그 스트리머의 채널에 나온다.
export const USER_IMAGE_SLOTS = ['standby', 'avatar'] as const;
export type UserImageSlot = (typeof USER_IMAGE_SLOTS)[number];

// 폴더 구조. 쓰기와, 정적 서버가 답하는 URL이 함께 쓴다.
// 방송 id는 uuid이므로 `users`라는 이름의 방송 폴더는 없다.
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

// 파일 이름은 모두 서버가 정한다. 그래서 클라이언트가 보낸 어떤 값도
// 경로에 들어가지 않는다.
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

  // `slot`의 파일 중 확장자가 `keep`인 것만 빼고 모두 지운다. `keep`이 null이면
  // 전부 지운다. 다른 슬롯의 파일은 건드리지 않는다.
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

  // 대상 옆에 쓰고 그 위로 이름을 바꾸므로, 읽는 쪽은
  // 이전 이미지나 새 이미지를 본다. 반쯤 쓰인 파일은 보지 않는다.
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
