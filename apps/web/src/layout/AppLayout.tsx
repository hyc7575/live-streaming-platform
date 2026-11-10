import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { FollowsProvider } from '../follows/FollowsProvider';
import styles from './AppLayout.module.css';
import { FollowPanel } from './FollowPanel';

function AccountMenu() {
  const { state, logOut, recheck } = useAuth();
  const navigate = useNavigate();

  if (state.status === 'loading') return null;

  // /auth/me failed without a 401: the session may still be fine, so the
  // header offers a retry instead of a login button.
  if (state.status === 'error') {
    return (
      <div className={styles.account}>
        <span className={styles.authError}>
          로그인 상태를 확인하지 못했습니다.
        </span>
        <button type="button" className={styles.logoutButton} onClick={recheck}>
          다시 시도
        </button>
      </div>
    );
  }

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

// "Lime" with a dotless ı; the dot is a separate lime circle that bounces once
// on load and again on hover or focus. Removing the class on animationend lets
// the next hover restart it.
function Logo() {
  const [bouncing, setBouncing] = useState(true);
  return (
    <Link
      to="/"
      className={styles.logo}
      aria-label="Lime"
      onMouseEnter={() => setBouncing(true)}
      onFocus={() => setBouncing(true)}
    >
      <span className={styles.wordmark} aria-hidden="true">
        L
        <span className={styles.stem}>
          ı
          <span
            className={bouncing ? `${styles.dot} ${styles.bounce}` : styles.dot}
            onAnimationEnd={() => setBouncing(false)}
          />
        </span>
        me
      </span>
    </Link>
  );
}

export function AppLayout() {
  const loggedIn = useAuth().state.status === 'authenticated';
  return (
    <FollowsProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Logo />
          <nav className={styles.nav}>
            <NavLink to="/" end className={styles.navLink}>
              방송 목록
            </NavLink>
            {loggedIn && (
              <NavLink
                to="/following"
                className={`${styles.navLink} ${styles.narrowOnly}`}
              >
                팔로잉
              </NavLink>
            )}
            {loggedIn && (
              <NavLink to="/studio" className={styles.navLink}>
                내 방송
              </NavLink>
            )}
          </nav>
          <AccountMenu />
        </header>
        <div className={styles.body}>
          <FollowPanel />
          <main className={styles.main}>
            <Outlet />
          </main>
        </div>
      </div>
    </FollowsProvider>
  );
}
