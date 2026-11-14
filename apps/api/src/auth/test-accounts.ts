import { z } from 'zod';
import type { PrismaService } from '../database/database.module.js';
import { authUserSelect, toAuthUser, type AuthUser } from './auth-user.js';
import { emailSchema, newPasswordSchema, nicknameSchema } from './fields.js';
import { hashPassword } from './password.js';

// 공모전 심사위원용 공개 계정(PRD §6). A는 방송하고, B는 A의 방송에서
// 거부되어야 하는 다른 사용자다. 비밀번호는 환경 변수에서만
// 가져오므로(PRD §7.9) 저장소에는 비밀번호가 하나도 없다.
export const TEST_ACCOUNT_KEYS = ['A', 'B'] as const;
export type TestAccountKey = (typeof TEST_ACCOUNT_KEYS)[number];

const DEFAULTS: Record<TestAccountKey, { email: string; nickname: string }> = {
  A: { email: 'streamer-a@modak.test', nickname: '스트리머 A' },
  B: { email: 'user-b@modak.test', nickname: '사용자 B' },
};

export type TestAccountsConfig =
  | { enabled: false }
  | { enabled: true; emails: Record<TestAccountKey, string> };

export const TEST_ACCOUNTS_CONFIG = Symbol('TEST_ACCOUNTS_CONFIG');

type Env = Record<string, string | undefined>;

// 심사위원이 이 계정을 함께 쓰고 README가 닉네임으로 확인하므로,
// 닉네임은 seed가 정한 값을 유지한다(PRD-mypage 7.2). 이메일로 비교하며,
// seed가 upsert 기준으로 쓰는 값과 같다.
export function isTestAccount(
  config: TestAccountsConfig,
  email: string,
): boolean {
  return (
    config.enabled &&
    TEST_ACCOUNT_KEYS.some((key) => config.emails[key] === email)
  );
}

function envName(key: TestAccountKey, field: string): string {
  return `TEST_ACCOUNT_${key}_${field}`;
}

function readField<T>(
  env: Env,
  key: TestAccountKey,
  field: string,
  schema: z.ZodType<T>,
  fallback?: string,
): T {
  const name = envName(key, field);
  const raw = env[name] || fallback;
  if (raw === undefined) throw new Error(`${name} is not set`);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${name} is invalid: ${result.error.issues[0]?.message}`);
  }
  return result.data;
}

function emailFromEnv(env: Env, key: TestAccountKey): string {
  return readField(env, key, 'EMAIL', emailSchema, DEFAULTS[key].email);
}

export function testAccountsConfigFromEnv(env: Env): TestAccountsConfig {
  if (env.TEST_ACCOUNTS_ENABLED !== 'true') return { enabled: false };
  return {
    enabled: true,
    emails: { A: emailFromEnv(env, 'A'), B: emailFromEnv(env, 'B') },
  };
}

// 두 계정을 만들거나 갱신해 환경 변수를 기준으로
// 삼는다. 다시 실행해도 비밀번호 해시의 salt 말고는 바뀌지 않는다.
export async function seedTestAccounts(
  prisma: PrismaService,
  env: Env,
): Promise<Record<TestAccountKey, AuthUser>> {
  const accounts = TEST_ACCOUNT_KEYS.map((key) => ({
    key,
    email: emailFromEnv(env, key),
    nickname: readField(
      env,
      key,
      'NICKNAME',
      nicknameSchema,
      DEFAULTS[key].nickname,
    ),
    password: readField(env, key, 'PASSWORD', newPasswordSchema),
  }));
  const seeded = await Promise.all(
    accounts.map(async ({ key, email, nickname, password }) => {
      const passwordHash = await hashPassword(password);
      const user = await prisma.user.upsert({
        where: { email },
        create: { email, nickname, passwordHash },
        update: { nickname, passwordHash },
        select: authUserSelect,
      });
      return [key, toAuthUser(user)] as const;
    }),
  );
  return Object.fromEntries(seeded) as Record<TestAccountKey, AuthUser>;
}
