import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { BroadcastPage } from './pages/BroadcastPage';
import { ChannelPage } from './pages/ChannelPage';
import { DonatePage } from './pages/DonatePage';
import { DonationFailPage } from './pages/DonationFailPage';
import { DonationSuccessPage } from './pages/DonationSuccessPage';
import { EditBroadcastPage } from './pages/EditBroadcastPage';
import { FollowersPage } from './pages/FollowersPage';
import { FollowingPage } from './pages/FollowingPage';
import { HomePage } from './pages/HomePage';
import { LimeChargeFailPage } from './pages/LimeChargeFailPage';
import { LimeChargePage } from './pages/LimeChargePage';
import { LimeChargeSuccessPage } from './pages/LimeChargeSuccessPage';
import { LimeHistoryPage } from './pages/LimeHistoryPage';
import { LoginPage } from './pages/LoginPage';
import { NewBroadcastPage } from './pages/NewBroadcastPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { PublishPage } from './pages/PublishPage';
import { ReceivedDonationsPage } from './pages/ReceivedDonationsPage';
import { SentDonationsPage } from './pages/SentDonationsPage';
import { SignupPage } from './pages/SignupPage';
import { StreamerPage } from './pages/StreamerPage';
import { StudioPage } from './pages/StudioPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="broadcasts/:id" element={<BroadcastPage />} />
        <Route path="channels/:id" element={<StreamerPage />} />
        <Route path="donations/fail" element={<DonationFailPage />} />
        <Route path="lime/charge/fail" element={<LimeChargeFailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="broadcasts/:id/donate" element={<DonatePage />} />
          <Route path="donations/success" element={<DonationSuccessPage />} />
          <Route path="lime/charge" element={<LimeChargePage />} />
          <Route
            path="lime/charge/success"
            element={<LimeChargeSuccessPage />}
          />
          <Route path="following" element={<FollowingPage />} />
          <Route path="me" element={<LimeHistoryPage />} />
          <Route path="me/donations" element={<SentDonationsPage />} />
          <Route path="me/profile" element={<ProfilePage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="studio/channel" element={<ChannelPage />} />
          <Route path="studio/donations" element={<ReceivedDonationsPage />} />
          <Route path="studio/followers" element={<FollowersPage />} />
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
