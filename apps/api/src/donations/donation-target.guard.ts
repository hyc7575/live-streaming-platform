import {
  ConflictException,
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { BroadcastsService } from '../broadcasts/broadcasts.service.js';

export const DONATION_NOT_LIVE_MESSAGE = '방송 중일 때만 후원할 수 있습니다.';
export const SELF_DONATION_MESSAGE = '내 방송에는 후원할 수 없습니다.';

// Lets a donation order for the broadcast named by `:id` through only when
// the broadcast is LIVE and the caller is not its streamer. List it after
// LoggedInGuard. Like BroadcastOwnerGuard it runs before the body pipe, so a
// streamer donating to themselves gets 403 whatever the body says.
//
// A lime donation checks its body first (PRD-lime 7.3: 401 → 400 → 404 →
// 403 → 409), so its handler calls `check` after the pipe instead of
// listing the guard.
@Injectable()
export class DonationTargetGuard implements CanActivate {
  constructor(private readonly broadcasts: BroadcastsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new Error('DonationTargetGuard must run after LoggedInGuard');
    }
    const { id } = req.params;
    await this.check(typeof id === 'string' ? id : '', req.user.id);
    return true;
  }

  // 404 for a missing broadcast, 403 for the streamer's own, 409 unless LIVE.
  // Returns the streamer, whom the donation names as its recipient.
  async check(broadcastId: string, donorId: string): Promise<string> {
    const broadcast = await this.broadcasts.get(broadcastId);
    if (broadcast.streamer.id === donorId) {
      throw new ForbiddenException(SELF_DONATION_MESSAGE);
    }
    if (broadcast.status !== 'LIVE') {
      throw new ConflictException(DONATION_NOT_LIVE_MESSAGE);
    }
    return broadcast.streamer.id;
  }
}
