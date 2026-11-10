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

// One upload attempt per broadcast every 10 s, counted per broadcast rather
// than per IP, since only the owner reaches it. List it after
// BroadcastOwnerGuard so strangers cannot use up the owner's slot. Every
// attempt that gets here counts, valid or not. In memory: a restart only
// forgets the last 10 s.
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
