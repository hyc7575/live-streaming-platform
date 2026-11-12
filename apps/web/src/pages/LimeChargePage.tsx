import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { closeTabOr } from '../donation/donationChannel';
import { PaymentStep } from '../donation/PaymentStep';
import {
  LIME_CHARGE_MAX_AMOUNT,
  LIME_CHARGE_MIN_AMOUNT,
  LIME_CHARGE_PRESETS,
  formatLime,
  isChargeAmount,
  type LimeChargeOrder,
} from '../lime';
import { useDocumentTitle } from '../use-document-title';
import form from './AuthForm.module.css';
import styles from './DonatePage.module.css';
import type { LoginPageState } from './LoginPage';

const AMOUNT_RANGE_ERROR = `${formatLime(LIME_CHARGE_MIN_AMOUNT)}부터 ${formatLime(LIME_CHARGE_MAX_AMOUNT)}까지 충전할 수 있습니다.`;

function orderErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return AMOUNT_RANGE_ERROR;
    if (err.status === 503 && err.serverMessage) return err.serverMessage;
  }
  return '충전을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

// Opened in its own tab (PRD-lime 7.3). Step 1 saves a charge order; step 2
// pays it through the same Toss widget as a card donation.
export function LimeChargePage() {
  useDocumentTitle('라임 충전');
  const navigate = useNavigate();
  const [amount, setAmount] = useState(String(LIME_CHARGE_PRESETS[0]));
  const [order, setOrder] = useState<LimeChargeOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (amount.trim() === '' || !isChargeAmount(value)) {
      setError(AMOUNT_RANGE_ERROR);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setOrder(
        await apiFetch<LimeChargeOrder>('/lime/charges', {
          method: 'POST',
          body: JSON.stringify({ amount: value }),
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next: LoginPageState = { from: '/lime/charge' };
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
      <h1 className={form.title}>라임 충전</h1>
      <p className={form.notice}>
        1라임은 1원입니다. 충전한 라임으로 방송에 후원할 수 있습니다.
      </p>
      {order ? (
        <PaymentStep
          order={order}
          summary={
            <>
              <strong>{formatLime(order.amount)}</strong> 충전
            </>
          }
          successPath="/lime/charge/success"
          failPath="/lime/charge/fail"
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
            {LIME_CHARGE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={styles.preset}
                aria-pressed={Number(amount) === preset}
                onClick={() => setAmount(String(preset))}
              >
                {formatLime(preset)}
              </button>
            ))}
          </fieldset>
          <div className={form.field}>
            <label htmlFor="lime-charge-amount">직접 입력 (라임)</label>
            <input
              id="lime-charge-amount"
              aria-describedby="lime-charge-amount-hint"
              className={form.input}
              name="amount"
              type="number"
              inputMode="numeric"
              min={LIME_CHARGE_MIN_AMOUNT}
              max={LIME_CHARGE_MAX_AMOUNT}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span id="lime-charge-amount-hint" className={form.hint}>
              {AMOUNT_RANGE_ERROR}
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
      <button
        type="button"
        className={`${styles.secondary} ${form.block}`}
        onClick={() => closeTabOr('/', (to) => void navigate(to))}
      >
        돌아가기
      </button>
    </section>
  );
}
