import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, apiFetch } from '../api';
import { useAuth } from '../auth/auth-context';
import { COMMENT_MAX_LENGTH, isEdited, type Comment } from '../comments';
import type { LoginPageState } from '../pages/LoginPage';
import { usePolledApi } from '../use-api';
import { useLoginRedirect } from '../use-login-redirect';
import { useStickToBottom } from '../use-stick-to-bottom';
import styles from './SidePanel.module.css';

// 댓글은 방송이 끝난 뒤에 쓰므로, 채팅처럼 바로 보이길 기대하지 않는다
// (PRD §8.2: 실시간 push 없음). 시청자 자신의 변경은
// 바로 다시 읽는다.
const COMMENT_POLL_MS = 5000;

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// 끝난 방송의 게시판: 모든 댓글을 작성자·시각과 함께 보이고,
// 시청자 자신의 댓글에는 수정·삭제를 단다.
export function CommentPanel({ broadcastId }: { broadcastId: string }) {
  const { state } = useAuth();
  const { data: comments, reload } = usePolledApi<Comment[]>(
    `/broadcasts/${encodeURIComponent(broadcastId)}/comments`,
    COMMENT_POLL_MS,
  );
  const loaded = comments.status === 'loaded' ? comments.data : null;
  const { listRef, onScroll, stick } =
    useStickToBottom<HTMLOListElement>(loaded);
  const me = state.status === 'authenticated' ? state.user : null;
  // 폼이 아니라 여기서 들고 있다. 그래서 다른 곳의 401(팔로우 폴링)로
  // 시청자가 로그아웃되어도 입력하던 내용이 사라지지 않는다.
  const [draft, setDraft] = useState('');
  const loginState: LoginPageState = { from: `/broadcasts/${broadcastId}` };

  return (
    <>
      {comments.status === 'failed' && (
        <p className={styles.empty}>댓글을 불러오지 못했습니다.</p>
      )}
      {loaded && loaded.length === 0 && (
        <p className={styles.empty}>
          아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.
        </p>
      )}
      {loaded && loaded.length > 0 && (
        <ol ref={listRef} className={styles.list} onScroll={onScroll}>
          {loaded.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              broadcastId={broadcastId}
              mine={me?.id === c.author.id}
              onChanged={reload}
            />
          ))}
        </ol>
      )}
      {state.status === 'anonymous' && (
        <Link to="/login" state={loginState} className={styles.login}>
          로그인하고 댓글을 남겨 보세요
        </Link>
      )}
      {(me || draft) && (
        <CommentForm
          broadcastId={broadcastId}
          draft={draft}
          setDraft={setDraft}
          onPosted={() => {
            stick();
            reload();
          }}
        />
      )}
    </>
  );
}

function CommentForm({
  broadcastId,
  draft,
  setDraft,
  onPosted,
}: {
  broadcastId: string;
  draft: string;
  setDraft: (draft: string) => void;
  onPosted: () => void;
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
      await apiFetch<Comment>(`/broadcasts/${broadcastId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: draft }),
      });
      setDraft('');
      onPosted();
    } catch (err) {
      if (toLogin(err)) return;
      setError(
        err instanceof ApiError && err.status === 404
          ? '방송을 찾을 수 없어 댓글을 남기지 못했습니다.'
          : '댓글을 등록하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)}>
      <label htmlFor="comment-draft" className={styles.label}>
        댓글 쓰기
      </label>
      <textarea
        id="comment-draft"
        className={styles.input}
        rows={2}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder="댓글을 입력하세요"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className={styles.formRow}>
        <span className={styles.count}>
          {draft.length}/{COMMENT_MAX_LENGTH}
        </span>
        <button
          type="submit"
          className={styles.primary}
          disabled={busy || empty}
        >
          등록
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

type Mode = 'view' | 'edit' | 'confirm-delete';

function CommentItem({
  comment,
  broadcastId,
  mine,
  onChanged,
}: {
  comment: Comment;
  broadcastId: string;
  mine: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toLogin = useLoginRedirect(broadcastId);

  async function run(method: 'PATCH' | 'DELETE') {
    setBusy(true);
    setError(null);
    try {
      await apiFetch<unknown>(`/comments/${comment.id}`, {
        method,
        body: method === 'PATCH' ? JSON.stringify({ body: draft }) : undefined,
      });
      setMode('view');
      onChanged();
    } catch (err) {
      if (toLogin(err)) return;
      // 이미 삭제됐다(예: 다른 탭에서). 다음 목록에서 빠진다.
      if (err instanceof ApiError && err.status === 404) {
        setMode('view');
        onChanged();
        return;
      }
      setError(
        err instanceof ApiError && err.status === 403
          ? '권한이 없습니다.'
          : method === 'PATCH'
            ? '댓글을 수정하지 못했습니다. 다시 시도해 주세요.'
            : '댓글을 삭제하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.item}>
      <div className={styles.meta}>
        <span className={styles.author}>{comment.author.nickname}</span>
        <time dateTime={comment.createdAt} className={styles.time}>
          {timeFormat.format(new Date(comment.createdAt))}
        </time>
        {isEdited(comment) && <span className={styles.time}>(수정됨)</span>}
      </div>
      {mode === 'edit' ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run('PATCH');
          }}
        >
          <label htmlFor={`edit-${comment.id}`} className={styles.label}>
            댓글 수정
          </label>
          <textarea
            id={`edit-${comment.id}`}
            className={styles.input}
            rows={2}
            maxLength={COMMENT_MAX_LENGTH}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primary}
              disabled={busy || draft.trim().length === 0}
            >
              저장
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => {
                setDraft(comment.body);
                setMode('view');
              }}
            >
              취소
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.body}>{comment.body}</p>
      )}
      {mine && mode === 'view' && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.textButton}
            aria-label="댓글 수정"
            onClick={() => {
              setDraft(comment.body);
              setMode('edit');
            }}
          >
            수정
          </button>
          <button
            type="button"
            className={styles.textButton}
            aria-label="댓글 삭제"
            onClick={() => setMode('confirm-delete')}
          >
            삭제
          </button>
        </div>
      )}
      {mode === 'confirm-delete' && (
        <div
          className={styles.confirm}
          role="group"
          aria-label="댓글 삭제 확인"
        >
          <p className={styles.confirmText}>이 댓글을 삭제할까요?</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => void run('DELETE')}
            >
              삭제하기
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => setMode('view')}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
