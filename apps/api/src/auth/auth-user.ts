import 'express-session';
import type { Prisma } from '../generated/prisma/client.js';
import { userImageUrl } from '../images/image-store.js';

// What the API may reveal about a user to that user. Never includes the
// password hash.
export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  bio: string;
  standbyImageUrl: string | null;
  avatarUrl: string | null;
}

export const authUserSelect = {
  id: true,
  email: true,
  nickname: true,
  bio: true,
  standbyImageExt: true,
  standbyImageUpdatedAt: true,
  avatarExt: true,
  avatarUpdatedAt: true,
} as const satisfies Prisma.UserSelect;

export type AuthUserRow = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

export function toAuthUser({
  standbyImageExt,
  standbyImageUpdatedAt,
  avatarExt,
  avatarUpdatedAt,
  ...user
}: AuthUserRow): AuthUser {
  return {
    ...user,
    standbyImageUrl: userImageUrl(
      user.id,
      'standby',
      standbyImageExt,
      standbyImageUpdatedAt,
    ),
    avatarUrl: userImageUrl(user.id, 'avatar', avatarExt, avatarUpdatedAt),
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
