import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import type { TestAccountKey } from '../auth/auth-context';
import styles from './TestAccountLogin.module.css';

const LABELS: Record<TestAccountKey, string> = {
  A: '스트리머 A',
  B: '사용자 B',
};

// 서버는 시드 계정만 내려주고, 기능이 꺼져 있으면 하나도 주지 않는다.
// 그래서 빈 목록과 실패한 요청은 모두 "아무것도 보이지 않음"이다.
// `inline`은 홈 소개에서 쓰도록 라벨과 버튼을 한 줄에 둔다.
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
