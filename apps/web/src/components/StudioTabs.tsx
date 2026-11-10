import { NavLink } from 'react-router';
import styles from './StudioTabs.module.css';

const TABS = [
  { to: '/studio', label: '내 방송' },
  { to: '/studio/channel', label: '내 채널' },
] as const;

// NavLink marks the open tab with aria-current="page". `end` keeps 내 방송
// from matching /studio/channel.
export function StudioTabs() {
  return (
    <nav className={styles.tabs} aria-label="스튜디오">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end className={styles.tab}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
