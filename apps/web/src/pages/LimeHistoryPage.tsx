import { useEffect } from 'react';
import { MyPageTabs } from '../components/MyPageTabs';
import { onCharge, openChargeTab } from '../donation/donationChannel';
import { formatLime, type LimeBalance, type LimeLedgerEntry } from '../lime';
import { HISTORY_LIMIT } from '../history';
import { usePolledApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import styles from './History.module.css';
import { DonationTargetText, HistoryTime } from './HistoryParts';
import listStyles from './ListPage.module.css';

// The charge opens in its own tab, which says so over the donations channel;
// the poll only catches what that message misses.
const LIME_POLL_MS = 30_000;

function signed(delta: number): string {
  return delta > 0 ? `+${formatLime(delta)}` : `−${formatLime(-delta)}`;
}

function LedgerRow({ entry }: { entry: LimeLedgerEntry }) {
  return (
    <li className={styles.row}>
      <div className={styles.main}>
        <span className={styles.what}>
          {entry.kind === 'CHARGE' ? '충전' : '후원'}
        </span>
        {entry.donation && (
          <span className={styles.detail}>
            <DonationTargetText target={entry.donation} />
          </span>
        )}
        <span className={styles.muted}>
          <HistoryTime at={entry.createdAt} />
        </span>
      </div>
      <div className={styles.amounts}>
        <span
          className={
            entry.delta > 0 ? `${styles.amount} ${styles.plus}` : styles.amount
          }
        >
          {signed(entry.delta)}
        </span>
        <span className={styles.muted}>
          잔액 {formatLime(entry.balanceAfter)}
        </span>
      </div>
    </li>
  );
}

// /me: where the balance came from. Newest first, so the top row's balance
// is the balance above it (PRD-mypage KR5).
export function LimeHistoryPage() {
  useDocumentTitle('라임 내역');
  const balance = usePolledApi<LimeBalance>('/me/lime', LIME_POLL_MS);
  const ledger = usePolledApi<LimeLedgerEntry[]>(
    '/me/lime/ledger',
    LIME_POLL_MS,
  );
  const reloadBalance = balance.reload;
  const reloadLedger = ledger.reload;

  useEffect(
    () =>
      onCharge(() => {
        reloadBalance();
        reloadLedger();
      }),
    [reloadBalance, reloadLedger],
  );

  return (
    <section>
      <MyPageTabs />
      <div className={listStyles.heading}>
        <h1 className={listStyles.title}>라임 내역</h1>
      </div>
      <div className={styles.summary}>
        <p className={styles.summaryText}>
          <span className={styles.muted}>잔액</span>
          <strong>
            {balance.data.status === 'loaded'
              ? formatLime(balance.data.data.balance)
              : '…'}
          </strong>
        </p>
        <button type="button" className={styles.action} onClick={openChargeTab}>
          충전하기
        </button>
      </div>
      {ledger.data.status === 'failed' && (
        <p role="alert">라임 내역을 불러오지 못했습니다.</p>
      )}
      {ledger.data.status === 'loaded' &&
        (ledger.data.data.length === 0 ? (
          <p className={listStyles.empty}>
            아직 라임 내역이 없습니다. 충전하면 여기에 보입니다.
          </p>
        ) : (
          <>
            <ol className={styles.list}>
              {ledger.data.data.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </ol>
            {ledger.data.data.length >= HISTORY_LIMIT && (
              <p className={styles.note}>
                최근 {HISTORY_LIMIT}건까지 보입니다.
              </p>
            )}
          </>
        ))}
    </section>
  );
}
