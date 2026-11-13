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

// `:id`가 가리키는 방송에 대한 후원 주문을, 방송이 LIVE이고 호출자가
// 그 스트리머가 아닐 때만 통과시킨다. LoggedInGuard 뒤에
// 둔다. BroadcastOwnerGuard처럼 body pipe보다 먼저 돌므로,
// 자기 방송에 후원하는 스트리머는 body가 무엇이든 403을 받는다.
//
// 라임 후원은 body를 먼저 확인한다(PRD-lime 7.3: 401 → 400 → 404 →
// 403 → 409). 그래서 핸들러가 guard를 거는 대신 pipe 뒤에서 `check`를
// 부른다.
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

  // 방송이 없으면 404, 스트리머 본인 방송이면 403, LIVE가 아니면 409.
  // 후원이 받는 사람으로 기록할 스트리머를 돌려준다.
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
