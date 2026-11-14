import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, type AuthUser } from '../auth/auth-context';
import { UserAvatar } from '../components/UserAvatar';
import { channelPath } from '../streamers';
import { FollowsProvider } from '../follows/FollowsProvider';
import styles from './AppLayout.module.css';
import { FollowPanel } from './FollowPanel';
import { SectionNav } from './SectionNav';
import { sectionOf } from './sections';

function AccountMenu() {
  const { state, logOut, recheck } = useAuth();

  if (state.status === 'loading') return null;

  // /auth/me가 401이 아닌 이유로 실패했다. 세션은 아직 괜찮을 수 있으므로
  // 헤더는 로그인 버튼 대신 재시도를 보인다.
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

// 닉네임을 누르면 작은 메뉴가 열린다(PRD-mypage 7.3). ARIA menu가 아니라
// disclosure다: Tab은 일반 링크처럼 항목 사이를 옮긴다. Escape, 바깥
// 클릭, 바깥으로 옮기는 포커스가 모두 메뉴를 닫는다. Escape는
// 포커스를 닉네임으로 돌려준다. Safari와 macOS Firefox는 클릭한 링크에
// 포커스를 주지 않아, 항목을 클릭하면 relatedTarget 없이 blur된다. 그때
// 닫으면 클릭이 닿기 전에 항목이 사라진다. 그래서 바깥으로 확인된
// 대상만 메뉴를 닫고, 클릭은 pointerdown 리스너가 처리한다.
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
        <UserAvatar
          nickname={user.nickname}
          avatarUrl={user.avatarUrl}
          className={styles.avatar}
        />
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

// 점 없는 ı로 쓴 "Lime". 점은 따로 그린 라임색 원이고, 로드 때 한 번,
// hover나 focus 때 다시 튄다. animationend에서 class를 지워야
// 다음 hover가 애니메이션을 다시 시작한다.
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

// 시청 페이지는 왼쪽에 팔로우 패널을 둔다. 스튜디오와 마이페이지는
// 사용자 자신의 작업 공간이라 그 자리에 자기 메뉴를 보인다.
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
