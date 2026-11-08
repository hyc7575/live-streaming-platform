import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  SESSION_STORE,
  sessionMiddleware,
  type SessionSettings,
} from './auth/session.js';

export function sessionSettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SessionSettings {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
  return {
    secret: env.SESSION_SECRET,
    cookieSecure: env.NODE_ENV === 'production',
  };
}

export function configureApp(
  app: NestExpressApplication,
  session: SessionSettings,
): void {
  app.setGlobalPrefix('api');
  // Caddy terminates TLS one hop in front. Trusting that hop lets Express see
  // https (so Secure cookies are issued) and the client IP (for rate limits).
  app.set('trust proxy', 1);
  app.use(sessionMiddleware(app.get(SESSION_STORE), session));
}
