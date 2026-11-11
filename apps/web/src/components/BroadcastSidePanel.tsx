import { useState, type KeyboardEvent } from 'react';
import { ChatHistory, ChatPanel } from './ChatPanel';
import { CommentPanel } from './CommentPanel';
import type { BroadcastStatus } from './StatusBadge';
import styles from './SidePanel.module.css';

// Before a broadcast ends, viewers talk in chat; after, they leave comments
// and can read back the chat it had.
const SIDE_PANEL: Record<BroadcastStatus, 'chat' | 'after'> = {
  READY: 'chat',
  LIVE: 'chat',
  ENDED: 'after',
};

export function BroadcastSidePanel({
  broadcastId,
  status,
}: {
  broadcastId: string;
  status: BroadcastStatus;
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
      <AfterTabs broadcastId={broadcastId} />
    </aside>
  );
}

const TABS = [
  { key: 'comments', label: '댓글' },
  { key: 'chat', label: '채팅 기록' },
] as const;

type Tab = (typeof TABS)[number]['key'];

// WAI-ARIA tabs with automatic activation: ←/→ move to the previous or next
// tab (wrapping), Home/End to the first or last, and focus follows.
function AfterTabs({ broadcastId }: { broadcastId: string }) {
  const [selected, setSelected] = useState<Tab>('comments');
  // The chat log is read when its tab is first opened, then kept so the
  // comment draft and the log both survive switching back and forth.
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
              <ChatHistory broadcastId={broadcastId} />
            ))}
        </div>
      ))}
    </>
  );
}

const tabId = (tab: Tab) => `side-tab-${tab}`;
const panelId = (tab: Tab) => `side-panel-${tab}`;
