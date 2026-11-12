import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, apiFetch } from '../api';
import type { Broadcast } from '../broadcasts';
import { PaymentStep } from '../donation/PaymentStep';
import {
  DONATION_AMOUNT_PRESETS,
  DONATION_MAX_AMOUNT,
  DONATION_MESSAGE_MAX_LENGTH,
  DONATION_MIN_AMOUNT,
  formatWon,
  isDonationAmount,
  rememberOrderBroadcast,
  type DonationOrder,
} from '../donations';
import { useApi } from '../use-api';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';
import styles from './DonatePage.module.css';
import type { LoginPageState } from './LoginPage';

const AMOUNT_RANGE_ERROR = `${formatWon(DONATION_MIN_AMOUNT)}부터 ${formatWon(DONATION_MAX_AMOUNT)}까지 후원할 수 있습니다.`;

function orderErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return '후원을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  switch (err.status) {
    case 400:
      return '금액과 메시지를 확인해 주세요.';
    case 403:
      return err.serverMessage ?? '내 방송에는 후원할 수 없습니다.';
    case 404:
      return '방송을 찾을 수 없습니다.';
    case 409:
      return err.serverMessage ?? '방송 중일 때만 후원할 수 있습니다.';
    case 503:
      return err.serverMessage ?? '후원 기능이 설정되지 않았습니다.';
    default:
      return '후원을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

// Step 1 saves an order; step 2 pays it through the Toss payment widget.
export function DonatePage() {
  useDocumentTitle('후원하기');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const broadcast = useApi<Broadcast>(`/broadcasts/${encodeURIComponent(id)}`);
  const [amount, setAmount] = useState(String(DONATION_AMOUNT_PRESETS[0]));
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState<DonationOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (amount.trim() === '' || !isDonationAmount(value)) {
      setError(AMOUNT_RANGE_ERROR);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const placed = await apiFetch<DonationOrder>(
        `/broadcasts/${encodeURIComponent(id)}/donations`,
        {
          method: 'POST',
          body: JSON.stringify({ amount: value, message: message.trim() }),
        },
      );
      rememberOrderBroadcast(placed.orderId, id);
      setOrder(placed);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: `/broadcasts/${id}/donate` };
        void navigate('/login', { state: next });
        return;
      }
      setError(orderErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card}>
      <h1 className={form.title}>후원하기</h1>
      {broadcast.status === 'loaded' && (
        <p className={form.notice}>
          {broadcast.data.streamer.nickname} 스트리머의 방송 “
          {broadcast.data.title}”에 후원합니다.
        </p>
      )}
      {order ? (
        <PaymentStep
          order={order}
          summary={
            <>
              <strong>{formatWon(order.amount)}</strong> 후원
            </>
          }
          successPath="/donations/success"
          failPath="/donations/fail"
          onChangeAmount={() => {
            setOrder(null);
            setError(null);
          }}
        />
      ) : (
        <form
          className={form.form}
          noValidate
          onSubmit={(e) => void placeOrder(e)}
        >
          <fieldset className={styles.presets}>
            <legend className={styles.legend}>금액</legend>
            {DONATION_AMOUNT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={styles.preset}
                aria-pressed={Number(amount) === preset}
                onClick={() => setAmount(String(preset))}
              >
                {formatWon(preset)}
              </button>
            ))}
          </fieldset>
          <div className={form.field}>
            <label htmlFor="donation-amount">직접 입력 (원)</label>
            <input
              id="donation-amount"
              aria-describedby="donation-amount-hint"
              className={form.input}
              name="amount"
              type="number"
              inputMode="numeric"
              min={DONATION_MIN_AMOUNT}
              max={DONATION_MAX_AMOUNT}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span id="donation-amount-hint" className={form.hint}>
              {AMOUNT_RANGE_ERROR}
            </span>
          </div>
          <div className={form.field}>
            <label htmlFor="donation-message">메시지 (선택)</label>
            <textarea
              id="donation-message"
              aria-describedby="donation-message-count"
              className={form.input}
              name="message"
              rows={3}
              maxLength={DONATION_MESSAGE_MAX_LENGTH}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <span id="donation-message-count" className={form.hint}>
              {`${message.length}/${DONATION_MESSAGE_MAX_LENGTH}`}
            </span>
          </div>
          {error && (
            <p className={form.error} role="alert">
              {error}
            </p>
          )}
          <button className={form.submit} type="submit" disabled={submitting}>
            다음
          </button>
        </form>
      )}
      <p className={form.footer}>
        <Link to={`/broadcasts/${id}`}>방송으로 돌아가기</Link>
      </p>
    </section>
  );
}
