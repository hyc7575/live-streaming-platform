import { useState, type FormEvent } from 'react';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '../broadcasts';
import styles from '../pages/AuthForm.module.css';

export interface BroadcastFields {
  title: string;
  description: string;
}

// 방송 만들기와 수정이 함께 쓰는 제목·설명 폼. `onSubmit`은
// 보여 줄 오류 메시지로 resolve하고, 페이지가 이미 넘어갔으면 null로 resolve한다.
export function BroadcastForm({
  initial = { title: '', description: '' },
  submitLabel,
  onSubmit,
}: {
  initial?: BroadcastFields;
  submitLabel: string;
  onSubmit: (fields: BroadcastFields) => Promise<string | null>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const message = await onSubmit({ title, description });
    if (message) {
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
      <label className={styles.field}>
        제목
        <input
          className={styles.input}
          name="title"
          required
          maxLength={TITLE_MAX_LENGTH}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        설명 (선택)
        <textarea
          className={styles.input}
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.submit} type="submit" disabled={submitting}>
        {submitLabel}
      </button>
    </form>
  );
}
