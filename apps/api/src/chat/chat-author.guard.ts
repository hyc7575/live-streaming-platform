import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ChatService } from './chat.service.js';

// Lets only the author of the message named by `:messageId` through, like
// CommentAuthorGuard. List it after LoggedInGuard. A missing message is 404
// and someone else's is 403, the streamer of the broadcast included.
@Injectable()
export class ChatAuthorGuard implements CanActivate {
  constructor(private readonly chat: ChatService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new Error('ChatAuthorGuard must run after LoggedInGuard');
    }
    const { messageId } = req.params;
    const authorId = await this.chat.authorIdOf(
      typeof messageId === 'string' ? messageId : '',
    );
    if (authorId !== req.user.id) throw new ForbiddenException();
    return true;
  }
}
