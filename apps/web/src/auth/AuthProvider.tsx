import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiFetch, onUnauthorized } from '../api';
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
  type AuthUser,
  type TestAccountKey,
} from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  // recheck()가 값을 올려 /auth/me effect를 다시 실행한다.
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AuthUser>('/auth/me')
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const noSession = err instanceof ApiError && err.status === 401;
        setState({ status: noSession ? 'anonymous' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [checks]);

  // 어디서든 401이 오면 세션이 사라진 것이다(다른 탭에서 로그아웃했거나
  // 만료됐다). 그래서 로그인 페이지가 더는 원래 화면으로 되돌려 보내지 않는다.
  useEffect(() => onUnauthorized(() => setState({ status: 'anonymous' })), []);

  const recheck = useCallback(() => {
    setState({ status: 'loading' });
    setChecks((n) => n + 1);
  }, []);

  const logIn = useCallback(async (email: string, password: string) => {
    const user = await apiFetch<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setState({ status: 'authenticated', user });
  }, []);

  const logInAsTestAccount = useCallback(async (account: TestAccountKey) => {
    const user = await apiFetch<AuthUser>('/auth/test-login', {
      method: 'POST',
      body: JSON.stringify({ account }),
    });
    setState({ status: 'authenticated', user });
  }, []);

  const logOut = useCallback(async () => {
    await apiFetch<void>('/auth/logout', { method: 'POST' });
    setState({ status: 'anonymous' });
  }, []);

  const setUser = useCallback((user: AuthUser) => {
    setState({ status: 'authenticated', user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, logIn, logInAsTestAccount, logOut, recheck, setUser }),
    [state, logIn, logInAsTestAccount, logOut, recheck, setUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
