import 'express-session';
import type { Prisma } from '../generated/prisma/client.js';
import { standbyImageUrl } from '../images/image-store.js';

// What the API may reveal about a user. Never includes the password hash.
export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  standbyImageUrl: string | null;
}

export const authUserSelect = {
  id: true,
  email: true,
  nickname: true,
  standbyImageExt: true,
  standbyImageUpdatedAt: true,
} as const satisfies Prisma.UserSelect;

export type AuthUserRow = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

export function toAuthUser({
  standbyImageExt,
  standbyImageUpdatedAt,
  ...user
}: AuthUserRow): AuthUser {
  return {
    ...user,
    standbyImageUrl: standbyImageUrl(
      user.id,
      standbyImageExt,
      standbyImageUpdatedAt,
    ),
  };
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}
