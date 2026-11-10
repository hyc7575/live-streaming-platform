import { z } from 'zod';

// The OME application every broadcast publishes into. The stream name is
// the broadcast id, so a publish URL path is /app/<broadcastId>.
export const OME_APP = 'app';

// OME's admin REST API, narrowed to what the API asks of it.
export interface OmeApi {
  // Cuts the publish connection of the broadcast's stream. A stream that
  // does not exist counts as already dropped.
  dropStream(broadcastId: string): Promise<void>;
  listStreams(): Promise<string[]>;
  // Recording tasks are keyed by the broadcast id. Starting one that already
  // exists, or stopping one that does not, counts as done.
  startRecord(broadcastId: string): Promise<void>;
  stopRecord(broadcastId: string): Promise<void>;
  // Ids of every recording task OME holds, recording or waiting.
  listRecords(): Promise<string[]>;
}

export const OME_API = Symbol('OME_API');

export interface OmeApiConfig {
  baseUrl: string;
  accessToken: string;
}

export function omeApiConfigFromEnv(
  env: Record<string, string | undefined>,
): OmeApiConfig {
  if (!env.OME_API_ACCESS_TOKEN) {
    throw new Error('OME_API_ACCESS_TOKEN is not set');
  }
  return {
    baseUrl: env.OME_API_URL || `http://127.0.0.1:${env.OME_API_PORT || 8081}`,
    accessToken: env.OME_API_ACCESS_TOKEN,
  };
}

const REQUEST_TIMEOUT_MS = 5000;

const APP_PATH = `/v1/vhosts/default/apps/${OME_APP}`;
const STREAMS_PATH = `${APP_PATH}/streams`;

// Output profile names from ome/Server.xml <Encodes>. Without them OME also
// writes the Opus track kept for WebRTC playback; these leave H.264 + AAC.
const RECORD_VARIANTS = ['bypass_video', 'aac_audio'];

const streamListSchema = z.object({ response: z.array(z.string()) });

const recordListSchema = z.object({
  response: z.array(z.object({ id: z.string() })),
});

export class HttpOmeApi implements OmeApi {
  private readonly authorization: string;

  constructor(private readonly config: OmeApiConfig) {
    this.authorization = `Basic ${Buffer.from(config.accessToken).toString('base64')}`;
  }

  async dropStream(broadcastId: string): Promise<void> {
    const path = `${STREAMS_PATH}/${encodeURIComponent(broadcastId)}`;
    const res = await this.request('DELETE', path);
    await res.body?.cancel();
    if (res.ok || res.status === 404) return;
    throw new Error(`OME DELETE ${path} answered ${res.status}`);
  }

  // A 404 here means the app itself is missing, not an empty list, so it
  // throws like any other failure.
  async listStreams(): Promise<string[]> {
    const res = await this.request('GET', STREAMS_PATH);
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`OME GET ${STREAMS_PATH} answered ${res.status}`);
    }
    return streamListSchema.parse(await res.json()).response;
  }

  // OME v0.21 answers a duplicate id with 400, not the 409 its docs name.
  async startRecord(broadcastId: string): Promise<void> {
    const path = `${APP_PATH}:startRecord`;
    const res = await this.request('POST', path, {
      id: broadcastId,
      stream: { name: broadcastId, variantNames: RECORD_VARIANTS },
    });
    const body = await res.text();
    if (res.ok || (res.status === 400 && body.includes('Duplicate ID'))) {
      return;
    }
    throw new Error(`OME POST ${path} answered ${res.status}: ${body}`);
  }

  async stopRecord(broadcastId: string): Promise<void> {
    const path = `${APP_PATH}:stopRecord`;
    const res = await this.request('POST', path, { id: broadcastId });
    await res.body?.cancel();
    if (res.ok || res.status === 404) return;
    throw new Error(`OME POST ${path} answered ${res.status}`);
  }

  async listRecords(): Promise<string[]> {
    const path = `${APP_PATH}:records`;
    const res = await this.request('POST', path, {});
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`OME POST ${path} answered ${res.status}`);
    }
    return recordListSchema.parse(await res.json()).response.map((r) => r.id);
  }

  private request(
    method: 'GET' | 'DELETE' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers:
        body === undefined
          ? { authorization: this.authorization }
          : {
              authorization: this.authorization,
              'content-type': 'application/json',
            },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}
