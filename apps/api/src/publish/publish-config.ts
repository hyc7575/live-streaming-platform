import { publishTokenKey } from './publish-token.js';

export interface PublishConfig {
  tokenKey: Buffer;
  omeWebhookSecret: string;
}

export const PUBLISH_CONFIG = Symbol('PUBLISH_CONFIG');

export function publishConfig(secrets: {
  sessionSecret: string;
  omeWebhookSecret: string;
}): PublishConfig {
  return {
    tokenKey: publishTokenKey(secrets.sessionSecret),
    omeWebhookSecret: secrets.omeWebhookSecret,
  };
}

export function publishConfigFromEnv(
  env: Record<string, string | undefined>,
): PublishConfig {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
  if (!env.OME_WEBHOOK_SECRET) {
    throw new Error('OME_WEBHOOK_SECRET is not set');
  }
  return publishConfig({
    sessionSecret: env.SESSION_SECRET,
    omeWebhookSecret: env.OME_WEBHOOK_SECRET,
  });
}
