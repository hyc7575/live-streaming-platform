import { formatWon, type DonationSummary } from '../donations';
import type { Loadable } from '../use-api';
// 패널 껍데기 다음에 이 패널의 규칙이 오도록 이 순서로 불러온다.
import sideStyles from './SidePanel.module.css';
import styles from './PublishSidePanel.module.css';

/**
 * 송출 화면 오른쪽 패널. 시청 화면의 채팅 패널 자리와 같은 곳에 이번 방송의
 * 후원 합계와 후원자별 누적 금액을 보인다. 송출 방법 탭 밖에 두어 탭을
 * 바꿔도 남는다. 개별 후원과 메시지는 토스트와 채팅 후원 줄(#166)이 맡는다.
 * `summary`는 토스트와 같은 폴링 응답이다.
 */
export function PublishSidePanel({
  summary,
}: {
  summary: Loadable<DonationSummary>;
}) {
  const loaded = summary.status === 'loaded' ? summary.data : null;
  return (
    <aside className={sideStyles.panel} aria-labelledby="publish-donations">
      <div className={styles.header}>
        <h2 id="publish-donations" className={sideStyles.heading}>
          후원
        </h2>
        {loaded && (
          <p className={styles.total}>
            <strong>{formatWon(loaded.total)}</strong>
            <span className={styles.count}>{loaded.count}건</span>
          </p>
        )}
      </div>
      {summary.status === 'failed' && (
        <p className={sideStyles.empty}>후원 내역을 불러오지 못했습니다.</p>
      )}
      {loaded && loaded.ranking.length === 0 && (
        <p className={sideStyles.empty}>아직 후원이 없습니다.</p>
      )}
      {loaded && loaded.ranking.length > 0 && (
        // 순위 금액은 카드와 라임을 1:1로 합친 값이라 원으로 적는다.
        <ol
          className={`${sideStyles.list} ${styles.ranks}`}
          aria-label="후원자별 누적 금액"
        >
          {loaded.ranking.map((rank, index) => (
            <li key={rank.donor.id} className={styles.rank}>
              <span className={styles.place}>{index + 1}</span>
              <span className={styles.donor}>{rank.donor.nickname}</span>
              <span className={styles.amount}>{formatWon(rank.total)}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
