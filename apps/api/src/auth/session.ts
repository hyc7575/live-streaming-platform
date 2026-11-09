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
  // Browsers drop Secure cookies sent over plain http, so local dev turns
  // this off. Production sits behind Caddy's TLS and turns it on.
  cookieSecure: boolean;
}

const PgStore = connectPgSimple(session);
export type SessionStore = InstanceType<typeof PgStore>;

export const SESSION_STORE = Symbol('SESSION_STORE');

export const sessionStoreProvider = {
  provide: SESSION_STORE,
  inject: [PG_POOL],
  // The table comes from the Prisma migration, not from the store.
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

// A fresh session id on login stops session fixation.
export async function startSession(
  req: Request,
  userId: string,
): Promise<void> {
  // express-session silently skips a Secure cookie on a request it sees as
  // http, which would answer 200 to a login that never logged in.
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
