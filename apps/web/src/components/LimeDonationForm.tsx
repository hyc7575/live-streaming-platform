import { useEffect, useRef, useState, type FormEvent } from 'react';
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

// A charge tab normally reports back at once; this only catches a missed
// message (another browser, no BroadcastChannel).
const BALANCE_POLL_MS = 30_000;

const AMOUNT_RANGE_ERROR = `${formatLime(DONATION_MIN_AMOUNT)}부터 ${formatLime(DONATION_MAX_AMOUNT)}까지 후원할 수 있습니다.`;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return AMOUNT_RANGE_ERROR;
    if ((err.status === 403 || err.status === 409) && err.serverMessage) {
      return err.serverMessage;
    }
  }
  return '후원하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

interface Attempt {
  orderId: string;
  amount: number;
  message: string;
}

// Donating lime without leaving the watch page (PRD-lime 7.3). Each attempt
// gets its own idempotency key, kept until the server answers it: pressing
// again after a lost response (network error, 5xx) resends the same key, so
// the server makes at most one donation of it.
export function LimeDonationForm({
  broadcastId,
  onDonated,
}: {
  broadcastId: string;
  onDonated: () => void;
}) {
  const navigate = useNavigate();
  const { data: balanceData, reload: reloadBalance } =
    usePolledApi<LimeBalance>('/me/lime', BALANCE_POLL_MS);
  const [amount, setAmount] = useState(String(DONATION_AMOUNT_PRESETS[0]));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<Attempt | null>(null);

  useEffect(() => onCharge(reloadBalance), [reloadBalance]);

  const value = Number(amount);
  const balance =
    balanceData.status === 'loaded' ? balanceData.data.balance : null;
  // How much lime the chosen amount lacks; 0 while the balance is unknown,
  // so the server decides.
  const shortBy =
    balance !== null && isDonationAmount(value) ? value - balance : 0;
  const short = shortBy > 0;

  async function donate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || short) return;
    if (amount.trim() === '' || !isDonationAmount(value)) {
      setError(AMOUNT_RANGE_ERROR);
      return;
    }
    const trimmed = message.trim();
    const last = attempt.current;
    if (!last || last.amount !== value || last.message !== trimmed) {
      attempt.current = {
        orderId: newIdempotencyKey(),
        amount: value,
        message: trimmed,
      };
    }
    const body = attempt.current;
    setSending(true);
    setError(null);
    try {
      await apiFetch<ConfirmedDonation>(
        `/broadcasts/${encodeURIComponent(broadcastId)}/lime-donations`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      attempt.current = null;
      setMessage('');
      onDonated();
      reloadBalance();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          const next: LoginPageState = { from: `/broadcasts/${broadcastId}` };
          void navigate('/login', { state: next });
          return;
        }
        // The server decided this attempt, so the next press is a new one.
        if (err.status < 500) attempt.current = null;
        if (err.status === 409) reloadBalance();
      }
      setError(errorMessage(err));
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
