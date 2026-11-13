import { PageTabs } from './PageTabs';

const TABS = [
  { to: '/me', label: '라임 내역' },
  { to: '/me/donations', label: '보낸 후원' },
] as const;

export function MyPageTabs() {
  return <PageTabs label="마이페이지" tabs={TABS} />;
}
