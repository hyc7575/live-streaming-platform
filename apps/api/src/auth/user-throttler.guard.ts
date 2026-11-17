import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

// 로그인한 사용자마다 요청 수를 센다(#213). IP로 세면 한 와이파이를 쓰는
// 여러 시청자가 한도를 나눠 쓴다. `LoggedInGuard` 뒤에 둔다. 그래서
// 비로그인 요청은 401로 끝나고 한도를 쓰지 않는다.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as unknown as Request).user;
    if (!user) {
      throw new Error('UserThrottlerGuard requires LoggedInGuard before it');
    }
    return Promise.resolve(user.id);
  }
}
