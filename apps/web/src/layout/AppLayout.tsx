import { Link, NavLink, Outlet } from 'react-router';
import styles from './AppLayout.module.css';

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true" />
          모닥
        </Link>
        <nav className={styles.nav}>
          <NavLink to="/" end className={styles.navLink}>
            방송 목록
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
