import 'express-session';

// What the API may reveal about a user. Never includes the password hash.
export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
}

export const authUserSelect = {
  id: true,
  email: true,
  nickname: true,
} as const;

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
