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
    expect(config.perBroadcastMaxBytes).toBe(3 * 1024 ** 3);
    expect(config.perBroadcastMaxMs).toBe(3 * 60 * 60 * 1000);
  });

  it('reads the per-broadcast limits', () => {
    const config = recordingsConfigFromEnv({
      RECORDINGS_MAX_GB_PER_BROADCAST: '1.5',
      RECORDINGS_MAX_HOURS_PER_BROADCAST: '0.5',
    });
    expect(config.perBroadcastMaxBytes).toBe(1.5 * 1024 ** 3);
    expect(config.perBroadcastMaxMs).toBe(30 * 60 * 1000);
  });

  it('caps the per-broadcast size at the total cap', () => {
    const config = recordingsConfigFromEnv({
      RECORDINGS_MAX_GB: '2',
      RECORDINGS_MAX_GB_PER_BROADCAST: '5',
    });
    expect(config.perBroadcastMaxBytes).toBe(2 * 1024 ** 3);
  });

  it('reads RECORDINGS_DIR and a fractional RECORDINGS_MAX_GB', () => {
    expect(
      recordingsConfigFromEnv({
        RECORDINGS_DIR: '/srv/recordings',
        RECORDINGS_MAX_GB: '0.5',
      }),
    ).toMatchObject({ dir: '/srv/recordings', maxBytes: 512 * 1024 ** 2 });
  });

  it.each(['0', '-1', 'ten', 'Infinity'])(
    'rejects RECORDINGS_MAX_GB=%s',
    (value) => {
      expect(() =>
        recordingsConfigFromEnv({ RECORDINGS_MAX_GB: value }),
      ).toThrow('RECORDINGS_MAX_GB');
    },
  );

  it.each([
    'RECORDINGS_MAX_GB_PER_BROADCAST',
    'RECORDINGS_MAX_HOURS_PER_BROADCAST',
  ])('rejects a non-positive %s', (name) => {
    expect(() => recordingsConfigFromEnv({ [name]: '0' })).toThrow(name);
  });
});
