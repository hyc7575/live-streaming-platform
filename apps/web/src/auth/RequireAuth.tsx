import { Navigate, Outlet, useLocation } from 'react-router';
import type { LoginPageState } from '../pages/LoginPage';
import { useAuth } from './auth-context';

// Route wrapper for pages that need a login. An anonymous visitor goes to the
// login page, which sends them back here once they log in.
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  // `error` is not logged out: logging in would hit the same failure, so the
  // page waits for the header's retry.
  if (state.status === 'loading' || state.status === 'error') return null;
  if (state.status === 'anonymous') {
    const next: LoginPageState = {
      from: location.pathname + location.search,
    };
    return <Navigate to="/login" replace state={next} />;
  }
  return <Outlet />;
}
