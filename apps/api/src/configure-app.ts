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
  // Caddy가 한 홉 앞에서 TLS를 종료한다. 그 홉을 신뢰하면 Express가
  // https를 알아보고(그래서 Secure 쿠키를 발급한다) 클라이언트 IP도 본다(rate limit용).
  app.set('trust proxy', 1);
  app.use(sessionMiddleware(app.get(SESSION_STORE), session));
}
