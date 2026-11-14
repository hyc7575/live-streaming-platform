import { useState, type FormEvent } from 'react';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '../broadcasts';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_CATEGORY,
  type BroadcastCategory,
} from '../categories';
import styles from '../pages/AuthForm.module.css';
import chips from './CategoryChips.module.css';

export interface BroadcastFields {
  title: string;
  description: string;
  category: BroadcastCategory;
}

// 방송 만들기와 수정이 함께 쓰는 제목·카테고리·설명 폼. `onSubmit`은
// 보여 줄 오류 메시지로 resolve하고, 페이지가 이미 넘어갔으면 null로 resolve한다.
export function BroadcastForm({
  initial = { title: '', description: '', category: DEFAULT_CATEGORY },
  submitLabel,
  onSubmit,
}: {
  initial?: BroadcastFields;
  submitLabel: string;
  onSubmit: (fields: BroadcastFields) => Promise<string | null>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const message = await onSubmit({ title, description, category });
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
      {/* 실제 라디오라 ←/→로 옮기면 선택도 함께 옮는다. */}
      <fieldset className={styles.field}>
        <legend className={styles.legend}>카테고리</legend>
        <div className={chips.row}>
          {CATEGORIES.map((c) => (
            <label key={c}>
              <input
                className={chips.radio}
                type="radio"
                name="category"
                value={c}
                checked={category === c}
                onChange={() => setCategory(c)}
              />
              <span className={chips.chip}>{CATEGORY_LABEL[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>
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
