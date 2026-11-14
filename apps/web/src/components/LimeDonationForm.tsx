import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { newIdempotencyKey } from '../donation/idempotencyKey';
import {
  onCharge,
  openChargeTab,
  openDonateTab,
} from '../donation/donationChannel';
import {
  DONATION_AMOUNT_PRESETS,
  DONATION_MAX_AMOUNT,
  DONATION_MESSAGE_MAX_LENGTH,
  DONATION_MIN_AMOUNT,
  isDonationAmount,
  type ConfirmedDonation,
} from '../donations';
import { formatLime, type LimeBalance } from '../lime';
import type { LoginPageState } from '../pages/LoginPage';
import { usePolledApi } from '../use-api';
import styles from './LimeDonationForm.module.css';

// 충전 탭은 보통 바로 결과를 알린다. 이것은 놓친 메시지만
// 잡는다(다른 브라우저, BroadcastChannel 없음).
const BALANCE_POLL_MS = 30_000;

const AMOUNT_RANGE_ERROR = `${formatLime(DONATION_MIN_AMOUNT)}부터 ${formatLime(DONATION_MAX_AMOUNT)}까지 후원할 수 있습니다.`;

// 응답을 잃기 전에 서버가 후원을 처리했을 수 있다. 그래서 이 문구는
// 결과를 모른다고 알리고, 두 번 후원하지 않고 확인하는 방법을 알려 준다.
const UNSETTLED_MESSAGE =
  '후원 결과를 확인하지 못했습니다. 금액과 메시지를 그대로 두고 다시 누르면 두 번 후원되지 않습니다.';

// 이 시도에 대해 서버가 보낸 4xx.
function refusalMessage(err: ApiError): string {
  if (err.status === 400) return AMOUNT_RANGE_ERROR;
  if ((err.status === 403 || err.status === 409) && err.serverMessage) {
    return err.serverMessage;
  }
  return '후원하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

interface Attempt {
  orderId: string;
  amount: number;
  message: string;
}

// 시청 페이지를 떠나지 않고 라임으로 후원한다(PRD-lime 7.3). 시도마다
// 멱등 키를 따로 두고, 서버가 답할 때까지 유지한다. 응답을 잃은 뒤
// (네트워크 오류, 5xx) 다시 누르면 같은 키를 다시 보내므로,
// 서버는 그 키로 후원을 최대 한 번만 만든다. `onDonated`는 후원 뒤에,
// `onUnsettled`는 응답을 잃은 뒤에 실행한다. 후원이 처리됐을 경우에 대비해
// 목록을 다시 읽게 한다.
export function LimeDonationForm({
  broadcastId,
  onDonated,
  onUnsettled,
}: {
  broadcastId: string;
  onDonated: () => void;
  onUnsettled: () => void;
}) {
  const navigate = useNavigate();
  const { data: balanceData, reload: reloadBalance } =
    usePolledApi<LimeBalance>('/me/lime', BALANCE_POLL_MS);
  const [amount, setAmount] = useState(String(DONATION_AMOUNT_PRESETS[0]));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 응답을 잃은 시도. 없으면 비어 있다.
  const [unsettled, setUnsettled] = useState<Attempt | null>(null);

  useEffect(() => onCharge(reloadBalance), [reloadBalance]);

  const value = Number(amount);
  const balance =
    balanceData.status === 'loaded' ? balanceData.data.balance : null;
  // 고른 금액에 모자란 라임. 잔액을 모르는 동안은 0이고,
  // 그때는 서버가 판단한다.
  const shortBy =
    balance !== null && isDonationAmount(value) ? value - balance : 0;
  // 다시 누르면 미확정 시도를 다시 보낸다. 그 라임은 이미 잔액에서
  // 빠졌을 수 있으므로, 그때는 부족분 때문에 버튼을 숨기면 안 된다.
  const resending =
    unsettled !== null &&
    unsettled.amount === value &&
    unsettled.message === message.trim();
  const short = shortBy > 0 && !resending;

  async function donate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || short) return;
    if (amount.trim() === '' || !isDonationAmount(value)) {
      setError(AMOUNT_RANGE_ERROR);
      return;
    }
    const body: Attempt =
      resending && unsettled
        ? unsettled
        : {
            orderId: newIdempotencyKey(),
            amount: value,
            message: message.trim(),
          };
    setSending(true);
    setError(null);
    try {
      await apiFetch<ConfirmedDonation>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/lime-donations`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setUnsettled(null);
      setMessage('');
      onDonated();
      reloadBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: `/broadcasts/${broadcastId}` };
        void navigate('/login', { state: next });
        return;
      }
      if (err instanceof ApiError && err.status < 500) {
        // 서버가 이 시도를 판정했으므로, 다음 누름은 새 시도다.
        setUnsettled(null);
        if (err.status === 409) reloadBalance();
        setError(refusalMessage(err));
        return;
      }
      setUnsettled(body);
      setError(UNSETTLED_MESSAGE);
      reloadBalance();
      onUnsettled();
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className={styles.form}
      aria-label="라임으로 후원"
      noValidate
      onSubmit={(e) => void donate(e)}
    >
      <p className={styles.balance}>
        잔액{' '}
        <strong>
          {balance !== null
            ? formatLime(balance)
            : balanceData.status === 'failed'
              ? '확인하지 못했습니다'
              : '확인 중'}
        </strong>
      </p>
      <fieldset className={styles.presets}>
        <legend className={styles.legend}>금액</legend>
        {DONATION_AMOUNT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={styles.preset}
            aria-pressed={value === preset}
            onClick={() => {
              setAmount(String(preset));
              setError(null);
            }}
          >
            {formatLime(preset)}
          </button>
        ))}
        <input
          className={styles.amount}
          aria-label="직접 입력 (라임)"
          name="amount"
          type="number"
          inputMode="numeric"
          min={DONATION_MIN_AMOUNT}
          max={DONATION_MAX_AMOUNT}
          step={1}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
        />
      </fieldset>
      <label className={styles.field}>
        <span className={styles.label}>
          메시지 (선택)
          <span className={styles.counter}>
            {message.length}/{DONATION_MESSAGE_MAX_LENGTH}
          </span>
        </span>
        <input
          className={styles.message}
          name="message"
          type="text"
          maxLength={DONATION_MESSAGE_MAX_LENGTH}
          enterKeyHint="send"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {short ? (
        <div className={styles.short}>
          <p className={styles.shortNote}>
            라임이 {formatLime(shortBy)} 부족합니다.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={openChargeTab}
            >
              충전하기
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => openDonateTab(broadcastId)}
            >
              카드로 후원
            </button>
          </div>
        </div>
      ) : (
        <button type="submit" className={styles.primary} disabled={sending}>
          {sending ? '후원하는 중…' : '라임으로 후원'}
        </button>
      )}
    </form>
  );
}
