import { Inject, Injectable } from '@nestjs/common';
import {
  authUserSelect,
  toAuthUser,
  type AuthUser,
} from '../auth/auth-user.js';
import { CLOCK, type Clock } from '../clock.js';
import { PrismaService } from '../database/database.module.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ParsedImage } from '../images/image-rules.js';
import { ImageStore, type UserImageSlot } from '../images/image-store.js';

// The User columns each slot keeps: the extension names the file, the time
// busts caches. Both null, or both set.
const SLOT_COLUMNS = {
  standby: (ext, at) => ({ standbyImageExt: ext, standbyImageUpdatedAt: at }),
  avatar: (ext, at) => ({ avatarExt: ext, avatarUpdatedAt: at }),
} satisfies Record<
  UserImageSlot,
  (ext: string | null, at: Date | null) => Prisma.UserUpdateInput
>;

// Each change writes or prunes files and then the row, in that order. Two
// changes for one user running interleaved could prune each other's file
// (a PNG upload removing the WebP that a parallel upload just recorded), so
// one user's changes run one at a time. The API runs as a single process.
@Injectable()
export class UserImageService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // The file is in place before the row names it, and the other formats are
  // pruned only once the row has moved on, so a URL never points at nothing.
  save(
    userId: string,
    slot: UserImageSlot,
    image: ParsedImage,
  ): Promise<AuthUser> {
    return this.serialize(userId, async () => {
      const ext = await this.images.writeUserImage(
        userId,
        slot,
        image.format,
        image.bytes,
      );
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: SLOT_COLUMNS[slot](ext, this.clock.now()),
        select: authUserSelect,
      });
      await this.images.pruneUserImage(userId, slot, ext);
      return toAuthUser(user);
    });
  }

  // Idempotent: removing an image that is already gone succeeds.
  remove(userId: string, slot: UserImageSlot): Promise<void> {
    return this.serialize(userId, async () => {
      await this.prisma.user.update({
        where: { id: userId },
        data: SLOT_COLUMNS[slot](null, null),
      });
      await this.images.pruneUserImage(userId, slot, null);
    });
  }

  private serialize<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(userId) ?? Promise.resolve()).then(task);
    const tail = result.catch(() => undefined);
    this.queues.set(userId, tail);
    void tail.then(() => {
      if (this.queues.get(userId) === tail) this.queues.delete(userId);
    });
    return result;
  }
}
