import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import {
  CHAT_PAGE_LIMIT,
  chatFeed,
  EMPTY_CHAT_FEED,
  type ChatFeed,
  type ChatFeedAction,
  type ChatMessage,
} from './chat';

export type ChatFeedStatus = 'loading' | 'loaded' | 'failed';

interface Tagged {
  broadcastId: string;
  feed: ChatFeed;
  status: ChatFeedStatus;
}

const initial = (broadcastId: string): Tagged => ({
  broadcastId,
  feed: EMPTY_CHAT_FEED,
  status: 'loading',
});

// `tagged`가 `broadcastId`에 대해 가진 값이다. 다른 방송의 값이면 아직 아무것도 없다.
const heldFor = (tagged: Tagged, broadcastId: string): Tagged =>
  tagged.broadcastId === broadcastId ? tagged : initial(broadcastId);

// 방송 채팅을 `after` cursor로 읽는다(PRD §8.2: 실시간
// push 없음). 꽉 찬 페이지 뒤에는 바로 이어 읽고, 아니면 다음 폴링까지
// `pollMs`를 기다린다. `pollMs: null`이면 끝까지 한 번 읽고 멈춘다.
// `added`는 시청자가 직접 쓴 글을 바로 보여 준다.
export function useChatFeed(
  broadcastId: string,
  { pollMs }: { pollMs: number | null },
): {
  messages: ChatMessage[];
  status: ChatFeedStatus;
  added: (message: ChatMessage) => void;
} {
  const [state, setState] = useState(() => initial(broadcastId));
  // 폴링 루프에는 closure가 본 cursor가 아니라 최신 feed의 cursor가
  // 필요하다. 그래서 바뀔 때마다 여기에도 반영한다.
  const latest = useRef(state);

  const update = useCallback(
    (action: ChatFeedAction | null, status?: ChatFeedStatus) => {
      const base = heldFor(latest.current, broadcastId);
      latest.current = {
        broadcastId,
        feed: action ? chatFeed(base.feed, action) : base.feed,
        status: status ?? base.status,
      };
      setState(latest.current);
    },
    [broadcastId],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const path = `/broadcasts/${encodeURIComponent(broadcastId)}/chat`;
    const later = () => {
      if (pollMs !== null) timer = setTimeout(() => void poll(), pollMs);
    };
    const poll = async () => {
      const { cursor } = heldFor(latest.current, broadcastId).feed;
      let page: ChatMessage[];
      try {
        page = await apiFetch<ChatMessage[]>(
          cursor ? `${path}?after=${encodeURIComponent(cursor)}` : path,
        );
      } catch {
        if (cancelled) return;
        // 다시 읽기에 실패하면 화면의 내용을 두고 다시 시도한다.
        if (heldFor(latest.current, broadcastId).status === 'loading') {
          update(null, 'failed');
        }
        later();
        return;
      }
      if (cancelled) return;
      update({ type: 'polled', page }, 'loaded');
      if (page.length === CHAT_PAGE_LIMIT) void poll();
      else later();
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [broadcastId, pollMs, update]);

  const added = useCallback(
    (message: ChatMessage) => update({ type: 'added', message }),
    [update],
  );
  const { feed, status } = heldFor(state, broadcastId);
  return { messages: feed.messages, status, added };
}
