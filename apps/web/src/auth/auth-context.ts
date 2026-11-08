import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
}

// `loading` lasts until the first GET /api/auth/me answers, so a refresh
// never flashes the logged-out header for a logged-in user.
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser };

export interface AuthContextValue {
  state: AuthState;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>');
  return value;
}
