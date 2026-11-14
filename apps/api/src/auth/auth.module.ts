import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoggedInGuard } from './logged-in.guard.js';
import {
  SESSION_STORE,
  sessionStoreProvider,
  type SessionStore,
} from './session.js';
import { TestAccountsController } from './test-accounts.controller.js';
import {
  TEST_ACCOUNTS_CONFIG,
  testAccountsConfigFromEnv,
} from './test-accounts.js';

@Module({
  // 라우트마다 @Throttle로 자기 한도를 정한다. 이 기본값은 쓰이지 않는다.
  imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }])],
  controllers: [AuthController, TestAccountsController],
  providers: [
    AuthService,
    LoggedInGuard,
    sessionStoreProvider,
    {
      provide: TEST_ACCOUNTS_CONFIG,
      useFactory: () => testAccountsConfigFromEnv(process.env),
    },
  ],
  exports: [LoggedInGuard, SESSION_STORE, TEST_ACCOUNTS_CONFIG],
})
export class AuthModule implements OnModuleDestroy {
  constructor(@Inject(SESSION_STORE) private readonly store: SessionStore) {}

  // 공유 풀이 닫히기 전에 만료 세션 정리 타이머를 멈춘다.
  onModuleDestroy(): void {
    this.store.close();
  }
}
