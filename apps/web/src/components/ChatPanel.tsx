import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import { CHAT_MAX_LENGTH, type ChatMessage } from '../chat';
import type { LoginPageState } from '../pages/LoginPage';
import { useChatFeed } from '../use-chat-feed';
import { useLoginRedirect } from '../use-login-redirect';
import { useStickToBottom } from '../use-stick-to-bottom';
import styles from './SidePanel.module.css';

// Other viewers' messages show up within a second (PRD §8.2: polling, not
// push); each poll asks only for what came after the last one.
const CHAT_POLL_MS = 1000;

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const clockFormat = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Live chat of a READY or LIVE broadcast: one line per message, newest at
// the bottom, and a box to send one.
export function ChatPanel({ broadcastId }: { broadcastId: string }) {
  const { state } = useAuth();
  const { messages, status, added } = useChatFeed(broadcastId, {
    pollMs: CHAT_POLL_MS,
  });
  const { listRef, onScroll, stick } =
    useStickToBottom<HTMLOListElement>(messages);
  const me = state.status === 'authenticated' ? state.user : null;
  // Kept here, not in the form, so a 401 elsewhere (the follow poll) that
  // logs the viewer out does not throw away what they were typing.
  const [draft, setDraft] = useState('');
  const loginState: LoginPageState = { from: `/broadcasts/${broadcastId}` };

  return (
    <>
      {status === 'failed' && (
        <p className={styles.empty}>채팅을 불러오지 못했습니다.</p>
      )}
      {status === 'loaded' && messages.length === 0 && (
        <p className={styles.empty}>
          아직 채팅이 없습니다. 첫 채팅을 남겨 보세요.
        </p>
      )}
      {messages.length > 0 && (
        <ol
          ref={listRef}
          className={`${styles.list} ${styles.chatList}`}
          onScroll={onScroll}
        >
          {messages.map((m) => (
            <ChatLine key={m.id} message={m} />
          ))}
        </ol>
      )}
      {state.status === 'anonymous' && (
        <Link to="/login" state={loginState} className={styles.login}>
          로그인하고 채팅에 참여해 보세요
        </Link>
      )}
      {(me || draft) && (
        <ChatForm
          broadcastId={broadcastId}
          draft={draft}
          setDraft={setDraft}
          onSent={(message) => {
            stick();
            added(message);
          }}
        />
      )}
    </>
  );
}

// The chat an ended broadcast had, oldest first, to read only.
export function ChatHistory({ broadcastId }: { broadcastId: string }) {
  const { messages, status } = useChatFeed(broadcastId, { pollMs: null });
  if (status === 'failed') {
    return <p className={styles.empty}>채팅 기록을 불러오지 못했습니다.</p>;
  }
  if (status === 'loaded' && messages.length === 0) {
    return <p className={styles.empty}>이 방송에는 채팅이 없었습니다.</p>;
  }
  return (
    <ol className={`${styles.list} ${styles.chatList}`}>
      {messages.map((m) => (
        <ChatLine key={m.id} message={m} />
      ))}
    </ol>
  );
}

function ChatForm({
  broadcastId,
  draft,
  setDraft,
  onSent,
}: {
  broadcastId: string;
  draft: string;
  setDraft: (draft: string) => void;
  onSent: (message: ChatMessage) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toLogin = useLoginRedirect(broadcastId);
  const empty = draft.trim().length === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (empty) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await apiFetch<ChatMessage>(
        `/broadcasts/${broadcastId}/chat`,
        { method: 'POST', body: JSON.stringify({ body: draft }) },
      );
      setDraft('');
      onSent(sent);
    } catch (err) {
      if (toLogin(err)) return;
      setError(
        err instanceof ApiError && err.status === 409 && err.serverMessage
          ? err.serverMessage
          : err instanceof ApiError && err.status === 404
            ? '방송을 찾을 수 없어 채팅을 보내지 못했습니다.'
            : '채팅을 보내지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <label htmlFor="chat-draft" className={styles.label}>
        채팅 쓰기
      </label>
      <textarea
        id="chat-draft"
        className={styles.input}
        rows={2}
        maxLength={CHAT_MAX_LENGTH}
        placeholder="채팅을 입력하세요"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className={styles.formRow}>
        <span className={styles.count}>
          {draft.length}/{CHAT_MAX_LENGTH}
        </span>
        <button
          type="submit"
          className={styles.primary}
          disabled={busy || empty}
        >
          보내기
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// One message as a line: nickname, body, then the time. Chat is neither
// edited nor deleted by its author.
function ChatLine({ message }: { message: ChatMessage }) {
  const createdAt = new Date(message.createdAt);
  return (
    <li className={styles.chatItem}>
      <p className={styles.chatLine}>
        <span className={styles.author}>{message.author.nickname}</span>{' '}
        <span className={styles.chatBody}>{message.body}</span>{' '}
        <time
          dateTime={message.createdAt}
          title={timeFormat.format(createdAt)}
          className={styles.time}
        >
          {clockFormat.format(createdAt)}
        </time>
      </p>
    </li>
  );
}
