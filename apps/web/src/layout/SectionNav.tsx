import { NavLink, useLocation } from 'react-router';
import styles from './SectionNav.module.css';
import { isMenuPage, type Section } from './sections';

// The area's menu: a column on the left from 1024px up, a row of tabs above
// the page below that. Narrow screens show the row only on the menu's own
// pages, so a deeper page (the phone publish screen) keeps its height.
// NavLink marks the open item with aria-current="page"; `end` keeps /studio
// from matching /studio/channel.
export function SectionNav({ section }: { section: Section }) {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={section.label}
      className={
        isMenuPage(section, pathname)
          ? styles.nav
          : `${styles.nav} ${styles.wideOnly}`
      }
    >
      <p className={styles.heading} aria-hidden="true">
        {section.label}
      </p>
      <ul className={styles.list}>
        {section.items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end className={styles.item}>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
