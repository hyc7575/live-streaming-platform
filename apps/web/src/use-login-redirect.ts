import { useNavigate } from 'react-router';
import { ApiError } from './api';
import type { LoginPageState } from './pages/LoginPage';

// Sends the viewer to log in and back to the broadcast when a request says
// the session ran out. Returns whether it did.
export function useLoginRedirect(broadcastId: string) {
  const navigate = useNavigate();
  return (err: unknown): boolean => {
    if (!(err instanceof ApiError && err.status === 401)) return false;
    const next: LoginPageState = { from: `/broadcasts/${broadcastId}` };
    void navigate('/login', { state: next });
    return true;
  };
}
