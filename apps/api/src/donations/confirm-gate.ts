import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

// Toss 응답을 기다리는 확정 transaction의 동시 상한. 확정은 그동안 공유 pg pool
// 연결 하나를 쥔다(`database.module.ts`의 PG_POOL_MAX 10개 중). 상한 3이면
// 7개 이상이 늘 세션 로드와 다른 쿼리에 남는다(#215).
export const CONFIRM_CONCURRENCY = 3;

// 확정 라우트의 사용자별 요청 제한. 성공 페이지는 열릴 때마다 한 번 확정하므로
// 새로고침 몇 번과 두 탭에 충분하다. 넘으면 Toss를 부르기 전에 429다.
export const CONFIRM_RATE_LIMIT = { limit: 20, ttl: 60_000 };

// 결제 확정(라임 충전, 카드 후원)이 transaction에 들어가는 순서를 정한다.
// - 같은 사용자의 확정은 도착한 순서대로 하나씩 들어간다. 기다리는 쪽은
//   연결을 잡지 않는다. 같은 주문의 동시 확정은 앞의 것이 끝난 뒤 주문이
//   이미 확정된 것을 보고, 지금처럼 Toss에 다시 묻지 않는다.
// - 모든 사용자를 합쳐 CONFIRM_CONCURRENCY개까지만 동시에 들어간다. 넘는 것은
//   거절하지 않고 차례를 기다린다.
// 메모리 안에서 센다. 운영 API는 프로세스 하나라 상한이 그대로 맞다.
export class ConfirmGate {
  // 사용자마다 마지막으로 줄 선 확정이 끝나는 시점. 끝나면 지운다.
  private readonly tails = new Map<string, Promise<void>>();
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(userId) ?? Promise.resolve();
    let done!: () => void;
    const tail = new Promise<void>((resolve) => {
      done = resolve;
    });
    this.tails.set(userId, tail);
    try {
      await previous;
      await this.acquire();
      try {
        return await work();
      } finally {
        this.release();
      }
    } finally {
      done();
      if (this.tails.get(userId) === tail) this.tails.delete(userId);
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  // 기다리는 쪽이 있으면 자리를 그대로 넘긴다.
  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active -= 1;
  }
}

// 요청 제한을 IP가 아니라 로그인 사용자로 센다. 같은 공유기 뒤의 다른 사용자는
// 서로의 한도를 쓰지 않는다. LoggedInGuard 뒤에 둔다.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = (req as unknown as Request).session?.userId;
    return Promise.resolve(userId ? `user:${userId}` : String(req.ip));
  }
}
