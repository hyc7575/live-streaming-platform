// The OME application every broadcast publishes into. The stream name is
// the broadcast id, so a publish URL path is /app/<broadcastId>.
export const OME_APP = 'app';

// OME's admin REST API, narrowed to what the API asks of it.
export interface OmeApi {
  // Cuts the publish connection of the broadcast's stream. A stream that
  // does not exist counts as already dropped.
  dropStream(broadcastId: string): Promise<void>;
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

export class HttpOmeApi implements OmeApi {
  private readonly authorization: string;

  constructor(private readonly config: OmeApiConfig) {
    this.authorization = `Basic ${Buffer.from(config.accessToken).toString('base64')}`;
  }

  async dropStream(broadcastId: string): Promise<void> {
    const path = `/v1/vhosts/default/apps/${OME_APP}/streams/${encodeURIComponent(broadcastId)}`;
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'DELETE',
      headers: { authorization: this.authorization },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await res.body?.cancel();
    if (res.ok || res.status === 404) return;
    throw new Error(`OME DELETE ${path} answered ${res.status}`);
  }
}
