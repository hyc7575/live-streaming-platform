import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decideAdmission,
  isValidOmeSignature,
  publishTargetOf,
  type AdmissionRejection,
} from '../src/publish/admission.js';

function reject(reason: AdmissionRejection) {
  return { kind: 'reject', reason } as const;
}

const endedPlan = reject('broadcast ended');

describe('publishTargetOf', () => {
  it('reads the broadcast id and token from a WHIP URL', () => {
    expect(
      publishTargetOf(
        'http://127.0.0.1:3333/app/abc?direction=whip&transport=all&token=t.1',
      ),
    ).toEqual({ broadcastId: 'abc', token: 't.1' });
  });

  it('reports a missing token as null', () => {
    expect(publishTargetOf('ws://x/app/abc?direction=whip')).toEqual({
      broadcastId: 'abc',
      token: null,
    });
  });

  it.each([
    'not a url',
    'http://x/other/abc?token=t',
    'http://x/app/?token=t',
    'http://x/app/abc/extra?token=t',
  ])('refuses %s', (url) => {
    expect(publishTargetOf(url)).toBeNull();
  });
});

describe('decideAdmission', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const ready = { status: 'READY', disconnectedAt: null } as const;
  const connected = { status: 'LIVE', disconnectedAt: null } as const;
  const ended = { status: 'ENDED', disconnectedAt: null } as const;
  const droppedAgo = (ms: number) =>
    ({ status: 'LIVE', disconnectedAt: ago(ms) }) as const;

  it.each([
    ['READY', ready, { kind: 'go-live' }],
    ['LIVE and connected', connected, reject('broadcast already live')],
    ['LIVE, dropped just now', droppedAgo(0), { kind: 'reconnect' }],
    ['LIVE, dropped 29.999 s ago', droppedAgo(29_999), { kind: 'reconnect' }],
    ['LIVE, dropped exactly 30 s ago', droppedAgo(30_000), endedPlan],
    ['LIVE, dropped 31 s ago', droppedAgo(31_000), endedPlan],
    ['ENDED', ended, endedPlan],
  ] as const)('with a valid token, %s → %j', (_case, broadcast, plan) => {
    expect(decideAdmission(broadcast, 'valid', now)).toEqual(plan);
  });

  it.each([
    [null, 'valid', 'unknown broadcast'],
    [ready, 'missing', 'missing token'],
    [ready, 'invalid', 'invalid token'],
    [droppedAgo(1000), 'missing', 'missing token'],
    [droppedAgo(1000), 'invalid', 'invalid token'],
    [ended, 'invalid', 'invalid token'],
  ] as const)('refuses %j with a %s token: %s', (broadcast, token, reason) => {
    expect(decideAdmission(broadcast, token, now)).toEqual(reject(reason));
  });
});

describe('isValidOmeSignature', () => {
  const body = Buffer.from('{"request":{}}');
  const signature = createHmac('sha1', 'secret')
    .update(body)
    .digest('base64url');

  it('accepts base64url HMAC-SHA1 of the raw body', () => {
    expect(isValidOmeSignature('secret', body, signature)).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['forged', 'forged'],
    [
      'for another body',
      createHmac('sha1', 'secret').update('{}').digest('base64url'),
    ],
    [
      'under another secret',
      createHmac('sha1', 'other').update(body).digest('base64url'),
    ],
  ])('refuses a signature that is %s', (_case, header) => {
    expect(isValidOmeSignature('secret', body, header)).toBe(false);
  });
});
