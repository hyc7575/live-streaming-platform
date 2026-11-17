import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './layout/AppLayout';
import { ChannelPage } from './pages/ChannelPage';
import { DonationFailPage } from './pages/DonationFailPage';
import { DonationSuccessPage } from './pages/DonationSuccessPage';
import { EditBroadcastPage } from './pages/EditBroadcastPage';
import { FollowersPage } from './pages/FollowersPage';
import { FollowingPage } from './pages/FollowingPage';
import { HomePage } from './pages/HomePage';
import { LimeChargeFailPage } from './pages/LimeChargeFailPage';
import { LimeChargeSuccessPage } from './pages/LimeChargeSuccessPage';
import { LimeHistoryPage } from './pages/LimeHistoryPage';
import { LoginPage } from './pages/LoginPage';
import { NewBroadcastPage } from './pages/NewBroadcastPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReceivedDonationsPage } from './pages/ReceivedDonationsPage';
import { SearchPage } from './pages/SearchPage';
import { SentDonationsPage } from './pages/SentDonationsPage';
import { SignupPage } from './pages/SignupPage';
import { StreamerPage } from './pages/StreamerPage';
import { StudioPage } from './pages/StudioPage';

// 무거운 라이브러리를 쓰는 화면만 따로 내려받는다(#226). 시청은 hls.js,
// 송출은 OvenLiveKit, 후원·충전은 Toss SDK를 쓴다. 나머지 화면은 공용 코드가
// 대부분이라 나눠도 첫 로드가 거의 줄지 않고 이동마다 기다림만 생긴다.
// 내려받는 동안과 실패는 AppLayout의 PageOutlet이 맡는다.
const BroadcastPage = lazy(() =>
  import('./pages/BroadcastPage').then((m) => ({ default: m.BroadcastPage })),
);
const PublishPage = lazy(() =>
  import('./pages/PublishPage').then((m) => ({ default: m.PublishPage })),
);
const DonatePage = lazy(() =>
  import('./pages/DonatePage').then((m) => ({ default: m.DonatePage })),
);
const LimeChargePage = lazy(() =>
  import('./pages/LimeChargePage').then((m) => ({ default: m.LimeChargePage })),
);

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="broadcasts/:id" element={<BroadcastPage />} />
        <Route path="channels/:id" element={<StreamerPage />} />
        <Route path="search" element={<SearchPage />} />
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
