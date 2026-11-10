import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordingsConfigFromEnv } from '../src/recording/recordings-config.js';

describe('recordingsConfigFromEnv', () => {
  it('defaults to recordings/ at the repository root and 10 GB', () => {
    const config = recordingsConfigFromEnv({});
    expect(existsSync(join(config.dir, '..', 'pnpm-workspace.yaml'))).toBe(
      true,
    );
    expect(config.dir.endsWith('/recordings')).toBe(true);
    expect(config.maxBytes).toBe(10 * 1024 ** 3);
  });

  it('reads RECORDINGS_DIR and a fractional RECORDINGS_MAX_GB', () => {
    expect(
      recordingsConfigFromEnv({
        RECORDINGS_DIR: '/srv/recordings',
        RECORDINGS_MAX_GB: '0.5',
      }),
    ).toEqual({ dir: '/srv/recordings', maxBytes: 512 * 1024 ** 2 });
  });

  it.each(['0', '-1', 'ten', 'Infinity'])(
    'rejects RECORDINGS_MAX_GB=%s',
    (value) => {
      expect(() =>
        recordingsConfigFromEnv({ RECORDINGS_MAX_GB: value }),
      ).toThrow('RECORDINGS_MAX_GB');
    },
  );
});
