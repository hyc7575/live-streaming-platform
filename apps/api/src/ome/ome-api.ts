import { z } from 'zod';

// 모든 방송이 송출하는 OME application. 스트림 이름이
// 방송 id이므로 송출 URL 경로는 /app/<broadcastId>이다.
export const OME_APP = 'app';

// OME admin REST API 중 이 API가 요청하는 부분만 좁힌 것.
export interface OmeApi {
  // 방송 스트림의 송출 연결을 끊는다. 없는 스트림은
  // 이미 끊긴 것으로 친다.
  dropStream(broadcastId: string): Promise<void>;
  listStreams(): Promise<string[]>;
  // 녹화 작업의 키는 방송 id이다. 이미 있는 작업을 시작하거나
  // 없는 작업을 멈추는 것은 완료로 친다.
  startRecord(broadcastId: string): Promise<void>;
  stopRecord(broadcastId: string): Promise<void>;
  // OME가 가진 모든 녹화 작업의 id. 녹화 중이든 대기 중이든.
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

// ome/Server.xml <Encodes>의 출력 프로필 이름. 이것이 없으면 OME는
// WebRTC 재생용 Opus 트랙도 함께 쓴다. 이것을 주면 H.264 + AAC만 남는다.
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

  // 여기서 404는 빈 목록이 아니라 app 자체가 없다는 뜻이다. 그래서
  // 다른 실패처럼 던진다.
  async listStreams(): Promise<string[]> {
    const res = await this.request('GET', STREAMS_PATH);
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`OME GET ${STREAMS_PATH} answered ${res.status}`);
    }
    return streamListSchema.parse(await res.json()).response;
  }

  // OME v0.21은 중복 id에 문서가 말하는 409가 아니라 400으로 답한다.
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
