import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Broadcast } from '../broadcasts';
import { StatusBadge } from '../components/StatusBadge';
import type { LoginPageState } from './LoginPage';
import { requestPublishTicket } from '../publish/publishTicket';
import styles from './ObsPanel.module.css';
import page from './PublishPage.module.css';

type ObsUrl =
  | { kind: 'none' }
  | { kind: 'issuing' }
  | { kind: 'issued'; url: string; expiresAt: Date }
  // The server refuses an expired URL, so it is no longer shown.
  | { kind: 'expired' }
  | { kind: 'failed'; error: string };

export const OBS_STOP_REMINDER =
  '방송을 종료한 뒤에는 OBS에서도 방송 중단을 누르세요. 누르지 않으면 OBS가 계속 다시 연결을 시도합니다.';

const expiryFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Hands the streamer a WHIP URL for OBS and follows the publish through the
 * page's polled broadcast. `endControl` is the page's own 방송 종료.
 */
export function ObsPanel({
  broadcast,
  endControl,
  onIssued,
}: {
  broadcast: Broadcast;
  endControl: ReactNode;
  /** Called on each issued URL, so the ended screen knows OBS was set up. */
  onIssued: () => void;
}) {
  const navigate = useNavigate();
  const [obsUrl, setObsUrl] = useState<ObsUrl>({ kind: 'none' });
  const issuedUntil = obsUrl.kind === 'issued' ? obsUrl.expiresAt : null;

  useEffect(() => {
    if (!issuedUntil) return;
    const timer = setTimeout(
      () => setObsUrl({ kind: 'expired' }),
      issuedUntil.getTime() - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [issuedUntil]);

  async function issue() {
    setObsUrl({ kind: 'issuing' });
    const ticket = await requestPublishTicket(broadcast.id, 'obs');
    switch (ticket.kind) {
      case 'issued':
        onIssued();
        setObsUrl({
          kind: 'issued',
          url: new URL(ticket.publishUrl, window.location.origin).href,
          expiresAt: new Date(ticket.expiresAt),
        });
        return;
      case 'unauthorized': {
        const next: LoginPageState = {
          from: `/studio/broadcasts/${broadcast.id}`,
        };
        void navigate('/login', { state: next });
        return;
      }
      case 'refused':
        setObsUrl({ kind: 'failed', error: ticket.error });
        return;
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.status}>
        <StatusBadge status={broadcast.status} />
        <ObsStatusLine broadcast={broadcast} />
      </div>

      <section className={styles.section} aria-labelledby="obs-url-heading">
        <h2 id="obs-url-heading" className={styles.heading}>
          송출 주소
        </h2>
        {obsUrl.kind === 'issued' && (
          <IssuedUrl
            key={obsUrl.url}
            url={obsUrl.url}
            expiresAt={obsUrl.expiresAt}
          />
        )}
        {obsUrl.kind === 'expired' && (
          <p role="alert" className={page.warning}>
            주소가 만료되었습니다. 다시 발급하세요.
          </p>
        )}
        {obsUrl.kind === 'failed' && (
          <p role="alert" className={page.warning}>
            {obsUrl.error}
          </p>
        )}
        <div className={page.actions}>
          <button
            type="button"
            className={obsUrl.kind === 'issued' ? page.secondary : page.primary}
            disabled={obsUrl.kind === 'issuing'}
            onClick={() => void issue()}
          >
            {obsUrl.kind === 'none' || obsUrl.kind === 'issuing'
              ? 'URL 발급'
              : '다시 발급'}
          </button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="obs-guide-heading">
        <h2 id="obs-guide-heading" className={styles.heading}>
          OBS 설정
        </h2>
        <ol className={styles.guide}>
          <li>OBS 설정 › 방송에서 서비스를 WHIP으로 고릅니다.</li>
          <li>
            서버 칸에 발급한 주소를 붙여 넣습니다(Bearer 토큰 칸은 비워 둡니다).
          </li>
          <li>설정 › 출력에서 키프레임 간격을 1~2초로 맞춥니다.</li>
        </ol>
        {/* #88: OBS words a refused URL as a stream key problem, and after
            the broadcast ends it keeps reconnecting until stopped by hand. */}
        <p className={page.note}>
          OBS가 &ldquo;스트림 키에 접근할 수 없습니다&rdquo;라고 하면 주소가
          만료되었거나 방송이 끝난 것입니다. 주소를 다시 발급하세요.
        </p>
        <p className={page.note}>{OBS_STOP_REMINDER}</p>
      </section>

      {endControl && <div className={page.actions}>{endControl}</div>}
    </div>
  );
}

function ObsStatusLine({ broadcast }: { broadcast: Broadcast }) {
  if (broadcast.status === 'READY') {
    return (
      <p className={page.note}>OBS에서 방송 시작을 누르면 LIVE가 됩니다.</p>
    );
  }
  if (broadcast.status === 'LIVE' && broadcast.disconnectedAt !== null) {
    return (
      <p role="alert" className={page.warning}>
        송출이 끊겼습니다. 30초 안에 다시 연결되지 않으면 방송이 종료됩니다.
      </p>
    );
  }
  if (broadcast.status === 'LIVE') {
    return <p className={page.live}>송출이 연결되어 있습니다.</p>;
  }
  return null;
}

type CopyResult = 'idle' | 'copied' | 'failed';

function IssuedUrl({ url, expiresAt }: { url: string; expiresAt: Date }) {
  const [copy, setCopy] = useState<CopyResult>('idle');

  function copyUrl() {
    // navigator.clipboard is missing outside a secure context; that is a
    // failed copy too.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(url))
      .then(
        () => setCopy('copied'),
        () => setCopy('failed'),
      );
  }

  return (
    <>
      <div className={styles.urlRow}>
        <input
          className={styles.url}
          type="text"
          readOnly
          value={url}
          aria-label="OBS 송출 주소"
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" className={page.secondary} onClick={copyUrl}>
          복사
        </button>
      </div>
      {copy === 'copied' && (
        <p role="status" className={page.note}>
          복사했습니다.
        </p>
      )}
      {copy === 'failed' && (
        <p role="alert" className={page.warning}>
          복사하지 못했습니다. 주소를 직접 선택해 복사하세요.
        </p>
      )}
      <p className={page.note}>
        {expiryFormat.format(expiresAt)}까지 이 주소로 송출을 시작하거나 다시
        연결할 수 있습니다.
      </p>
    </>
  );
}
