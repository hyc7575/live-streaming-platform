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
  // Bumped by recheck() to run the /auth/me effect again.
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

  // A 401 anywhere means the session is gone (logged out in another tab or
  // expired), so the login page stops bouncing back to the screen.
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
