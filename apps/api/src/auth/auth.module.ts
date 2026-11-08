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

@Module({
  // Each route sets its own limit with @Throttle; this default is unused.
  imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }])],
  controllers: [AuthController],
  providers: [AuthService, LoggedInGuard, sessionStoreProvider],
  exports: [LoggedInGuard, SESSION_STORE],
})
export class AuthModule implements OnModuleDestroy {
  constructor(@Inject(SESSION_STORE) private readonly store: SessionStore) {}

  // Stops the expired-session prune timer before the shared pool closes.
  onModuleDestroy(): void {
    this.store.close();
  }
}
