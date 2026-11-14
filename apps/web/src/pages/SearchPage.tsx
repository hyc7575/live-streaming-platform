import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../api';
import type { Broadcast } from '../broadcasts';
import { BroadcastGrid } from '../components/BroadcastGrid';
import { UserAvatar } from '../components/UserAvatar';
import {
  SEARCH_BROADCAST_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  searchPath,
  type SearchResult,
  type SearchStreamer,
} from '../search';
import { channelPath } from '../streamers';
import { useApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import listStyles from './ListPage.module.css';
import styles from './SearchPage.module.css';

// /search?q=: 서버가 찾은 스트리머·방송·지난 방송을 한 번에 보인다
// (PRD-search 7.3). 결과는 한 번만 읽는다.
export function SearchPage() {
  const [params] = useSearchParams();
  // API는 50자를 넘으면 400이다. 주소창에 직접 친 긴 검색어는 잘라서 찾는다.
  const query = (params.get('q') ?? '')
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
  useDocumentTitle(query ? `'${query}' 검색 결과` : '검색');

  if (!query) {
    return (
      <section>
        <h1 className={styles.title}>검색</h1>
        <p className={listStyles.empty}>검색어를 입력하세요.</p>
      </section>
    );
  }
  return <SearchResults query={query} />;
}

function SearchResults({ query }: { query: string }) {
  const result = useApi<SearchResult>(searchPath(query));

  return (
    <section>
      <h1 className={styles.title}>&apos;{query}&apos; 검색 결과</h1>
      {result.status === 'failed' && (
        <p role="alert">
          {result.error instanceof ApiError && result.error.status === 429
            ? '검색을 너무 자주 했습니다. 잠시 후 다시 시도해 주세요.'
            : '검색 결과를 불러오지 못했습니다.'}
        </p>
      )}
      {result.status === 'loaded' && (
        <Results query={query} result={result.data} />
      )}
    </section>
  );
}

function Results({ query, result }: { query: string; result: SearchResult }) {
  const { streamers, broadcasts, past } = result;
  if (streamers.length === 0 && broadcasts.length === 0 && past.length === 0) {
    return <NoResults query={query} />;
  }
  return (
    <>
      {streamers.length > 0 && (
        <section className={styles.section} aria-labelledby="search-streamers">
          <h2 id="search-streamers" className={styles.sectionTitle}>
            스트리머
          </h2>
          <ul className={styles.streamers}>
            {streamers.map((s) => (
              <StreamerItem key={s.id} streamer={s} />
            ))}
          </ul>
        </section>
      )}
      <BroadcastSection id="search-broadcasts" title="방송" list={broadcasts} />
      <BroadcastSection id="search-past" title="지난 방송" list={past} />
    </>
  );
}

function StreamerItem({ streamer }: { streamer: SearchStreamer }) {
  return (
    <li>
      <Link to={channelPath(streamer.id)} className={styles.streamer}>
        <UserAvatar
          nickname={streamer.nickname}
          avatarUrl={streamer.avatarUrl}
          className={styles.avatar}
        />
        <span className={styles.identity}>
          <span className={styles.nickname}>{streamer.nickname}</span>
          <span className={styles.meta}>
            팔로워 {streamer.followerCount.toLocaleString('ko-KR')}명
            {streamer.liveBroadcastId && (
              <span className={styles.live}>LIVE</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

function BroadcastSection({
  id,
  title,
  list,
}: {
  id: string;
  title: string;
  list: Broadcast[];
}) {
  if (list.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      <BroadcastGrid broadcasts={list} />
      {list.length >= SEARCH_BROADCAST_LIMIT && (
        <p className={styles.limit}>
          최근 {SEARCH_BROADCAST_LIMIT}개까지 보입니다.
        </p>
      )}
    </section>
  );
}

// 방송이 몇 개뿐인 규모에서는 빈 결과가 흔하다. 빈 화면 대신 지금 볼 수 있는
// 방송을 보인다.
function NoResults({ query }: { query: string }) {
  const live = useApi<Broadcast[]>('/broadcasts?status=LIVE');
  return (
    <>
      <p className={listStyles.empty}>
        &apos;{query}&apos;와 맞는 결과가 없습니다.
      </p>
      {live.status === 'loaded' &&
        (live.data.length > 0 ? (
          <section className={styles.section} aria-labelledby="search-live">
            <h2 id="search-live" className={styles.sectionTitle}>
              지금 방송 중
            </h2>
            <BroadcastGrid broadcasts={live.data} />
          </section>
        ) : (
          <Link to="/" className={styles.home}>
            방송 목록으로 가기
          </Link>
        ))}
    </>
  );
}
