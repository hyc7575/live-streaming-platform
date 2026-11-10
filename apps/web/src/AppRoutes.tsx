import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { BroadcastPage } from './pages/BroadcastPage';
import { ChannelPage } from './pages/ChannelPage';
import { DonatePage } from './pages/DonatePage';
import { DonationFailPage } from './pages/DonationFailPage';
import { DonationSuccessPage } from './pages/DonationSuccessPage';
import { EditBroadcastPage } from './pages/EditBroadcastPage';
import { FollowingPage } from './pages/FollowingPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NewBroadcastPage } from './pages/NewBroadcastPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublishPage } from './pages/PublishPage';
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
        <Route path="donations/fail" element={<DonationFailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="broadcasts/:id/donate" element={<DonatePage />} />
          <Route path="donations/success" element={<DonationSuccessPage />} />
          <Route path="following" element={<FollowingPage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="studio/channel" element={<ChannelPage />} />
          <Route path="studio/new" element={<NewBroadcastPage />} />
          <Route path="studio/broadcasts/:id" element={<PublishPage />} />
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
