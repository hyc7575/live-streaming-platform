import { useEffect, useState } from 'react';
import styles from './CopyLinkButton.module.css';

type CopyState = 'idle' | 'copied' | 'failed';

const COPIED_MS = 2000;

export function CopyLinkButton() {
  const [state, setState] = useState<CopyState>('idle');
  const href = window.location.href;

  useEffect(() => {
    if (state !== 'copied') return;
    const timer = setTimeout(() => setState('idle'), COPIED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // navigator.clipboard is missing on an insecure origin, and writeText
  // rejects when permission is denied.
  const copy = () => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(href))
      .then(
        () => setState('copied'),
        () => setState('failed'),
      );
  };

  return (
    <div className={styles.copy}>
      <button type="button" className={styles.button} onClick={copy}>
        {state === 'copied' ? '복사했습니다' : '링크 복사'}
      </button>
      {state === 'failed' && (
        <label className={styles.fallback}>
          <span>복사하지 못했습니다. 주소를 직접 복사하세요.</span>
          <input
            className={styles.input}
            readOnly
            value={href}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
