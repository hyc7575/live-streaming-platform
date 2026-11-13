import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  bio: string;
  standbyImageUrl: string | null;
  avatarUrl: string | null;
}

// `loading` lasts until GET /api/auth/me answers, so a refresh never flashes
// the logged-out header for a logged-in user. `anonymous` means the API said
// there is no session: /auth/me or any other request answered 401. `error`
// means /auth/me failed some other way (network, 5xx), so nobody knows yet;
// screens must not treat it as logged out, and `recheck` asks again.
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error' }
  | { status: 'authenticated'; user: AuthUser };

// Matches the API's TEST_ACCOUNT_KEYS: A is the streamer, B the other user.
export type TestAccountKey = 'A' | 'B';

export interface AuthContextValue {
  state: AuthState;
  logIn: (email: string, password: string) => Promise<void>;
  logInAsTestAccount: (account: TestAccountKey) => Promise<void>;
  logOut: () => Promise<void>;
  // Re-reads GET /api/auth/me, for the header's retry after `error`.
  recheck: () => void;
  // For a screen that changed the user, such as uploading a standby image,
  // so every screen sees it without another GET /api/auth/me.
  setUser: (user: AuthUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>');
  return value;
}
