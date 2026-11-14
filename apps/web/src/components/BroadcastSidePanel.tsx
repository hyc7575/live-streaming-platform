import { useState, type KeyboardEvent } from 'react';
import type { Playhead } from '../replay-chat';
import { ChatHistory, ChatPanel } from './ChatPanel';
import { CommentPanel } from './CommentPanel';
import type { BroadcastStatus } from './StatusBadge';
import styles from './SidePanel.module.css';

// 방송이 끝나기 전에는 시청자가 채팅으로 이야기하고, 끝난 뒤에는 댓글을
// 남기고 그 방송의 채팅을 다시 읽을 수 있다.
const SIDE_PANEL: Record<BroadcastStatus, 'chat' | 'after'> = {
  READY: 'chat',
  LIVE: 'chat',
  ENDED: 'after',
};

// `partStarts`와 `playhead`는 채팅 기록을 다시보기 위치에 맞춘다.
// ChatHistory 참고.
export function BroadcastSidePanel({
  broadcastId,
  status,
  partStarts,
  playhead,
}: {
  broadcastId: string;
  status: BroadcastStatus;
  partStarts: number[] | null;
  playhead: Playhead | null;
}) {
  if (SIDE_PANEL[status] === 'chat') {
    return (
      <aside className={styles.panel} aria-labelledby="chat-heading">
        <h2 id="chat-heading" className={styles.heading}>
          채팅
        </h2>
        <ChatPanel broadcastId={broadcastId} />
      </aside>
    );
  }
  return (
    <aside className={styles.panel} aria-label="댓글과 채팅 기록">
      <AfterTabs
        broadcastId={broadcastId}
        partStarts={partStarts}
        playhead={playhead}
      />
    </aside>
  );
}

const TABS = [
  { key: 'comments', label: '댓글' },
  { key: 'chat', label: '채팅 기록' },
] as const;

type Tab = (typeof TABS)[number]['key'];

// 자동 활성화 방식의 WAI-ARIA 탭: ←/→는 이전·다음 탭으로(끝에서 돌아감),
// Home/End는 첫·마지막 탭으로 옮기고, 포커스가 따라간다.
function AfterTabs({
  broadcastId,
  partStarts,
  playhead,
}: {
  broadcastId: string;
  partStarts: number[] | null;
  playhead: Playhead | null;
}) {
  const [selected, setSelected] = useState<Tab>('comments');
  // 채팅 기록은 탭을 처음 열 때 읽고 그 뒤로 유지한다. 그래서 탭을
  // 오가도 댓글 초안과 채팅 기록이 모두 남는다.
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(
    () => new Set(['comments']),
  );

  function select(tab: Tab, focus = false) {
    setSelected(tab);
    setOpened((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
    if (focus) document.getElementById(tabId(tab))?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const index = TABS.findIndex((t) => t.key === selected);
    const next = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[next].key, true);
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="댓글과 채팅 기록"
        className={styles.tabs}
        onKeyDown={onKeyDown}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={tabId(t.key)}
            aria-selected={selected === t.key}
            aria-controls={panelId(t.key)}
            tabIndex={selected === t.key ? 0 : -1}
            className={styles.tab}
            onClick={() => select(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={panelId(t.key)}
          aria-labelledby={tabId(t.key)}
          hidden={selected !== t.key}
          className={styles.tabPanel}
        >
          {opened.has(t.key) &&
            (t.key === 'comments' ? (
              <CommentPanel broadcastId={broadcastId} />
            ) : (
              <ChatHistory
                broadcastId={broadcastId}
                partStarts={partStarts}
                playhead={playhead}
              />
            ))}
        </div>
      ))}
    </>
  );
}

const tabId = (tab: Tab) => `side-tab-${tab}`;
const panelId = (tab: Tab) => `side-panel-${tab}`;
