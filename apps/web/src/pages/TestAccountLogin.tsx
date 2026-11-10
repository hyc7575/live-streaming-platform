import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import type { TestAccountKey } from '../auth/auth-context';
import styles from './TestAccountLogin.module.css';

const LABELS: Record<TestAccountKey, string> = {
  A: '스트리머 A',
  B: '사용자 B',
};

// The server lists only seeded accounts and none when the feature is off, so
// an empty list or a failed request both mean "show nothing".
// `inline` puts the label and buttons on one row, for the home intro.
export function TestAccountLogin({
  disabled,
  onLogIn,
  inline = false,
}: {
  disabled: boolean;
  onLogIn: (account: TestAccountKey) => void;
  inline?: boolean;
}) {
  const [accounts, setAccounts] = useState<TestAccountKey[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ accounts: TestAccountKey[] }>('/auth/test-accounts')
      .then((res) => {
        if (!cancelled) setAccounts(res.accounts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (accounts.length === 0) return null;

  return (
    <section
      className={inline ? styles.inline : styles.section}
      aria-labelledby="test-accounts"
    >
      <h2 id="test-accounts" className={styles.title}>
        테스트 계정으로 로그인
      </h2>
      <div className={styles.buttons}>
        {accounts.map((account) => (
          <button
            key={account}
            type="button"
            className={styles.button}
            disabled={disabled}
            onClick={() => onLogIn(account)}
          >
            {LABELS[account]}
          </button>
        ))}
      </div>
    </section>
  );
}
