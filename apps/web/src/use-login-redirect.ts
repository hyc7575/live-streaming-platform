import { useNavigate } from 'react-router';
import { ApiError } from './api';
import type { LoginPageState } from './pages/LoginPage';

// 요청이 세션 만료를 알리면 시청자를 로그인으로 보내고, 로그인 뒤 방송으로
// 되돌린다. 그렇게 했는지를 돌려준다.
export function useLoginRedirect(broadcastId: string) {
  const navigate = useNavigate();
  return (err: unknown): boolean => {
    if (!(err instanceof ApiError && err.status === 401)) return false;
    const next: LoginPageState = { from: `/broadcasts/${broadcastId}` };
    void navigate('/login', { state: next });
    return true;
  };
}
