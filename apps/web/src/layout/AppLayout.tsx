import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, type AuthUser } from '../auth/auth-context';
import { UserAvatar } from '../components/UserAvatar';
import {
  normalizeSearchQuery,
  SEARCH_QUERY_MAX_LENGTH,
  searchPath,
} from '../search';
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

// 이동하면 key가 바뀌어 입력줄이 닫히고 입력칸이 주소의 검색어로 돌아간다.
// 송출 이탈 확인에서 머무르면 위치가 그대로라 입력이 남아야 하므로, 제출할 때
// 따로 닫지 않는다.
function HeaderSearch() {
  const location = useLocation();
  const current =
    location.pathname === '/search'
      ? normalizeSearchQuery(new URLSearchParams(location.search).get('q'))
      : '';
  return <SearchRow key={location.key} current={current} />;
}

function SearchRow({ current }: { current: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const magnifierRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();

  // 보이게 바꾼 입력칸에 같은 클릭 안에서 포커스를 준다. effect에서 포커스하면
  // iOS Safari는 사용자 동작 밖이라 키보드를 띄우지 않는다.
  function openRow() {
    flushSync(() => setOpen(true));
    inputRef.current?.focus();
  }

  function closeRow() {
    flushSync(() => setOpen(false));
    magnifierRef.current?.focus();
  }

  // Enter는 폼 제출에 맡긴다. ChatPanel처럼 keyCode 229를 막지 않는다. 크롬
  // 한글 IME의 조합 중 Enter는 확정 뒤 완성된 글자로 한 번만 제출된다(e2e).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = normalizeSearchQuery(inputRef.current?.value ?? null);
    if (!query) return;
    const resubmittingSameQuery = query === current;
    void navigate(searchPath(query), { replace: resubmittingSameQuery });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (!open || event.key !== 'Escape' || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    closeRow();
  }

  return (
    <div className={styles.search} data-open={open || undefined}>
      <form
        role="search"
        className={styles.searchForm}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
      >
        <label htmlFor={inputId} className={styles.visuallyHidden}>
          검색
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className={styles.searchInput}
          defaultValue={current}
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          placeholder="방송, 스트리머, 게임 검색"
          enterKeyHint="search"
        />
        {open && (
          <button
            type="button"
            className={`${styles.logoutButton} ${styles.searchClose}`}
            onClick={closeRow}
          >
            닫기
          </button>
        )}
      </form>
      <button
        ref={magnifierRef}
        type="button"
        className={styles.magnifier}
        aria-label="검색"
        onClick={openRow}
      >
        <SearchIcon />
      </button>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
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
          <HeaderSearch />
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
