import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RecordingsConfig {
  // Where OME's FILE publisher writes, one directory per broadcast.
  dir: string;
  maxBytes: number;
}

export const RECORDINGS_CONFIG = Symbol('RECORDINGS_CONFIG');

const BYTES_PER_GB = 1024 ** 3;

// Resolves to the repository root from both src/recording and
// dist/recording, which sit at the same depth.
const DEFAULT_DIR = fileURLToPath(
  new URL('../../../../recordings/', import.meta.url),
);

export function recordingsConfigFromEnv(
  env: Record<string, string | undefined>,
): RecordingsConfig {
  const raw = env.RECORDINGS_MAX_GB || '10';
  const gb = Number(raw);
  if (!Number.isFinite(gb) || gb <= 0) {
    throw new Error(
      `RECORDINGS_MAX_GB must be a positive number, got "${raw}"`,
    );
  }
  return {
    dir: resolve(env.RECORDINGS_DIR || DEFAULT_DIR),
    maxBytes: Math.floor(gb * BYTES_PER_GB),
  };
}
