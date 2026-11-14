import { Navigate, Outlet, useLocation } from 'react-router';
import type { LoginPageState } from '../pages/LoginPage';
import { useAuth } from './auth-context';

// 로그인이 필요한 페이지를 감싸는 라우트다. 비로그인 방문자는
// 로그인 페이지로 가고, 로그인하면 다시 여기로 돌아온다.
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  // `error`는 로그아웃이 아니다. 로그인해도 같은 실패를 만나므로
  // 페이지는 헤더의 재시도를 기다린다.
  if (state.status === 'loading' || state.status === 'error') return null;
  if (state.status === 'anonymous') {
    const next: LoginPageState = {
      from: location.pathname + location.search,
    };
    return <Navigate to="/login" replace state={next} />;
  }
  return <Outlet />;
}
