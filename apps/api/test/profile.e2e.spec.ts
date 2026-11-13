import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/auth/auth-user.js';
import { TEST_ACCOUNT_NICKNAME_MESSAGE } from '../src/channel/profile.service.js';
import { IMAGE_RULES } from '../src/images/image-rules.js';
import type { StreamerProfile } from '../src/streamers/streamers.service.js';
import {
  createTestApp,
  resetDatabase,
  signUpAndLogIn,
  thumbnailsDirOf,
  type TestUser,
} from './support/app.js';

const TEST_EMAILS = { A: 'judge-a@example.com', B: 'judge-b@example.com' };
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

// PRD-mypage 7.2: the caller edits their own introduction, nickname and
// profile image. Test accounts keep their nickname.
describe('profile editing', () => {
  let app: NestExpressApplication;
  let user: { user: TestUser; agent: TestAgent };
  let judge: { user: TestUser; agent: TestAgent };

  const anonymous = () => request(app.getHttpServer());
  const patch = (agent: TestAgent, body: object) =>
    agent.patch('/api/me/profile').send(body);
  const me = async (agent: TestAgent) =>
    (await agent.get('/api/auth/me')).body as AuthUser;
  const channel = async (id: string) =>
    (await anonymous().get(`/api/streamers/${id}`)).body as StreamerProfile;
  const exists = (path: string) =>
    access(path).then(
      () => true,
      () => false,
    );
  const userFile = (id: string, name: string) =>
    join(thumbnailsDirOf(app), 'users', id, name);

  beforeAll(async () => {
    app = await createTestApp({
      testAccounts: { enabled: true, emails: TEST_EMAILS },
    });
  });

  beforeEach(async () => {
    await resetDatabase(app);
    user = await signUpAndLogIn(app, { nickname: '불씨' });
    judge = await signUpAndLogIn(app, {
      email: TEST_EMAILS.A,
      nickname: '스트리머 A',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses every route without a login', async () => {
    expect(
      (await anonymous().patch('/api/me/profile').send({ bio: 'x' })).status,
    ).toBe(401);
    expect(
      (await anonymous().put('/api/me/avatar').attach('image', PNG, 'a.png'))
        .status,
    ).toBe(401);
    expect((await anonymous().delete('/api/me/avatar')).status).toBe(401);
  });

  it.each([
    ['an empty body', {}],
    ['an empty nickname', { nickname: '   ' }],
    ['a 21-character nickname', { nickname: '가'.repeat(21) }],
    ['a 201-character introduction', { bio: '가'.repeat(201) }],
  ])('refuses %s with 400', async (_label, body) => {
    const res = await patch(user.agent, body);
    expect(res.status).toBe(400);
    expect(await me(user.agent)).toMatchObject({ nickname: '불씨', bio: '' });
  });

  it('changes a nickname and introduction, shown on the channel page', async () => {
    const res = await patch(user.agent, {
      nickname: ' 새 닉네임 ',
      bio: ' 저녁마다 코딩 방송을 합니다. ',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      id: user.user.id,
      nickname: '새 닉네임',
      bio: '저녁마다 코딩 방송을 합니다.',
    });
    expect(await me(user.agent)).toMatchObject({ nickname: '새 닉네임' });
    expect(await channel(user.user.id)).toMatchObject({
      nickname: '새 닉네임',
      bio: '저녁마다 코딩 방송을 합니다.',
    });
    expect((await patch(user.agent, { bio: '' })).body).toMatchObject({
      nickname: '새 닉네임',
      bio: '',
    });
  });

  it('keeps a test account’s nickname with 403, but saves its introduction', async () => {
    const refused = await patch(judge.agent, { nickname: '바꾼 이름' });
    expect(refused.status).toBe(403);
    expect((refused.body as { message: string }).message).toBe(
      TEST_ACCOUNT_NICKNAME_MESSAGE,
    );
    const both = await patch(judge.agent, {
      nickname: '바꾼 이름',
      bio: '소개',
    });
    expect(both.status).toBe(403);
    expect(await me(judge.agent)).toMatchObject({
      nickname: '스트리머 A',
      bio: '',
    });

    const same = await patch(judge.agent, {
      nickname: '스트리머 A',
      bio: '소개',
    });
    expect(same.status).toBe(200);
    expect(await me(judge.agent)).toMatchObject({
      nickname: '스트리머 A',
      bio: '소개',
    });
  });

  it('checks the body before the test account rule', async () => {
    expect((await patch(judge.agent, { nickname: '' })).status).toBe(400);
  });

  it('stores a profile image beside the standby image, and removes only it', async () => {
    const standby = await user.agent
      .put('/api/me/standby-image')
      .attach('image', JPEG, 's.jpg');
    expect(standby.status).toBe(200);

    const saved = await user.agent
      .put('/api/me/avatar')
      .attach('image', PNG, 'a.png');
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const { avatarUrl, standbyImageUrl } = saved.body as AuthUser;
    expect(avatarUrl).toMatch(
      new RegExp(`^/thumbnails/users/${user.user.id}/avatar\\.png\\?v=\\d+$`),
    );
    expect(standbyImageUrl).toMatch(/standby\.jpg/);
    expect(await readFile(userFile(user.user.id, 'avatar.png'))).toEqual(PNG);
    expect(await channel(user.user.id)).toMatchObject({ avatarUrl });

    const removed = await user.agent.delete('/api/me/avatar');
    expect(removed.status).toBe(204);
    expect(await me(user.agent)).toMatchObject({
      avatarUrl: null,
      standbyImageUrl,
    });
    expect(await exists(userFile(user.user.id, 'avatar.png'))).toBe(false);
    expect(await exists(userFile(user.user.id, 'standby.jpg'))).toBe(true);
    expect((await user.agent.delete('/api/me/avatar')).status).toBe(204);
  });

  it('lets a test account change its profile image', async () => {
    const res = await judge.agent
      .put('/api/me/avatar')
      .attach('image', PNG, 'a.png');
    expect(res.status).toBe(200);
  });

  it('refuses a file that is not a JPEG, PNG or WebP image with 400', async () => {
    const res = await user.agent
      .put('/api/me/avatar')
      .attach('image', Buffer.from('not an image'), 'a.png');
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe(
      IMAGE_RULES.avatar.invalidMessage,
    );
    expect(await me(user.agent)).toMatchObject({ avatarUrl: null });
  });
});
