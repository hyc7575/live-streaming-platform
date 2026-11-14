import { createHmac } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  mintPublishToken,
  publishTokenKey,
  type PublishClient,
  type PublishGrant,
} from '../../src/publish/publish-token.js';
import { TEST_OME_WEBHOOK_SECRET, TEST_SESSION_SECRET } from './app.js';

export function whipUrl(id: string, token: string | null): string {
  const query = token ? `&token=${token}` : '';
  return `http://127.0.0.1:3333/app/${id}?direction=whip&transport=all${query}`;
}

// OME v0.21이 보내는 형태. #2 스파이크에서 기록했다.
export function admissionBody(
  url: string,
  overrides: { direction?: string; status?: string } = {},
): string {
  return JSON.stringify({
    client: { address: '172.17.0.1', port: 50000, user_agent: 'Chrome' },
    request: {
      direction: 'incoming',
      protocol: 'WebRTC',
      status: 'opening',
      url,
      time: new Date().toISOString(),
      ...overrides,
    },
  });
}

export function omeSignature(
  body: string,
  secret = TEST_OME_WEBHOOK_SECRET,
): string {
  return createHmac('sha1', secret).update(body).digest('base64url');
}

export function postAdmission(
  app: NestExpressApplication,
  body: string,
  signature: string | null = omeSignature(body),
) {
  const req = request(app.getHttpServer())
    .post('/api/ome/admission')
    .set('Content-Type', 'application/json');
  return (
    signature === null ? req : req.set('X-OME-Signature', signature)
  ).send(body);
}

export function openPublish(
  app: NestExpressApplication,
  id: string,
  token: string | null,
) {
  return postAdmission(app, admissionBody(whipUrl(id, token)));
}

export function closePublish(
  app: NestExpressApplication,
  id: string,
  token: string | null = null,
) {
  return postAdmission(
    app,
    admissionBody(whipUrl(id, token), { status: 'closing' }),
  );
}

export function mintedToken(
  grant: PublishGrant,
  now: Date,
  client: PublishClient = 'browser',
): string {
  return mintPublishToken(
    publishTokenKey(TEST_SESSION_SECRET),
    grant,
    client,
    now,
  ).token;
}
