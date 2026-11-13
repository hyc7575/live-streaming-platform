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
  // Each route sets its own limit with @Throttle; this default is unused.
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

  // Stops the expired-session prune timer before the shared pool closes.
  onModuleDestroy(): void {
    this.store.close();
  }
}
