import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordingLimits } from './recording-plan.js';

export interface RecordingsConfig extends RecordingLimits {
  // OME의 FILE publisher가 쓰는 곳. 방송마다 디렉터리 하나.
  dir: string;
}

export const RECORDINGS_CONFIG = Symbol('RECORDINGS_CONFIG');

const BYTES_PER_GB = 1024 ** 3;
const MS_PER_HOUR = 60 * 60 * 1000;

// 방송당 상한 기본값(#209). PRD·PRE-MORTEM에는 수치가 없다.
// docs/OPERATIONS.md는 1시간 방송을 약 1~2GB로 추정한다. 3GB·3시간이면
// 시연 방송은 넉넉히 담고, 방송 하나가 기본 전체 상한 10GB의 1/3을 넘지 않는다.
const DEFAULT_PER_BROADCAST_GB = '3';
const DEFAULT_PER_BROADCAST_HOURS = '3';

// src/recording과 dist/recording 어디서든 저장소 루트로
// 풀린다. 두 폴더의 깊이가 같기 때문이다.
const DEFAULT_DIR = fileURLToPath(
  new URL('../../../../recordings/', import.meta.url),
);

export function recordingsConfigFromEnv(
  env: Record<string, string | undefined>,
): RecordingsConfig {
  const maxBytes = Math.floor(
    positive(env, 'RECORDINGS_MAX_GB', '10') * BYTES_PER_GB,
  );
  const perBroadcastBytes = Math.floor(
    positive(env, 'RECORDINGS_MAX_GB_PER_BROADCAST', DEFAULT_PER_BROADCAST_GB) *
      BYTES_PER_GB,
  );
  return {
    dir: resolve(env.RECORDINGS_DIR || DEFAULT_DIR),
    maxBytes,
    // 방송 하나가 전체 상한보다 클 수는 없다.
    perBroadcastMaxBytes: Math.min(perBroadcastBytes, maxBytes),
    perBroadcastMaxMs: Math.floor(
      positive(
        env,
        'RECORDINGS_MAX_HOURS_PER_BROADCAST',
        DEFAULT_PER_BROADCAST_HOURS,
      ) * MS_PER_HOUR,
    ),
  };
}

function positive(
  env: Record<string, string | undefined>,
  name: string,
  fallback: string,
): number {
  const raw = env[name] || fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}
