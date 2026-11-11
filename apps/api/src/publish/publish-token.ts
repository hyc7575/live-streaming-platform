import { createHmac, timingSafeEqual } from 'node:crypto';

// PRD §7.5: a publish token names one broadcast and its streamer and is
// checked only when OME asks about a new connection. It is stateless, so a
// token outlives nothing but its own expiry.
//
// OBS reconnects on its own with the URL it was given, and admission checks
// the token again on every reconnect, so an OBS token must outlast a whole
// broadcast. The token is bound to one broadcast and an ENDED broadcast never
// goes LIVE again, so the longer life only widens exposure of a URL that
// leaks before the broadcast starts.
export type PublishClient = 'browser' | 'obs';

export const PUBLISH_TOKEN_TTL_SECONDS: Record<PublishClient, number> = {
  browser: 5 * 60,
  obs: 12 * 60 * 60,
};

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
  client: PublishClient,
  now: Date,
): { token: string; expiresAt: Date } {
  const exp =
    Math.floor(now.getTime() / 1000) + PUBLISH_TOKEN_TTL_SECONDS[client];
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
