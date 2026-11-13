import {
  formatDonationAmount,
  formatWon,
  type ReceivedDonationSummary,
} from '../donations';
import { HISTORY_LIMIT } from '../history';
import { useApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import styles from './History.module.css';
import { BroadcastLink, HistoryTime } from './HistoryParts';
import listStyles from './ListPage.module.css';

// /studio/donations: every paid donation the streamer received, across all
// broadcasts. Donations keep their recipient, so deleting a broadcast never
// lowers the total (PRD-mypage KR4).
export function ReceivedDonationsPage() {
  useDocumentTitle('받은 후원');
  const received = useApi<ReceivedDonationSummary>('/me/received-donations');

  return (
    <section>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>받은 후원</h1>
      </div>
      {received.status === 'failed' && (
        <p role="alert">받은 후원을 불러오지 못했습니다.</p>
      )}
      {received.status === 'loaded' && (
        <>
          <div className={styles.summary}>
            <p className={styles.summaryText}>
              <span className={styles.muted}>합계</span>
              <strong>{formatWon(received.data.total)}</strong>
              <span className={styles.muted}>{received.data.count}건</span>
            </p>
          </div>
          {received.data.donations.length === 0 ? (
            <p className={listStyles.empty}>
              아직 받은 후원이 없습니다. 방송 중에 시청자가 후원하면 여기에
              보입니다.
            </p>
          ) : (
            <ol className={styles.list}>
              {received.data.donations.map((d) => (
                <li key={d.id} className={styles.row}>
                  <div className={styles.main}>
                    <span className={styles.what}>{d.donor.nickname}</span>
                    <span className={styles.detail}>
                      <BroadcastLink broadcast={d.broadcast} />
                    </span>
                    {d.message && <p className={styles.message}>{d.message}</p>}
                    <span className={styles.muted}>
                      <HistoryTime at={d.approvedAt} />
                    </span>
                  </div>
                  <div className={styles.amounts}>
                    <span className={styles.amount}>
                      {formatDonationAmount(d)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {received.data.count > received.data.donations.length && (
            <p className={styles.note}>최근 {HISTORY_LIMIT}건까지 보입니다.</p>
          )}
        </>
      )}
    </section>
  );
}
