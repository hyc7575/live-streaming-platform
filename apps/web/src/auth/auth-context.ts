import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  standbyImageUrl: string | null;
}

// `loading` lasts until the first GET /api/auth/me answers, so a refresh
// never flashes the logged-out header for a logged-in user.
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser };

// Matches the API's TEST_ACCOUNT_KEYS: A is the streamer, B the other user.
export type TestAccountKey = 'A' | 'B';

export interface AuthContextValue {
  state: AuthState;
  logIn: (email: string, password: string) => Promise<void>;
  logInAsTestAccount: (account: TestAccountKey) => Promise<void>;
  logOut: () => Promise<void>;
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
