import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { CommentsService } from './comments.service.js';

// Lets only the author of the comment named by `:commentId` through, the way
// BroadcastOwnerGuard does for broadcasts. List it after LoggedInGuard. A
// missing comment is 404 and someone else's is 403, the streamer of the
// broadcast included (PRD §7.5).
@Injectable()
export class CommentAuthorGuard implements CanActivate {
  constructor(private readonly comments: CommentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new Error('CommentAuthorGuard must run after LoggedInGuard');
    }
    const { commentId } = req.params;
    const authorId = await this.comments.authorIdOf(
      typeof commentId === 'string' ? commentId : '',
    );
    if (authorId !== req.user.id) throw new ForbiddenException();
    return true;
  }
}
