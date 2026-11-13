import { PageTabs } from './PageTabs';

const TABS = [
  { to: '/studio', label: '내 방송' },
  { to: '/studio/channel', label: '내 채널' },
  { to: '/studio/followers', label: '팔로워' },
] as const;

export function StudioTabs() {
  return <PageTabs label="스튜디오" tabs={TABS} />;
}
