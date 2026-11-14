import { scryptSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

// 다른 테스트는 support/cheap-password-hash.ts로 해시를 싸게 만든다.
// 이 파일만 원래 모듈을 써서 운영 비용을 확인한다.
vi.unmock('../src/auth/password.js');

describe('password hashing', () => {
  it('hashes with the OWASP scrypt cost and verifies the password', async () => {
    const stored = await hashPassword('correct-horse-battery');

    expect(stored.split('$').slice(0, 4)).toEqual([
      'scrypt',
      '32768',
      '8',
      '3',
    ]);
    await expect(verifyPassword('correct-horse-battery', stored)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('wrong-password', stored)).resolves.toBe(false);
  });

  it('verifies a hash stored with another cost', async () => {
    // N=1024, r=8, p=1로 'pw'를 해시한 값.
    const salt = Buffer.alloc(16, 1);
    const key = scryptSync('pw', salt, 32, { N: 1024, r: 8, p: 1 });
    const stored = `scrypt$1024$8$1$${salt.toString('base64')}$${key.toString('base64')}`;

    await expect(verifyPassword('pw', stored)).resolves.toBe(true);
    await expect(verifyPassword('nope', stored)).resolves.toBe(false);
  });

  it('rejects a value that is not a scrypt hash', async () => {
    await expect(verifyPassword('pw', 'bcrypt$whatever')).resolves.toBe(false);
  });
});
