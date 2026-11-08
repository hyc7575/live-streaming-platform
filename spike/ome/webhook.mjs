// Throwaway Admission Webhook for the OME spike (issue #2). Not production code.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const PORT = Number(process.env.WEBHOOK_PORT ?? 18080);
const SECRET = process.env.OME_WEBHOOK_SECRET ?? 'spike-webhook-secret';
const LOG = process.env.WEBHOOK_LOG ?? '';

export const tokenFor = (stream) =>
  createHmac('sha256', SECRET)
    .update(`publish:${stream}`)
    .digest('hex')
    .slice(0, 32);

const ended = new Set();
const events = [];
let delayMs = 0;

const sign = (body) =>
  createHmac('sha1', SECRET).update(body).digest('base64url');

function verifySignature(header, body) {
  if (!header) return false;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(header.replace(/=+$/, ''));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function decide(req) {
  if (req.direction !== 'incoming') return { allowed: true };
  const url = new URL(req.url);
  const [, , stream] = url.pathname.split('/');
  const token = url.searchParams.get('token');
  if (!token) return { allowed: false, reason: 'missing token' };
  if (token !== tokenFor(stream))
    return { allowed: false, reason: 'invalid token' };
  if (ended.has(stream)) return { allowed: false, reason: 'broadcast ended' };
  return { allowed: true };
}

function record(entry) {
  events.push(entry);
  if (LOG) appendFileSync(LOG, JSON.stringify(entry) + '\n');
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const body = await readBody(req);
  const path = new URL(req.url, 'http://x').pathname;

  if (req.method === 'POST' && path === '/admission') {
    const signature = req.headers['x-ome-signature'];
    const signatureValid = verifySignature(signature, body);
    const payload = JSON.parse(body.toString() || '{}');
    const status = payload.request?.status;
    let response;
    if (!signatureValid) response = { allowed: false, reason: 'bad signature' };
    else if (status === 'closing') response = {};
    else response = decide(payload.request);
    record({
      at: new Date().toISOString(),
      signature,
      signatureValid,
      status,
      direction: payload.request?.direction,
      protocol: payload.request?.protocol,
      url: payload.request?.url,
      response,
      delayMs,
    });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return json(res, signatureValid ? 200 : 401, response);
  }

  // Control endpoints for the spike runner (stand-ins for NestJS state changes).
  if (req.method === 'GET' && path === '/events') return json(res, 200, events);
  if (req.method === 'GET' && path === '/token') {
    const stream = new URL(req.url, 'http://x').searchParams.get('stream');
    return json(res, 200, { token: tokenFor(stream) });
  }
  if (req.method === 'POST' && path === '/end') {
    const { stream } = JSON.parse(body.toString());
    ended.add(stream);
    return json(res, 200, { ended: [...ended] });
  }
  if (req.method === 'POST' && path === '/delay') {
    delayMs = JSON.parse(body.toString()).ms;
    return json(res, 200, { delayMs });
  }
  json(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`webhook listening on :${PORT}`));
