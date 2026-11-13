import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BroadcastStatus } from '../generated/prisma/client.js';
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

// PRD §7.4
export const RECONNECT_GRACE_MS = 30_000;

// 유예 경계의 양쪽이 하나의 기준 시각에서 나온다. 그래서 웹훅과
// sweeper가 같은 방송에 함께 손대는 일은 없다.
export function graceWindow(now: Date) {
  const cutoff = new Date(now.getTime() - RECONNECT_GRACE_MS);
  return {
    within: { gt: cutoff },
    past: { lte: cutoff },
    contains: (disconnectedAt: Date) => disconnectedAt > cutoff,
  };
}

export interface PublishState {
  status: BroadcastStatus;
  disconnectedAt: Date | null;
}

export type PublishPhase = 'ready' | 'connected' | 'reconnectable' | 'ended';

export function publishPhaseOf(state: PublishState, now: Date): PublishPhase {
  if (state.status === 'READY') return 'ready';
  if (state.status === 'ENDED') return 'ended';
  if (state.disconnectedAt === null) return 'connected';
  return graceWindow(now).contains(state.disconnectedAt)
    ? 'reconnectable'
    : 'ended';
}

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
