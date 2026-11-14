import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  bio: string;
  standbyImageUrl: string | null;
  avatarUrl: string | null;
}

// `loading`은 GET /api/auth/me가 답할 때까지 이어진다. 그래서 로그인한 사용자가
// 새로고침해도 로그아웃 상태의 헤더가 잠깐 보이지 않는다. `anonymous`는 API가
// 세션이 없다고 답한 것이다: /auth/me나 다른 요청이 401로 답했다. `error`는
// /auth/me가 다른 이유(네트워크, 5xx)로 실패해 아직 아무도 모르는 상태다.
// 화면은 이를 로그아웃으로 다루면 안 되고, `recheck`가 다시 묻는다.
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error' }
  | { status: 'authenticated'; user: AuthUser };

// API의 TEST_ACCOUNT_KEYS와 같다. A는 스트리머, B는 다른 사용자다.
export type TestAccountKey = 'A' | 'B';

export interface AuthContextValue {
  state: AuthState;
  logIn: (email: string, password: string) => Promise<void>;
  logInAsTestAccount: (account: TestAccountKey) => Promise<void>;
  logOut: () => Promise<void>;
  // GET /api/auth/me를 다시 읽는다. `error` 뒤 헤더의 재시도에 쓴다.
  recheck: () => void;
  // 기본 대기 이미지 업로드처럼 사용자를 바꾼 화면이 쓴다. 그러면
  // GET /api/auth/me를 다시 부르지 않아도 모든 화면이 바뀐 값을 본다.
  setUser: (user: AuthUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>');
  return value;
}
