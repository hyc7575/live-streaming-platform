import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { BroadcastsService } from './broadcasts.service.js';

// `:id`가 가리키는 방송의 스트리머만 통과시킨다. LoggedInGuard 뒤에
// `@UseGuards(LoggedInGuard, BroadcastOwnerGuard)`처럼 둔다. 그래야
// 익명 호출자는 방송을 찾아보기도 전에 401을 받는다. 없는
// 방송은 404, 남의 방송은 403이다.
@Injectable()
export class BroadcastOwnerGuard implements CanActivate {
  constructor(private readonly broadcasts: BroadcastsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new Error('BroadcastOwnerGuard must run after LoggedInGuard');
    }
    const { id } = req.params;
    const streamerId = await this.broadcasts.streamerIdOf(
      typeof id === 'string' ? id : '',
    );
    if (streamerId !== req.user.id) throw new ForbiddenException();
    return true;
  }
}
