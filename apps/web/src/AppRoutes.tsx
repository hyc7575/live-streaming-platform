import { Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MobileStudioPage } from './pages/MobileStudioPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SignupPage } from './pages/SignupPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="studio/mobile" element={<MobileStudioPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
