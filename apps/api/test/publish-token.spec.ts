import { describe, expect, it } from 'vitest';
import {
  mintPublishToken,
  publishTokenKey,
  verifyPublishToken,
} from '../src/publish/publish-token.js';

const key = publishTokenKey('session-secret');
const grant = {
  broadcastId: '11111111-1111-4111-8111-111111111111',
  streamerId: '22222222-2222-4222-8222-222222222222',
};
const now = new Date('2026-11-09T12:00:00Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);

function flipFirstSignatureChar(token: string): string {
  const dot = token.indexOf('.');
  const c = token[dot + 1] === 'A' ? 'B' : 'A';
  return `${token.slice(0, dot + 1)}${c}${token.slice(dot + 2)}`;
}

describe('publish token', () => {
  const { token } = mintPublishToken(key, grant, 'browser', now);

  it.each([
    ['browser', 5 * 60],
    ['obs', 12 * 60 * 60],
  ] as const)('a %s token lives exactly %i seconds', (client, ttl) => {
    const minted = mintPublishToken(key, grant, client, now);
    expect(minted.expiresAt).toEqual(later(ttl));
    expect(verifyPublishToken(key, minted.token, grant, later(ttl - 1))).toBe(
      true,
    );
    expect(verifyPublishToken(key, minted.token, grant, later(ttl))).toBe(
      false,
    );
  });

  it('is URL-safe', () => {
    expect(token).toMatch(/^[0-9]+\.[A-Za-z0-9_-]+$/);
  });

  it('verifies for its own grant until it expires', () => {
    expect(verifyPublishToken(key, token, grant, now)).toBe(true);
    expect(verifyPublishToken(key, token, grant, later(299))).toBe(true);
    expect(verifyPublishToken(key, token, grant, later(300))).toBe(false);
  });

  it('does not verify for another broadcast or streamer', () => {
    const otherId = '33333333-3333-4333-8333-333333333333';
    expect(
      verifyPublishToken(key, token, { ...grant, broadcastId: otherId }, now),
    ).toBe(false);
    expect(
      verifyPublishToken(key, token, { ...grant, streamerId: otherId }, now),
    ).toBe(false);
  });

  it('does not verify under another key', () => {
    const otherKey = publishTokenKey('another-session-secret');
    expect(verifyPublishToken(otherKey, token, grant, now)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['no signature', token.split('.')[0] ?? ''],
    ['extended expiry', token.replace(/^\d+/, (exp) => String(+exp + 3600))],
    ['flipped signature', flipFirstSignatureChar(token)],
    ['truncated signature', token.slice(0, -4)],
    ['garbage', 'not-a-real-token'],
  ])('rejects a token that is %s', (_case, bad) => {
    expect(verifyPublishToken(key, bad, grant, now)).toBe(false);
  });
});
