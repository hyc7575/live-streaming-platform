import { ForbiddenException } from '@nestjs/common';
import connectPgSimple from 'connect-pg-simple';
import type { Request, RequestHandler } from 'express';
import session from 'express-session';
import type pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

export const SESSION_COOKIE_NAME = 'modak.sid';
const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionSettings {
  secret: string;
  // 브라우저는 평문 http로 온 Secure 쿠키를 버리므로 로컬 개발에서는
  // 이것을 끈다. 운영은 Caddy의 TLS 뒤에 있으므로 켠다.
  cookieSecure: boolean;
}

const PgStore = connectPgSimple(session);
export type SessionStore = InstanceType<typeof PgStore>;

export const SESSION_STORE = Symbol('SESSION_STORE');

export const sessionStoreProvider = {
  provide: SESSION_STORE,
  inject: [PG_POOL],
  // 테이블은 저장소가 아니라 Prisma 마이그레이션이 만든다.
  useFactory: (pool: pg.Pool): SessionStore =>
    new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
};

export function sessionMiddleware(
  store: SessionStore,
  settings: SessionSettings,
): RequestHandler {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: settings.secret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: settings.cookieSecure,
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
}

function promisify(run: (done: (err?: Error) => void) => void): Promise<void> {
  return new Promise((resolve, reject) =>
    run((err) => (err ? reject(err) : resolve())),
  );
}

// 로그인할 때 세션 id를 새로 발급해 session fixation을 막는다.
export async function startSession(
  req: Request,
  userId: string,
): Promise<void> {
  // express-session은 http로 보이는 요청에서는 Secure 쿠키를 말없이 건너뛴다.
  // 그러면 실제로는 로그인되지 않은 로그인에 200으로 답하게 된다.
  if (req.session.cookie.secure && !req.secure) {
    throw new ForbiddenException(
      'HTTPS가 아닌 요청에는 로그인 쿠키를 발급할 수 없습니다. HTTPS 프록시(Caddy)를 거쳐 호출하세요.',
    );
  }
  await promisify((done) => req.session.regenerate(done));
  req.session.userId = userId;
  await promisify((done) => req.session.save(done));
}

export function destroySession(req: Request): Promise<void> {
  return promisify((done) => req.session.destroy(done));
}
