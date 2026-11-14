import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppRoutes } from './AppRoutes';
import { AuthProvider } from './auth/AuthProvider';
import './styles/global.css';

// data router는 송출 페이지가 useBlocker를 쓰기 위해서만 둔다. useBlocker에는
// data router가 필요하다. 모든 경로는 splat 라우트 하나로 가고, AppRoutes는
// 전처럼 <Routes>로 매칭한다.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    ),
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');

createRoot(root).render(
  <StrictMode>
    {/* 이유였던 홈 ?q= 입력창은 #139로 사라졌다. 기본값(transition)으로 바꾸는
        일은 송출 이탈 확인 회귀를 확인한 뒤 따로 한다. */}
    <RouterProvider router={router} useTransitions={false} />
  </StrictMode>,
);
