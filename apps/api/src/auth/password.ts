import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

// OWASP Password Storage Cheat Sheet의 scrypt 행: N=2^15, r=8, p=3 (32 MiB).
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function deriveKey(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  const options: ScryptOptions = {
    ...params,
    maxmem: 256 * params.N * params.r,
  };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

// `scrypt$N$r$p$salt$hash` 형태로 저장한다. 그래야 나중에 비용을 올려도
// 기존 해시가 무효가 되지 않는다.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await deriveKey(password, Buffer.from(salt, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
