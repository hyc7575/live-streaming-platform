import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpOmeApi, omeApiConfigFromEnv } from '../src/ome/ome-api.js';

interface SeenRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
}

describe('HttpOmeApi', () => {
  let server: Server;
  let baseUrl: string;
  let seen: SeenRequest[];
  let answer: number;
  let answerBody: string | null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
      });
      res.writeHead(answer, { 'content-type': 'application/json' });
      res.end(answerBody ?? JSON.stringify({ statusCode: answer }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    seen = [];
    answer = 200;
    answerBody = null;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const api = () => new HttpOmeApi({ baseUrl, accessToken: 'admin-token' });

  it('sends DELETE for the stream with the token as Basic auth', async () => {
    await api().dropStream('b-1');
    expect(seen).toEqual([
      {
        method: 'DELETE',
        url: '/v1/vhosts/default/apps/app/streams/b-1',
        authorization: `Basic ${Buffer.from('admin-token').toString('base64')}`,
      },
    ]);
  });

  it('treats a missing stream (404) as already dropped', async () => {
    answer = 404;
    await expect(api().dropStream('b-1')).resolves.toBeUndefined();
  });

  it.each([401, 500])('throws when OME answers %i', async (status) => {
    answer = status;
    await expect(api().dropStream('b-1')).rejects.toThrow(String(status));
  });

  async function unreachableApi(): Promise<HttpOmeApi> {
    const closed = createServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, '127.0.0.1', resolve),
    );
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    return new HttpOmeApi({
      baseUrl: `http://127.0.0.1:${port}`,
      accessToken: 'admin-token',
    });
  }

  it('throws when OME is unreachable', async () => {
    await expect((await unreachableApi()).dropStream('b-1')).rejects.toThrow();
  });

  describe('listStreams', () => {
    it('sends GET for the app’s streams with the token as Basic auth', async () => {
      answerBody = JSON.stringify({
        message: 'OK',
        response: ['b-1', 'b-2'],
        statusCode: 200,
      });
      expect(await api().listStreams()).toEqual(['b-1', 'b-2']);
      expect(seen).toEqual([
        {
          method: 'GET',
          url: '/v1/vhosts/default/apps/app/streams',
          authorization: `Basic ${Buffer.from('admin-token').toString('base64')}`,
        },
      ]);
    });

    it('reads an empty list', async () => {
      answerBody = JSON.stringify({
        message: 'OK',
        response: [],
        statusCode: 200,
      });
      expect(await api().listStreams()).toEqual([]);
    });

    it.each([401, 404, 500])('throws when OME answers %i', async (status) => {
      answer = status;
      await expect(api().listStreams()).rejects.toThrow(String(status));
    });

    it.each([
      ['no list', JSON.stringify({ statusCode: 200 })],
      ['a list of non-names', JSON.stringify({ response: [1, 2] })],
      ['not JSON', 'OK'],
    ])('throws on a body with %s', async (_case, body) => {
      answerBody = body;
      await expect(api().listStreams()).rejects.toThrow();
    });

    it('throws when OME is unreachable', async () => {
      await expect((await unreachableApi()).listStreams()).rejects.toThrow();
    });
  });
});

describe('omeApiConfigFromEnv', () => {
  it('requires OME_API_ACCESS_TOKEN', () => {
    expect(() => omeApiConfigFromEnv({})).toThrow(
      'OME_API_ACCESS_TOKEN is not set',
    );
  });

  it('defaults to the loopback admin port', () => {
    expect(omeApiConfigFromEnv({ OME_API_ACCESS_TOKEN: 't' })).toEqual({
      baseUrl: 'http://127.0.0.1:8081',
      accessToken: 't',
    });
    expect(
      omeApiConfigFromEnv({ OME_API_ACCESS_TOKEN: 't', OME_API_PORT: '9081' })
        .baseUrl,
    ).toBe('http://127.0.0.1:9081');
  });

  it('prefers OME_API_URL when set', () => {
    expect(
      omeApiConfigFromEnv({
        OME_API_ACCESS_TOKEN: 't',
        OME_API_PORT: '9081',
        OME_API_URL: 'http://ome:8081',
      }).baseUrl,
    ).toBe('http://ome:8081');
  });
});
