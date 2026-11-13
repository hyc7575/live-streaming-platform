import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, type AuthUser } from '../auth/auth-context';
import { channelPath } from '../streamers';
import { FollowsProvider } from '../follows/FollowsProvider';
import styles from './AppLayout.module.css';
import { FollowPanel } from './FollowPanel';
import { SectionNav } from './SectionNav';
import { sectionOf } from './sections';

function AccountMenu() {
  const { state, logOut, recheck } = useAuth();

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

  return <UserMenu user={state.user} onLogOut={logOut} />;
}

// The nickname opens a small menu (PRD-mypage 7.3). A disclosure, not an
// ARIA menu: Tab moves through its items like any links. Escape, a click
// outside and focus moving to something outside all close it; Escape
// returns focus to the nickname. Safari and macOS Firefox do not focus a
// clicked link, so a click on an item blurs with no relatedTarget; closing
// then would hide the item before the click lands, so only a known outside
// target closes the menu and the pointerdown listener handles clicks.
function UserMenu({
  user,
  onLogOut,
}: {
  user: AuthUser;
  onLogOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleLogOut() {
    setOpen(false);
    await onLogOut();
    void navigate('/');
  }

  return (
    <div
      ref={rootRef}
      className={styles.account}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((was) => !was)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {user.nickname.slice(0, 1)}
        </span>
        <span className={styles.nickname}>{user.nickname}</span>
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      <div id={menuId} className={styles.menu} hidden={!open}>
        <Link
          to="/me"
          className={styles.menuItem}
          onClick={() => setOpen(false)}
        >
          마이페이지
        </Link>
        <Link
          to={channelPath(user.id)}
          className={styles.menuItem}
          onClick={() => setOpen(false)}
        >
          내 채널 보기
        </Link>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => void handleLogOut()}
        >
          로그아웃
        </button>
      </div>
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

// Watching pages keep the follow panel on the left; the studio and my page
// are the user's own workspace and show their menu there instead.
export function AppLayout() {
  const loggedIn = useAuth().state.status === 'authenticated';
  const section = sectionOf(useLocation().pathname);
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
          {section ? <SectionNav section={section} /> : <FollowPanel />}
          <main className={styles.main}>
            <Outlet />
          </main>
        </div>
      </div>
    </FollowsProvider>
  );
}
