import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { BroadcastPage } from './pages/BroadcastPage';
import { EditBroadcastPage } from './pages/EditBroadcastPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MobileStudioPage } from './pages/MobileStudioPage';
import { NewBroadcastPage } from './pages/NewBroadcastPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PcStudioPage } from './pages/PcStudioPage';
import { SignupPage } from './pages/SignupPage';
import { StudioPage } from './pages/StudioPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="broadcasts/:id" element={<BroadcastPage />} />
        <Route path="studio/pc" element={<PcStudioPage />} />
        <Route path="studio/mobile" element={<MobileStudioPage />} />
        <Route element={<RequireAuth />}>
          <Route path="studio" element={<StudioPage />} />
          <Route path="studio/new" element={<NewBroadcastPage />} />
          <Route
            path="studio/broadcasts/:id/edit"
            element={<EditBroadcastPage />}
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
