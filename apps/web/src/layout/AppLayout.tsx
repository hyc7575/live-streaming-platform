import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/auth-context';
import styles from './AppLayout.module.css';

function AccountMenu() {
  const { state, logOut } = useAuth();
  const navigate = useNavigate();

  if (state.status === 'loading') return null;

  if (state.status === 'anonymous') {
    return (
      <div className={styles.account}>
        <Link to="/signup" className={styles.navLink}>
          회원가입
        </Link>
        <Link to="/login" className={styles.loginButton}>
          로그인
        </Link>
      </div>
    );
  }

  async function handleLogOut() {
    await logOut();
    void navigate('/');
  }

  return (
    <div className={styles.account}>
      <span className={styles.nickname}>{state.user.nickname}</span>
      <button
        type="button"
        className={styles.logoutButton}
        onClick={() => void handleLogOut()}
      >
        로그아웃
      </button>
    </div>
  );
}

export function AppLayout() {
  const loggedIn = useAuth().state.status === 'authenticated';
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
          {loggedIn && (
            <NavLink to="/studio" className={styles.navLink}>
              내 방송
            </NavLink>
          )}
        </nav>
        <AccountMenu />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
