import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  publishPhaseOf,
  type PublishPhase,
  type PublishState,
} from '../broadcasts/broadcast-lifecycle.js';
import { OME_APP } from '../ome/ome-api.js';

export function publishPath(broadcastId: string, token: string): string {
  return `/${OME_APP}/${broadcastId}?direction=whip&transport=all&token=${token}`;
}

// OME는 요청 바이트를 그대로 서명한다: base64url(HMAC-SHA1(secret, body)),
// 패딩 없음.
export function isValidOmeSignature(
  secret: string,
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha1', secret).update(rawBody).digest();
  const given = Buffer.from(signature, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// 판정이 읽는 필드만 둔다. OME는 더 보내지만(클라이언트 주소,
// 프로토콜, 시각) 검사 없이 통과시킨다.
export const admissionRequestSchema = z.object({
  request: z.object({
    direction: z.enum(['incoming', 'outgoing']),
    status: z.enum(['opening', 'closing']),
    url: z.string(),
  }),
});

export type AdmissionRequest = z.infer<typeof admissionRequestSchema>;

export interface PublishTarget {
  broadcastId: string;
  token: string | null;
}

export function publishTargetOf(url: string): PublishTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const [app, stream, ...rest] = parsed.pathname.split('/').slice(1);
  if (app !== OME_APP || !stream || rest.length > 0) return null;
  return { broadcastId: stream, token: parsed.searchParams.get('token') };
}

export type TokenCheck = 'valid' | 'missing' | 'invalid';

export type AdmissionRejection =
  | 'unknown broadcast'
  | 'missing token'
  | 'invalid token'
  | 'broadcast already live'
  | 'broadcast ended'
  | 'broadcast not ready'
  | 'streamer already live';

export type AdmissionDecision =
  { allowed: true } | { allowed: false; reason: AdmissionRejection };

export type AdmissionPlan =
  | { kind: 'go-live' }
  | { kind: 'reconnect' }
  | { kind: 'reject'; reason: AdmissionRejection };

const PHASE_PLAN: Record<PublishPhase, AdmissionPlan> = {
  ready: { kind: 'go-live' },
  connected: { kind: 'reject', reason: 'broadcast already live' },
  reconnectable: { kind: 'reconnect' },
  ended: { kind: 'reject', reason: 'broadcast ended' },
};

// PRD §7.4 송출 허용 규칙.
export function decideAdmission(
  broadcast: PublishState | null,
  token: TokenCheck,
  now: Date,
): AdmissionPlan {
  if (!broadcast) return { kind: 'reject', reason: 'unknown broadcast' };
  if (token === 'missing') return { kind: 'reject', reason: 'missing token' };
  if (token === 'invalid') return { kind: 'reject', reason: 'invalid token' };
  return PHASE_PLAN[publishPhaseOf(broadcast, now)];
}
