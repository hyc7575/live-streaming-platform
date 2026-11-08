import { z } from 'zod';
import type { PrismaService } from '../database/database.module.js';
import { authUserSelect, type AuthUser } from './auth-user.js';
import { emailSchema, newPasswordSchema, nicknameSchema } from './fields.js';
import { hashPassword } from './password.js';

// Public accounts for contest judges (PRD §6): A streams, B is the other user
// who must be refused on A's broadcast. Passwords come only from the
// environment (PRD §7.9), so the repository never holds one.
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

// Creates or updates both accounts so the environment is the source of
// truth: running it again changes nothing but the password hash's salt.
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
      return [key, user] as const;
    }),
  );
  return Object.fromEntries(seeded) as Record<TestAccountKey, AuthUser>;
}
