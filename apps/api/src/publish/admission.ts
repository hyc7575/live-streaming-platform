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

export type AdmissionDecision =
  { allowed: true } | { allowed: false; reason: AdmissionRejection };

const STATUS_DECISION: Record<BroadcastStatus, AdmissionDecision> = {
  READY: { allowed: true },
  // Reconnecting within the grace period after a drop lands with #12.
  LIVE: { allowed: false, reason: 'broadcast already live' },
  ENDED: { allowed: false, reason: 'broadcast ended' },
};

// PRD §7.4 publish admission rule, minus the reconnect grace (#12).
export function decideAdmission(
  broadcast: { status: BroadcastStatus } | null,
  token: TokenCheck,
): AdmissionDecision {
  if (!broadcast) return { allowed: false, reason: 'unknown broadcast' };
  if (token === 'missing') return { allowed: false, reason: 'missing token' };
  if (token === 'invalid') return { allowed: false, reason: 'invalid token' };
  return STATUS_DECISION[broadcast.status];
}
