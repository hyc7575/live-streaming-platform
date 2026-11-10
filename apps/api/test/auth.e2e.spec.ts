import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { LOGIN_RATE_LIMIT } from '../src/auth/auth.controller.js';
import {
  createTestApp,
  logIn,
  newClientIp,
  resetDatabase,
  signUp,
  signUpAndLogIn,
} from './support/app.js';

function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('modak.sid='));
  if (!cookie)
    throw new Error(`no session cookie in ${JSON.stringify(cookies)}`);
  return cookie;
}

describe('auth', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs up, logs in, reports the user, and logs out', async () => {
    const user = await signUp(app, {
      email: 'Streamer@Example.com',
      nickname: '불씨',
    });
    expect(user).toEqual({
      id: expect.any(String) as string,
      email: 'streamer@example.com',
      nickname: '불씨',
      standbyImageUrl: null,
      password: expect.any(String) as string,
    });

    const agent = await logIn(app, { ...user, email: 'STREAMER@example.com' });
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      id: user.id,
      email: user.email,
      nickname: '불씨',
      standbyImageUrl: null,
    });

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects the old cookie after logout because the server deleted the session', async () => {
    const user = await signUp(app);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: user.email, password: user.password });
    const cookie = sessionCookie(login).split(';')[0]!;

    const server = app.getHttpServer();
    expect(
      (await request(server).get('/api/auth/me').set('Cookie', cookie)).status,
    ).toBe(200);
    expect(
      (await request(server).post('/api/auth/logout').set('Cookie', cookie))
        .status,
    ).toBe(204);
    expect(
      (await request(server).get('/api/auth/me').set('Cookie', cookie)).status,
    ).toBe(401);
  });

  it('returns 401 from me without a session', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong password and for an unknown email', async () => {
    const user = await signUp(app);
    const server = app.getHttpServer();
    const wrongPassword = await request(server)
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: user.email, password: 'not-the-password' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();

    const unknown = await request(server)
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: 'nobody@example.com', password: user.password });
    expect(unknown.status).toBe(401);
  });

  it('returns 409 when the email is already registered, ignoring case', async () => {
    await signUp(app, { email: 'dup@example.com' });
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .set('X-Forwarded-For', newClientIp())
      .send({
        email: 'DUP@example.com',
        password: 'another-password',
        nickname: 'dup',
      });
    expect(res.status).toBe(409);
  });

  it('returns 400 for an invalid signup body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: 'not-an-email', password: 'short', nickname: '' });
    expect(res.status).toBe(400);
  });

  it('issues an HttpOnly, SameSite=Lax session cookie', async () => {
    const user = await signUp(app);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: user.email, password: user.password });
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
  });

  it('answers 429 once one client exceeds the login limit', async () => {
    const ip = newClientIp();
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'nobody@example.com', password: 'whatever' });
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i += 1) {
      expect((await attempt()).status).toBe(401);
    }
    expect((await attempt()).status).toBe(429);

    const otherClient = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: 'nobody@example.com', password: 'whatever' });
    expect(otherClient.status).toBe(401);
  });

  it('gives each signUpAndLogIn caller its own session', async () => {
    const owner = await signUpAndLogIn(app);
    const other = await signUpAndLogIn(app);
    const ownerMe = await owner.agent.get('/api/auth/me');
    const otherMe = await other.agent.get('/api/auth/me');
    expect(ownerMe.body).toMatchObject({ id: owner.user.id });
    expect(otherMe.body).toMatchObject({ id: other.user.id });
  });
});

describe('auth across a server restart', () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('keeps the user logged in when a new app instance reads the same session store', async () => {
    app = await createTestApp();
    await resetDatabase(app);
    const user = await signUp(app);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: user.email, password: user.password });
    const cookie = sessionCookie(login).split(';')[0]!;
    await app.close();

    app = await createTestApp();
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: user.id });
  });
});

describe('auth behind the TLS proxy in production mode', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ cookieSecure: true });
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues a Secure, HttpOnly, SameSite=Lax cookie when the proxy says the request came over https', async () => {
    const user = await signUp(app);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .set('X-Forwarded-Proto', 'https')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
  });

  it('refuses to log in over plain http instead of answering 200 without a cookie', async () => {
    const user = await signUp(app);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', newClientIp())
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(403);
    expect((res.body as { message: string }).message).toContain('Caddy');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('still answers requests that do not start a session over plain http', async () => {
    const server = app.getHttpServer();
    expect((await request(server).get('/api/health')).status).toBe(200);
    expect((await request(server).get('/api/auth/me')).status).toBe(401);
  });
});
