import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../database/database.module.js';
import { authUserSelect, toAuthUser, type AuthUser } from './auth-user.js';

// 살아 있는 세션이 없는 요청을 401로 거부하고, 세션의 사용자를
// `@CurrentUser()`용으로 `req.user`에 넣는다. 소유권 확인은 이 뒤에 돈다.
@Injectable()
export class LoggedInGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.session.userId;
    if (!userId) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    });
    if (!user) throw new UnauthorizedException();
    req.user = toAuthUser(user);
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) {
      throw new Error('@CurrentUser() requires @UseGuards(LoggedInGuard)');
    }
    return user;
  },
);
