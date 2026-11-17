import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { canonicalBroadcastId } from '../src/broadcasts/canonical-broadcast-id.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function rewrite(url: string): string {
  const req = { url } as Request;
  let called = false;
  canonicalBroadcastId(req, {} as Response, () => {
    called = true;
  });
  expect(called).toBe(true);
  return req.url;
}

describe('canonicalBroadcastId', () => {
  it.each([
    `/api/broadcasts/${ID.toUpperCase()}`,
    `/api/broadcasts/${ID.toUpperCase()}/thumbnail`,
    `/api/broadcasts/${ID.toUpperCase()}/comments?cursor=X`,
    `/api/broadcasts/${ID.toUpperCase()}?a=B`,
  ])('lower-cases only the broadcast id in %s', (url) => {
    expect(rewrite(url)).toBe(url.replace(ID.toUpperCase(), ID));
  });

  it.each([
    '/api/broadcasts',
    '/api/broadcasts?status=LIVE',
    `/api/broadcasts/${ID.toUpperCase()}X`,
    '/api/broadcasts/NOT-A-UUID',
    `/api/streamers/${ID.toUpperCase()}`,
  ])('leaves %s alone', (url) => {
    expect(rewrite(url)).toBe(url);
  });
});
