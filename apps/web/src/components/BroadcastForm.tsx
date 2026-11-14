import { useState, type FormEvent } from 'react';
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type Broadcast,
  type BroadcastGame,
} from '../broadcasts';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_CATEGORY,
  type BroadcastCategory,
} from '../categories';
import styles from '../pages/AuthForm.module.css';
import chips from './CategoryChips.module.css';
import { GameCombobox } from './GameCombobox';

// POST·PATCH 본문. 게임 필드는 카테고리가 GAME일 때만 보낸다. 다른
// 카테고리로 바꾸면 서버가 게임을 비운다.
export interface BroadcastFields {
  title: string;
  description: string;
  category: BroadcastCategory;
  gameQid?: string | null;
  gameName?: string | null;
}

type FormStart = Pick<Broadcast, 'title' | 'description' | 'category' | 'game'>;

const NO_GAME: BroadcastGame = { qid: null, name: '' };

// 목록에서 고른 게임은 qid만 보내고 이름은 서버가 채운다.
function gameFields(game: BroadcastGame) {
  const name = game.name.trim();
  if (game.qid) return { gameQid: game.qid, gameName: null };
  return { gameQid: null, gameName: name || null };
}

// 방송 만들기와 수정이 함께 쓰는 제목·카테고리·게임·설명 폼. `onSubmit`은
// 보여 줄 오류 메시지로 resolve하고, 페이지가 이미 넘어갔으면 null로 resolve한다.
export function BroadcastForm({
  initial = {
    title: '',
    description: '',
    category: DEFAULT_CATEGORY,
    game: null,
  },
  submitLabel,
  onSubmit,
}: {
  initial?: FormStart;
  submitLabel: string;
  onSubmit: (fields: BroadcastFields) => Promise<string | null>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [game, setGame] = useState(initial.game ?? NO_GAME);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const message = await onSubmit({
      title,
      description,
      category,
      ...(category === 'GAME' ? gameFields(game) : {}),
    });
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
      {category === 'GAME' && <GameCombobox value={game} onChange={setGame} />}
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
