import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { CommentsService } from './comments.service.js';

// `:commentId`가 가리키는 댓글의 작성자만 통과시킨다. 방송에서
// BroadcastOwnerGuard가 하는 방식과 같다. LoggedInGuard 뒤에 둔다.
// 없는 댓글은 404, 남의 댓글은 403이다. 그 방송의 스트리머도
// 예외가 아니다(PRD §7.5).
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
