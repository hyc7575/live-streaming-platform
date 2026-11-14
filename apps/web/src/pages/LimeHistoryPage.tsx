import { useEffect } from 'react';
import { onCharge, openChargeTab } from '../donation/donationChannel';
import { formatLime, type LimeBalance, type LimeLedgerEntry } from '../lime';
import { HISTORY_LIMIT } from '../history';
import { usePolledApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import styles from './History.module.css';
import { DonationTargetText, HistoryTime } from './HistoryParts';
import listStyles from './ListPage.module.css';

// 충전은 별도 탭에서 열리고, 그 탭이 donations 채널로 알린다.
// 폴링은 그 메시지가 놓친 것만 잡는다.
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

// /me: 잔액이 어디서 왔는지 보인다. 최신순이므로 맨 위 행의 잔액이
// 그 위에 보이는 잔액과 같다 (PRD-mypage KR5).
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
