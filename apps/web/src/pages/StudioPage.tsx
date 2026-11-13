import { Link } from 'react-router';
import type { Broadcast } from '../broadcasts';
import { BroadcastGrid } from '../components/BroadcastGrid';
import { useApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import styles from './ListPage.module.css';

// A broadcast that has not started opens the publish page, since sending is
// the next step; LIVE and ENDED ones open the watch page like the public list.
function cardPath(b: Broadcast): string {
  return b.status === 'READY'
    ? `/studio/broadcasts/${b.id}`
    : `/broadcasts/${b.id}`;
}

export function StudioPage() {
  useDocumentTitle('내 방송');
  const broadcasts = useApi<Broadcast[]>('/me/broadcasts');

  return (
    <section>
      <div className={styles.heading}>
        <h1 className={styles.title}>내 방송</h1>
        <Link to="/studio/new" className={styles.create}>
          방송 만들기
        </Link>
      </div>
      {broadcasts.status === 'failed' && (
        <p role="alert">내 방송을 불러오지 못했습니다.</p>
      )}
      {broadcasts.status === 'loaded' &&
        (broadcasts.data.length === 0 ? (
          <p className={styles.empty}>
            아직 만든 방송이 없습니다. 방송을 만들어 보세요.
          </p>
        ) : (
          <BroadcastGrid broadcasts={broadcasts.data} linkTo={cardPath} />
        ))}
    </section>
  );
}
