import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { BroadcastsService } from './broadcasts.service.js';

// Lets only the streamer of the broadcast named by `:id` through. List it
// after LoggedInGuard, `@UseGuards(LoggedInGuard, BroadcastOwnerGuard)`, so an
// anonymous caller gets 401 before the broadcast is even looked up. A missing
// broadcast is 404 and someone else's is 403.
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
