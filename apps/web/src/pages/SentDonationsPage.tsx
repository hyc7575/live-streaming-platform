import {
  formatDonationAmount,
  formatWon,
  type SentDonationSummary,
} from '../donations';
import { HISTORY_LIMIT } from '../history';
import { useApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import styles from './History.module.css';
import { DonationTargetText, HistoryTime } from './HistoryParts';
import listStyles from './ListPage.module.css';

// /me/donations: every paid donation the caller sent, card and lime in one
// list. 1 lime = 1 won, so the total is in won like the watch page's.
export function SentDonationsPage() {
  useDocumentTitle('보낸 후원');
  const sent = useApi<SentDonationSummary>('/me/donations');

  return (
    <section>
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>보낸 후원</h1>
      </div>
      {sent.status === 'failed' && (
        <p role="alert">보낸 후원을 불러오지 못했습니다.</p>
      )}
      {sent.status === 'loaded' && (
        <>
          <div className={styles.summary}>
            <p className={styles.summaryText}>
              <span className={styles.muted}>합계</span>
              <strong>{formatWon(sent.data.total)}</strong>
              <span className={styles.muted}>{sent.data.count}건</span>
            </p>
          </div>
          {sent.data.donations.length === 0 ? (
            <p className={listStyles.empty}>아직 보낸 후원이 없습니다.</p>
          ) : (
            <ol className={styles.list}>
              {sent.data.donations.map((d) => (
                <li key={d.id} className={styles.row}>
                  <div className={styles.main}>
                    <span className={styles.detail}>
                      <DonationTargetText target={d} />
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
          {sent.data.count > sent.data.donations.length && (
            <p className={styles.note}>최근 {HISTORY_LIMIT}건까지 보입니다.</p>
          )}
        </>
      )}
    </section>
  );
}
