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
  let posted: { contentType: string | undefined; body: unknown }[];

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
      });
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        if (req.method === 'POST') {
          posted.push({
            contentType: req.headers['content-type'],
            body: JSON.parse(Buffer.concat(chunks).toString()) as unknown,
          });
        }
        res.writeHead(answer, { 'content-type': 'application/json' });
        res.end(answerBody ?? JSON.stringify({ statusCode: answer }));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    seen = [];
    posted = [];
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

  const basic = `Basic ${Buffer.from('admin-token').toString('base64')}`;

  describe('startRecord', () => {
    it('posts the broadcast as both task id and stream, H.264 + AAC only', async () => {
      await api().startRecord('b-1');
      expect(seen).toEqual([
        {
          method: 'POST',
          url: '/v1/vhosts/default/apps/app:startRecord',
          authorization: basic,
        },
      ]);
      expect(posted).toEqual([
        {
          contentType: 'application/json',
          body: {
            id: 'b-1',
            stream: {
              name: 'b-1',
              variantNames: ['bypass_video', 'aac_audio'],
            },
          },
        },
      ]);
    });

    it('treats a duplicate id (400) as already started', async () => {
      answer = 400;
      answerBody = JSON.stringify({
        message: '[HTTP] Duplicate ID already exists (400)',
        statusCode: 400,
      });
      await expect(api().startRecord('b-1')).resolves.toBeUndefined();
    });

    it('throws on any other 400', async () => {
      answer = 400;
      answerBody = JSON.stringify({ message: 'Bad request', statusCode: 400 });
      await expect(api().startRecord('b-1')).rejects.toThrow('400');
    });

    it.each([401, 404, 500])('throws when OME answers %i', async (status) => {
      answer = status;
      await expect(api().startRecord('b-1')).rejects.toThrow(String(status));
    });

    it('throws when OME is unreachable', async () => {
      await expect(
        (await unreachableApi()).startRecord('b-1'),
      ).rejects.toThrow();
    });
  });

  describe('stopRecord', () => {
    it('posts the task id', async () => {
      await api().stopRecord('b-1');
      expect(seen).toEqual([
        {
          method: 'POST',
          url: '/v1/vhosts/default/apps/app:stopRecord',
          authorization: basic,
        },
      ]);
      expect(posted).toEqual([
        { contentType: 'application/json', body: { id: 'b-1' } },
      ]);
    });

    it('treats an unknown id (404) as already stopped', async () => {
      answer = 404;
      await expect(api().stopRecord('b-1')).resolves.toBeUndefined();
    });

    it.each([400, 401, 500])('throws when OME answers %i', async (status) => {
      answer = status;
      await expect(api().stopRecord('b-1')).rejects.toThrow(String(status));
    });
  });

  describe('listRecords', () => {
    it('reads the task ids', async () => {
      answerBody = JSON.stringify({
        message: 'OK',
        response: [
          { id: 'b-1', state: 'recording', stream: { name: 'b-1' } },
          { id: 'b-2', state: 'ready', stream: { name: 'b-2' } },
        ],
        statusCode: 200,
      });
      expect(await api().listRecords()).toEqual(['b-1', 'b-2']);
      expect(seen).toEqual([
        {
          method: 'POST',
          url: '/v1/vhosts/default/apps/app:records',
          authorization: basic,
        },
      ]);
      expect(posted).toEqual([{ contentType: 'application/json', body: {} }]);
    });

    it.each([401, 404, 500])('throws when OME answers %i', async (status) => {
      answer = status;
      await expect(api().listRecords()).rejects.toThrow(String(status));
    });

    it('throws on a body without a task list', async () => {
      answerBody = JSON.stringify({ statusCode: 200 });
      await expect(api().listRecords()).rejects.toThrow();
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
