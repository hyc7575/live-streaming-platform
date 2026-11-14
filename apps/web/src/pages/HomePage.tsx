import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth, type TestAccountKey } from '../auth/auth-context';
import type { Broadcast } from '../broadcasts';
import { BroadcastGrid } from '../components/BroadcastGrid';
import { usePolledApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import home from './HomePage.module.css';
import styles from './ListPage.module.css';
import { TestAccountLogin } from './TestAccountLogin';

// `status`는 페이지의 ?status= 값이고, `path`는 API에 요청하는 경로다.
const FILTERS = [
  {
    status: null,
    label: '전체',
    path: '/broadcasts',
    empty: '아직 공개된 방송이 없습니다.',
  },
  {
    status: 'LIVE',
    label: 'LIVE',
    path: '/broadcasts?status=LIVE',
    empty: '지금 LIVE인 방송이 없습니다.',
  },
  {
    status: 'READY',
    label: '방송 준비 중',
    path: '/broadcasts?status=READY',
    empty: '준비 중인 방송이 없습니다.',
  },
  {
    status: 'ENDED',
    label: '방송 종료',
    path: '/broadcasts?status=ENDED',
    empty: '끝난 방송이 없습니다.',
  },
  {
    status: 'REPLAY',
    label: '다시보기',
    path: '/replays',
    empty: '다시 볼 수 있는 방송이 없습니다.',
  },
] as const;

// 이미 받은 목록을 거르므로, 최신 PUBLIC_LIST_LIMIT개 방송만
// 걸린다. 목록이 그보다 커지면 서버 검색으로 바꾼다.
function matches(broadcast: Broadcast, needle: string) {
  return (
    broadcast.title.toLowerCase().includes(needle) ||
    broadcast.streamer.nickname.toLowerCase().includes(needle)
  );
}

const LIST_REFRESH_MS = 30_000;

// 서비스 소개와, 로그아웃한 방문자(대개 심사위원)를 위한 원클릭
// 테스트 계정. 로그인해도 이 화면에 머문다. `loading`과
// `error`에서는 버튼을 보이지 않는다. 방문자가 이미 로그인했을 수 있다.
function Intro() {
  const { state, logInAsTestAccount } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logIn(account: TestAccountKey) {
    setLoggingIn(true);
    setFailed(false);
    try {
      await logInAsTestAccount(account);
    } catch {
      setFailed(true);
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className={home.intro}>
      <p className={home.tagline}>
        설치 없이 브라우저로 화면이나 카메라를 방송하고, 누구나 로그인 없이
        시청합니다.
      </p>
      {state.status === 'anonymous' && (
        <TestAccountLogin
          inline
          disabled={loggingIn}
          onLogIn={(account) => void logIn(account)}
        />
      )}
      {failed && (
        <p className={home.error} role="alert">
          로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}

export function HomePage() {
  useDocumentTitle('방송 목록');
  const [params, setParams] = useSearchParams();
  const filter =
    FILTERS.find((f) => f.status === params.get('status')) ?? FILTERS[0];
  // 팔로우 패널처럼 다시 읽어, LIVE 카드가 새로고침 없이 새 썸네일과
  // 상태 변화를 반영한다.
  const broadcasts = usePolledApi<Broadcast[]>(
    filter.path,
    LIST_REFRESH_MS,
  ).data;
  const query = params.get('q') ?? '';
  const needle = query.trim().toLowerCase();
  const searchRef = useRef<HTMLInputElement>(null);

  function setQuery(value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }

  function tabPath(status: string | null) {
    const next = new URLSearchParams();
    if (status) next.set('status', status);
    if (query) next.set('q', query);
    const search = next.toString();
    return search ? `/?${search}` : '/';
  }

  function renderList(list: Broadcast[]) {
    if (list.length === 0)
      return <p className={styles.empty}>{filter.empty}</p>;
    const shown = list.filter((b) => matches(b, needle));
    if (shown.length === 0) {
      return (
        <div className={styles.noMatch}>
          <p className={styles.empty}>
            &apos;{query.trim()}&apos;와 맞는 방송이 없습니다.
          </p>
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
          >
            검색어 지우기
          </button>
        </div>
      );
    }
    return <BroadcastGrid broadcasts={shown} />;
  }

  return (
    <section>
      <Intro />
      <div className={styles.heading}>
        <h1 className={styles.title}>방송 목록</h1>
        <Link to="/studio/new" className={styles.create}>
          방송 만들기
        </Link>
      </div>
      <div role="search" className={styles.search}>
        <label>
          <span className={styles.visuallyHidden}>방송 검색</span>
          <input
            ref={searchRef}
            type="search"
            className={styles.searchInput}
            placeholder="제목이나 스트리머 닉네임으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <nav className={styles.filters} aria-label="방송 상태">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            to={tabPath(f.status)}
            className={styles.filter}
            aria-current={f === filter ? 'page' : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {broadcasts.status === 'failed' && (
        <p role="alert">방송 목록을 불러오지 못했습니다.</p>
      )}
      {broadcasts.status === 'loaded' && renderList(broadcasts.data)}
    </section>
  );
}
