import { createHmac, timingSafeEqual } from 'node:crypto';

// PRD §7.5: 송출 토큰은 방송 하나와 그 스트리머를 가리키며,
// OME가 새 연결을 물을 때만 확인한다. 상태가 없으므로
// 토큰은 자기 만료 시각 말고는 아무 제약도 받지 않는다.
//
// OBS는 받은 URL로 스스로 다시 연결하고, 송출 허가는 다시 연결할 때마다
// 토큰을 다시 확인한다. 그래서 OBS 토큰은 방송 하나가 끝날 때까지
// 유효해야 한다. 토큰은 방송 하나에 묶이고 ENDED 방송은 다시
// LIVE가 되지 않는다. 그래서 수명이 길어져도 방송 시작 전에 새어 나간
// URL의 노출만 넓어진다.
export type PublishClient = 'browser' | 'obs';

export const PUBLISH_TOKEN_TTL_SECONDS: Record<PublishClient, number> = {
  browser: 5 * 60,
  obs: 12 * 60 * 60,
};

export interface PublishGrant {
  broadcastId: string;
  streamerId: string;
}

// 세션 secret에서 파생하므로 배포에 새 secret이 필요 없다. 또
// 용도별로 분리해 세션 서명이 토큰으로 검증되는 일은 없다.
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
