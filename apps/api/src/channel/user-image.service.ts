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

// 슬롯마다 User에 두는 컬럼. 확장자는 파일 이름을 정하고, 시각은
// 캐시를 깬다. 둘 다 null이거나 둘 다 값이 있다.
const SLOT_COLUMNS = {
  standby: (ext, at) => ({ standbyImageExt: ext, standbyImageUpdatedAt: at }),
  avatar: (ext, at) => ({ avatarExt: ext, avatarUpdatedAt: at }),
} satisfies Record<
  UserImageSlot,
  (ext: string | null, at: Date | null) => Prisma.UserUpdateInput
>;

// 변경마다 파일을 쓰거나 정리한 뒤 행을 바꾼다. 이 순서다. 한 사용자의
// 변경 두 개가 섞여 돌면 서로의 파일을 지울 수 있다
// (PNG 업로드가 동시 업로드가 막 기록한 WebP를 지우는 식). 그래서
// 한 사용자의 변경은 하나씩 돈다. API는 단일 프로세스로 돈다.
@Injectable()
export class UserImageService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // 행이 파일을 가리키기 전에 파일을 먼저 두고, 다른 형식의 파일은
  // 행이 바뀐 뒤에야 정리한다. 그래서 URL이 빈 곳을 가리키는 일이 없다.
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

  // 멱등: 이미 없는 이미지를 지워도 성공한다.
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
