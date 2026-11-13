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
    {/* 목록 검색창은 ?q=에서 값을 가져온다. transition 안에서는
        입력이 키 입력을 따라가지 못해 글자와 IME 입력을 잃는다. */}
    <RouterProvider router={router} useTransitions={false} />
  </StrictMode>,
);
