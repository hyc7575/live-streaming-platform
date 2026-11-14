import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RecordingsConfig {
  // OME의 FILE publisher가 쓰는 곳. 방송마다 디렉터리 하나.
  dir: string;
  maxBytes: number;
}

export const RECORDINGS_CONFIG = Symbol('RECORDINGS_CONFIG');

const BYTES_PER_GB = 1024 ** 3;

// src/recording과 dist/recording 어디서든 저장소 루트로
// 풀린다. 두 폴더의 깊이가 같기 때문이다.
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
