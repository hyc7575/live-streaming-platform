import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '../api';
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
  type AuthUser,
  type TestAccountKey,
} from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch<AuthUser>('/auth/me')
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'anonymous' });
      });
    return () => {
      cancelled = true;
    };
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
    () => ({ state, logIn, logInAsTestAccount, logOut, setUser }),
    [state, logIn, logInAsTestAccount, logOut, setUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
