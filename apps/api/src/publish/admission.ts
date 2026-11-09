import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BroadcastStatus } from '../generated/prisma/client.js';
import { OME_APP } from '../ome/ome-api.js';

export function publishPath(broadcastId: string, token: string): string {
  return `/${OME_APP}/${broadcastId}?direction=whip&transport=all&token=${token}`;
}

// OME signs the exact request bytes: base64url(HMAC-SHA1(secret, body)),
// without padding.
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

// Only the fields the decision reads. OME sends more (client address,
// protocol, time) and they pass through unchecked.
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

// What OME reads from the webhook answer.
export type AdmissionDecision =
  { allowed: true } | { allowed: false; reason: AdmissionRejection };

// PRD §7.4: a publisher whose connection dropped may reconnect to the same
// broadcast for this long. Past it the broadcast ends.
export const RECONNECT_GRACE_MS = 30_000;

// A connection that dropped after this instant is still within the grace
// period, and one that dropped at or before it is past it. Every grace check,
// in memory or in a query, compares against this one instant so the webhook
// and the sweeper never disagree about a broadcast.
export function graceCutoff(now: Date): Date {
  return new Date(now.getTime() - RECONNECT_GRACE_MS);
}

export interface PublishState {
  status: BroadcastStatus;
  // Set only on LIVE: when the publish connection dropped. null on LIVE
  // means the publisher is connected.
  disconnectedAt: Date | null;
}

// Where a broadcast stands for a new publish connection. A LIVE broadcast
// past the grace period is already `ended` here and only waits for the
// sweeper to write ENDED.
export type PublishPhase = 'ready' | 'connected' | 'reconnectable' | 'ended';

export function publishPhaseOf(state: PublishState, now: Date): PublishPhase {
  if (state.status === 'READY') return 'ready';
  if (state.status === 'ENDED') return 'ended';
  if (state.disconnectedAt === null) return 'connected';
  return state.disconnectedAt > graceCutoff(now) ? 'reconnectable' : 'ended';
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

// PRD §7.4 publish admission rule.
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
