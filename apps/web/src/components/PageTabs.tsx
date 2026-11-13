import { NavLink } from 'react-router';
import styles from './PageTabs.module.css';

export interface PageTab {
  to: string;
  label: string;
}

// Tabs that are routes, so each opens by its own URL. NavLink marks the open
// tab with aria-current="page"; `end` keeps a parent path such as /studio
// from matching its children.
export function PageTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: readonly PageTab[];
}) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end className={styles.tab}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
