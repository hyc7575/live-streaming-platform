import { NavLink, useLocation } from 'react-router';
import styles from './SectionNav.module.css';
import { isMenuPage, type Section } from './sections';

// 영역 메뉴: 1024px 이상에서는 왼쪽 열, 그 아래에서는 페이지 위의
// 탭 줄. 좁은 화면은 메뉴 자체 페이지에서만 탭 줄을 보여서,
// 더 깊은 페이지(휴대폰 송출 화면)가 높이를 지킨다.
// NavLink는 열린 항목에 aria-current="page"를 단다. `end`는 /studio가
// /studio/channel과 맞지 않게 한다.
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
