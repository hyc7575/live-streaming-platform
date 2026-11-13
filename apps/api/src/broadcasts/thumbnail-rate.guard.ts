import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { CLOCK, type Clock } from '../clock.js';

export const THUMBNAIL_INTERVAL_MS = 10_000;

// 방송마다 10초에 업로드 시도 한 번. 소유자만 여기까지 오므로 IP가 아니라
// 방송 단위로 센다. 모르는 사람이 소유자의 몫을 써 버리지 못하게
// BroadcastOwnerGuard 뒤에 둔다. 여기까지 온 시도는 유효하든 아니든
// 모두 센다. 메모리에 두므로 재시작하면 마지막 10초만
// 잊는다.
@Injectable()
export class ThumbnailRateGuard implements CanActivate {
  private readonly lastAttemptMs = new Map<string, number>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  canActivate(context: ExecutionContext): boolean {
    const { id } = context.switchToHttp().getRequest<Request>().params;
    const key = typeof id === 'string' ? id : '';
    const now = this.clock.now().getTime();
    const last = this.lastAttemptMs.get(key);
    if (last !== undefined && now - last < THUMBNAIL_INTERVAL_MS) {
      throw new HttpException(
        '썸네일은 10초에 한 번만 올릴 수 있습니다.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    for (const [other, at] of this.lastAttemptMs) {
      if (now - at >= THUMBNAIL_INTERVAL_MS) this.lastAttemptMs.delete(other);
    }
    this.lastAttemptMs.set(key, now);
    return true;
  }
}
