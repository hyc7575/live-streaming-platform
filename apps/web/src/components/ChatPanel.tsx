import { memo, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import { CHAT_HELD_LIMIT, CHAT_MAX_LENGTH, type ChatMessage } from '../chat';
import { formatDonationAmount } from '../donations';
import type { LoginPageState } from '../pages/LoginPage';
import { chatPlacements, chatReached, type Playhead } from '../replay-chat';
import { useChatFeed, useChatHistory } from '../use-chat-feed';
import { useLoginRedirect } from '../use-login-redirect';
import { useStickToBottom } from '../use-stick-to-bottom';
import styles from './SidePanel.module.css';

// 다른 시청자의 메시지는 1초 안에 보인다(PRD §8.2: push가 아니라 폴링).
// 폴링마다 지난번 이후에 온 것만 요청한다.
const CHAT_POLL_MS = 1000;

// 한 계정이 짧은 시간에 너무 많이 보내면 API가 429로 막는다(#213).
// 초안은 그대로 남아 잠시 뒤 다시 보낼 수 있다.
export const CHAT_TOO_FAST_MESSAGE =
  '채팅을 너무 빠르게 보내고 있습니다. 잠시 후 다시 보내 주세요.';

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

// READY나 LIVE 방송의 실시간 채팅: 메시지마다 한 줄, 최신이 맨
// 아래에 오고, 보낼 입력창이 있다.
export function ChatPanel({ broadcastId }: { broadcastId: string }) {
  const { state } = useAuth();
  const { messages, status, added } = useChatFeed(broadcastId, {
    pollMs: CHAT_POLL_MS,
  });
  const { listRef, onScroll, stick } =
    useStickToBottom<HTMLOListElement>(messages);
  const me = state.status === 'authenticated' ? state.user : null;
  // 폼이 아니라 여기서 들고 있다. 그래서 다른 곳의 401(팔로우 폴링)로
  // 시청자가 로그아웃되어도 입력하던 내용이 사라지지 않는다.
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

// 끝난 방송의 채팅을 오래된 순으로, 읽기 전용으로 보여 준다. 다시보기가
// 재생되는 동안에는 생방송을 보듯 그 시점까지 보낸 것만 보여 준다.
// 채팅은 처음부터 한 페이지씩 받는다(#213). 재생 위치가 받은 메시지 끝에
// 닿으면 다음 페이지를 받는다. 재생 위치나 파트 시작 시각이 없으면 받은
// 것을 모두 보여 주고 "채팅 더 보기"로 이어 받는다. 그리는 줄은 마지막
// `CHAT_HELD_LIMIT`개다.
export function ChatHistory({
  broadcastId,
  partStarts,
  playhead,
}: {
  broadcastId: string;
  partStarts: number[] | null;
  playhead: Playhead | null;
}) {
  const { messages, status, more, loadMore } = useChatHistory(broadcastId);
  const synced = partStarts !== null && playhead !== null;
  // 메시지 자리는 메시지·파트 시작점이 바뀔 때만 계산한다. 재생 위치는
  // 1초에 한 번쯤 바뀌므로 그때는 거르기만 한다.
  const placements = useMemo(
    () => (partStarts ? chatPlacements(messages, partStarts) : null),
    [messages, partStarts],
  );
  const reached =
    synced && placements
      ? chatReached(messages, placements, playhead)
      : messages;
  // 재생이 받은 메시지를 모두 지나쳤으면 다음 페이지가 필요하다.
  const caughtUp = synced && reached.length === messages.length;
  useEffect(() => {
    if (caughtUp && more) loadMore();
  }, [caughtUp, more, loadMore]);
  const shown = reached.slice(-CHAT_HELD_LIMIT);
  // 재생 위치는 1초에 여러 번 움직인다. 보이는 내용이 바뀔 때만
  // 스크롤을 옮겨야 한다.
  const { listRef, onScroll } = useStickToBottom<HTMLOListElement>(
    shown.at(-1)?.id,
  );
  if (status === 'failed') {
    return <p className={styles.empty}>채팅 기록을 불러오지 못했습니다.</p>;
  }
  if (status === 'loaded' && messages.length === 0) {
    return <p className={styles.empty}>이 방송에는 채팅이 없었습니다.</p>;
  }
  if (status === 'loaded' && shown.length === 0) {
    return <p className={styles.empty}>이 장면까지 오간 채팅이 없습니다.</p>;
  }
  return (
    <>
      <ol
        ref={listRef}
        className={`${styles.list} ${styles.chatList}`}
        onScroll={onScroll}
      >
        {shown.map((m) => (
          <ChatLine key={m.id} message={m} />
        ))}
      </ol>
      {!synced && more && (
        <button type="button" className={styles.textButton} onClick={loadMore}>
          채팅 더 보기
        </button>
      )}
    </>
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
  // textarea의 maxLength가 이미 초안을 길이 제한 안에 둔다.
  const canSend = !busy && draft.trim().length > 0;

  async function send() {
    if (!canSend) return;
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
            : err instanceof ApiError && err.status === 429
              ? CHAT_TOO_FAST_MESSAGE
              : '채팅을 보내지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Enter는 보내고 Shift+Enter는 줄을 바꾼다. 한글 음절을 확정하는 Enter는
  // 보내기가 아니다. Chrome은 isComposing으로 표시하고, Safari는 compositionend
  // 뒤에 keyCode 229로 보낸다.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    void send();
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label htmlFor="chat-draft" className={styles.label}>
        채팅 쓰기
      </label>
      <textarea
        id="chat-draft"
        className={styles.input}
        rows={2}
        maxLength={CHAT_MAX_LENGTH}
        placeholder="채팅을 입력하세요"
        enterKeyHint="send"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.formRow}>
        <span className={styles.count}>
          {draft.length}/{CHAT_MAX_LENGTH}
        </span>
        <button
          type="submit"
          className={`${styles.primary} ${styles.send}`}
          disabled={!canSend}
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

// 메시지 하나를 한 줄로: 닉네임, 본문, 시각 순. 채팅은 작성자가
// 고치거나 지울 수 없다. 후원 줄은 옅은 라임 면에 "닉네임님이 금액 후원"을
// 앞세우고 메시지를 그 아래 줄에 둔다.
// memo라서 같은 메시지 객체면 다시 그리지 않는다.
const ChatLine = memo(function ChatLine({ message }: { message: ChatMessage }) {
  const time = <ChatTime createdAt={message.createdAt} />;
  if (message.donation) {
    return (
      <li className={styles.donationItem}>
        <p className={styles.chatLine}>
          <span className={styles.donationHead}>
            {`${message.author.nickname}님이 ${formatDonationAmount(message.donation)} 후원`}
          </span>{' '}
          {time}
        </p>
        {message.body && (
          <p className={`${styles.chatLine} ${styles.chatBody}`}>
            {message.body}
          </p>
        )}
      </li>
    );
  }
  return (
    <li className={styles.chatItem}>
      <p className={styles.chatLine}>
        <span className={styles.author}>{message.author.nickname}</span>{' '}
        <span className={styles.chatBody}>{message.body}</span> {time}
      </p>
    </li>
  );
});

function ChatTime({ createdAt }: { createdAt: string }) {
  // 시각 문자열은 createdAt이 같으면 다시 만들지 않는다.
  const { title, clock } = useMemo(() => {
    const at = new Date(createdAt);
    return { title: timeFormat.format(at), clock: clockFormat.format(at) };
  }, [createdAt]);
  return (
    <time dateTime={createdAt} title={title} className={styles.time}>
      {clock}
    </time>
  );
}
