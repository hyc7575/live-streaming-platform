import { createHmac, timingSafeEqual } from 'node:crypto';

// PRD §7.5: a publish token names one broadcast and its streamer and is
// checked only when OME asks about a new connection. It is stateless, so a
// token outlives nothing but its own expiry.
export const PUBLISH_TOKEN_TTL_SECONDS = 5 * 60;

export interface PublishGrant {
  broadcastId: string;
  streamerId: string;
}

// Derived from the session secret so the deployment needs no new secret, and
// separated by purpose so a session signature never verifies as a token.
export function publishTokenKey(sessionSecret: string): Buffer {
  return createHmac('sha256', sessionSecret).update('publish-token').digest();
}

function sign(key: Buffer, grant: PublishGrant, exp: number): Buffer {
  return createHmac('sha256', key)
    .update(`publish:${grant.broadcastId}:${grant.streamerId}:${exp}`)
    .digest();
}

export function mintPublishToken(
  key: Buffer,
  grant: PublishGrant,
  now: Date,
): { token: string; expiresAt: Date } {
  const exp = Math.floor(now.getTime() / 1000) + PUBLISH_TOKEN_TTL_SECONDS;
  return {
    token: `${exp}.${sign(key, grant, exp).toString('base64url')}`,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifyPublishToken(
  key: Buffer,
  token: string,
  grant: PublishGrant,
  now: Date,
): boolean {
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!match) return false;
  const exp = Number(match[1]);
  if (exp * 1000 <= now.getTime()) return false;
  const given = Buffer.from(match[2] ?? '', 'base64url');
  const expected = sign(key, grant, exp);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
