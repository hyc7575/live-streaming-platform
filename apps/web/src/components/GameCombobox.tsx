import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { apiFetch } from '../api';
import { GAME_NAME_MAX_LENGTH, type BroadcastGame } from '../broadcasts';
import form from '../pages/AuthForm.module.css';
import styles from './GameCombobox.module.css';

// GET /api/games 한 건. 순위순으로 최대 10건이 온다.
interface GameHit {
  qid: string;
  name: string;
  nameEn: string | null;
}

type Option = { kind: 'game'; hit: GameHit } | { kind: 'typed'; name: string };

const SEARCH_DELAY_MS = 300;

// WAI-ARIA 1.2 combobox(목록 자동 완성, 수동 선택). 입력칸 글자가 곧 값이고,
// 목록에서 고르면 qid가 붙고, 그 뒤 글자를 고치면 qid가 떨어져 직접 입력이 된다.
export function GameCombobox({
  value,
  onChange,
}: {
  value: BroadcastGame;
  onChange: (game: BroadcastGame) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  // 사용자가 마지막으로 친 글자. 목록에서 고른 뒤에는 null이라 다시 찾지 않는다.
  const [query, setQuery] = useState<string | null>(null);
  const [hits, setHits] = useState<GameHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const needle = query?.trim() ?? '';

  useEffect(() => {
    if (!needle) return;
    // 늦게 온 이전 검색 응답이 새 결과를 덮지 않게 한다.
    let stale = false;
    const timer = setTimeout(() => {
      apiFetch<GameHit[]>(`/games?q=${encodeURIComponent(needle)}`).then(
        (found) => {
          if (stale) return;
          setHits(found);
          setActive(-1);
        },
        // 검색이 안 돼도 직접 입력은 늘 된다.
        () => {
          if (stale) return;
          setHits([]);
          setActive(-1);
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [needle]);

  const options: Option[] =
    open && needle
      ? [
          ...hits.map((hit): Option => ({ kind: 'game', hit })),
          { kind: 'typed', name: needle },
        ]
      : [];
  const expanded = options.length > 0;
  const activeIndex = active < options.length ? active : -1;
  const optionId = (i: number) => `${id}-option-${i}`;

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function choose(option: Option) {
    onChange(
      option.kind === 'game'
        ? { qid: option.hit.qid, name: option.hit.name }
        : { qid: null, name: option.name },
    );
    setQuery(null);
    close();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합을 끝내는 Enter는 고르기가 아니다(Safari는 keyCode 229).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!expanded) {
          setOpen(true);
          return;
        }
        setActive((i) => (i + 1) % options.length);
        return;
      case 'ArrowUp':
        if (!expanded) return;
        e.preventDefault();
        setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
        return;
      case 'Enter':
        // 목록이 열려 있으면 Enter가 폼을 보내지 않는다.
        if (!expanded) return;
        e.preventDefault();
        if (activeIndex >= 0) choose(options[activeIndex]);
        else close();
        return;
      case 'Escape':
        if (!expanded) return;
        e.preventDefault();
        close();
        return;
    }
  }

  return (
    <div className={form.field}>
      <label htmlFor={id}>게임 (선택)</label>
      <div className={styles.combo}>
        <input
          id={id}
          className={`${form.input} ${styles.input}`}
          name="game"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          placeholder="게임 이름으로 검색"
          maxLength={GAME_NAME_MAX_LENGTH}
          value={value.name}
          onChange={(e) => {
            onChange({ qid: null, name: e.target.value });
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={close}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="게임 후보"
          className={styles.listbox}
          hidden={!expanded}
        >
          {options.map((option, i) => (
            <li
              key={option.kind === 'game' ? option.hit.qid : 'typed'}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={
                option.kind === 'game' ? styles.option : styles.typedOption
              }
              // 누르는 동안 입력칸이 포커스를 잃어 목록이 닫히지 않게 한다.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.kind === 'game' ? (
                <>
                  <span>{option.hit.name}</span>
                  {option.hit.nameEn &&
                    option.hit.nameEn !== option.hit.name && (
                      <span className={styles.nameEn}>{option.hit.nameEn}</span>
                    )}
                </>
              ) : (
                <>&apos;{option.name}&apos; 직접 입력</>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
