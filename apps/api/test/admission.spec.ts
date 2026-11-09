import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decideAdmission,
  isValidOmeSignature,
  publishTargetOf,
} from '../src/publish/admission.js';

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
  it('admits only a READY broadcast with a valid token', () => {
    expect(decideAdmission({ status: 'READY' }, 'valid')).toEqual({
      allowed: true,
    });
  });

  it.each([
    [null, 'valid', 'unknown broadcast'],
    [{ status: 'READY' }, 'missing', 'missing token'],
    [{ status: 'READY' }, 'invalid', 'invalid token'],
    [{ status: 'LIVE' }, 'valid', 'broadcast already live'],
    [{ status: 'ENDED' }, 'valid', 'broadcast ended'],
    [{ status: 'ENDED' }, 'invalid', 'invalid token'],
  ] as const)('refuses %j with a %s token: %s', (broadcast, token, reason) => {
    expect(decideAdmission(broadcast, token)).toEqual({
      allowed: false,
      reason,
    });
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
