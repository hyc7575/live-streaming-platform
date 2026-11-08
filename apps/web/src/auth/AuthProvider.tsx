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

  const logOut = useCallback(async () => {
    await apiFetch<void>('/auth/logout', { method: 'POST' });
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, logIn, logOut }),
    [state, logIn, logOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
