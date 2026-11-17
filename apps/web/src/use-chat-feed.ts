import { useCallback, useEffect, useRef, useState } from 'react';
import { pollFetch } from './use-api';
import {
  CHAT_HELD_LIMIT,
  CHAT_PAGE_LIMIT,
  chatFeed,
  EMPTY_CHAT_FEED,
  keepLatest,
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

const chatPath = (broadcastId: string) =>
  `/broadcasts/${encodeURIComponent(broadcastId)}/chat`;

// 리듀서 결과를 broadcastId와 함께 들고, 폴링 루프가 최신 값을 읽도록
// ref에도 반영한다. 실시간 피드와 채팅 기록이 같이 쓴다.
function useTaggedFeed(broadcastId: string, limit: number | null) {
  const [state, setState] = useState(() => initial(broadcastId));
  // 폴링 루프에는 closure가 본 cursor가 아니라 최신 feed의 cursor가
  // 필요하다. 그래서 바뀔 때마다 여기에도 반영한다.
  const latest = useRef(state);

  const update = useCallback(
    (action: ChatFeedAction | null, status?: ChatFeedStatus) => {
      const base = heldFor(latest.current, broadcastId);
      const feed = action ? chatFeed(base.feed, action) : base.feed;
      const next: Tagged = {
        broadcastId,
        feed: limit === null ? feed : keepLatest(feed, limit),
        status: status ?? base.status,
      };
      const prev = latest.current;
      latest.current = next;
      // 빈 응답처럼 보이는 내용이 그대로면 상태를 올리지 않는다. 그러면
      // 1초 폴링마다 채팅 목록이 다시 그려지지 않는다.
      if (
        prev.broadcastId === next.broadcastId &&
        prev.status === next.status &&
        prev.feed.messages === next.feed.messages &&
        prev.feed.cursor === next.feed.cursor
      ) {
        return;
      }
      setState(next);
    },
    [broadcastId, limit],
  );
  const current = useCallback(
    () => heldFor(latest.current, broadcastId),
    [broadcastId],
  );
  return { state: heldFor(state, broadcastId), update, current };
}

// 방송 채팅을 `after` cursor로 읽는다(PRD §8.2: 실시간 push 없음).
// 처음에는 최근 한 페이지(`latest=true`)만 읽고(#213), 그다음부터 마지막
// id 뒤를 읽는다. 그 페이지가 꽉 찼으면 바로 이어 읽고, 아니면 다음
// 폴링까지 `pollMs`를 기다린다. 들고 있는 메시지는 `CHAT_HELD_LIMIT`개까지다.
// `added`는 시청자가 직접 쓴 글을 바로 보여 준다.
export function useChatFeed(
  broadcastId: string,
  { pollMs }: { pollMs: number },
): {
  messages: ChatMessage[];
  status: ChatFeedStatus;
  added: (message: ChatMessage) => void;
} {
  const { state, update, current } = useTaggedFeed(
    broadcastId,
    CHAT_HELD_LIMIT,
  );

  useEffect(() => {
    let cancelled = false;
    // 이 effect가 끝나면(화면을 떠남, 방송이 바뀜) 진행 중 요청을 끊는다.
    // 응답이 오지 않는 요청은 pollFetch가 제한 시간에 끊으므로, 다음 요청을
    // 예약하는 아래 루프가 멈추지 않는다(#205).
    const life = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const path = chatPath(broadcastId);
    const later = () => {
      timer = setTimeout(() => void poll(), pollMs);
    };
    const poll = async () => {
      const { cursor } = current().feed;
      let page: ChatMessage[];
      try {
        page = await pollFetch<ChatMessage[]>(
          cursor
            ? `${path}?after=${encodeURIComponent(cursor)}`
            : `${path}?latest=true`,
          life.signal,
        );
      } catch {
        if (cancelled) return;
        // 다시 읽기에 실패하면 화면의 내용을 두고 다시 시도한다.
        if (current().status === 'loading') update(null, 'failed');
        later();
        return;
      }
      if (cancelled) return;
      update({ type: 'polled', page }, 'loaded');
      // 최근 페이지는 늘 가장 새 것이라 이어 읽을 것이 없다.
      if (cursor && page.length === CHAT_PAGE_LIMIT) void poll();
      else later();
    };
    void poll();
    return () => {
      cancelled = true;
      life.abort();
      clearTimeout(timer);
    };
  }, [broadcastId, pollMs, update, current]);

  const added = useCallback(
    (message: ChatMessage) => update({ type: 'added', message }),
    [update],
  );
  return { messages: state.feed.messages, status: state.status, added };
}

// 끝난 방송의 채팅을 처음부터 한 페이지씩 읽는다(#213). 처음 한 페이지를
// 읽고, 다음 페이지는 `loadMore`를 부를 때만 읽는다. 다시보기는 재생 위치가
// 받은 메시지 끝에 닿으면 부른다. 요청은 겹치지 않는다. 받은 메시지는
// 버리지 않는다(뒤로 탐색해도 다시 받지 않게). 받는 양은 재생 위치까지다.
export function useChatHistory(broadcastId: string): {
  messages: ChatMessage[];
  status: ChatFeedStatus;
  more: boolean;
  loadMore: () => void;
} {
  const { state, update, current } = useTaggedFeed(broadcastId, null);
  // 마지막 페이지가 꽉 찼는가(더 있을 수 있다). broadcastId와 함께 든다.
  const [full, setFull] = useState<{ broadcastId: string; full: boolean }>({
    broadcastId,
    full: false,
  });
  // 지금 읽는 중인 요청의 controller다. 화면을 떠나면 끊는다.
  const life = useRef<AbortController | null>(null);
  const busy = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    const controller = life.current;
    if (!controller || busy.current === controller) return;
    busy.current = controller;
    const { cursor } = current().feed;
    const path = chatPath(broadcastId);
    try {
      const page = await pollFetch<ChatMessage[]>(
        cursor ? `${path}?after=${encodeURIComponent(cursor)}` : path,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      update({ type: 'polled', page }, 'loaded');
      const isFull = page.length === CHAT_PAGE_LIMIT;
      setFull((prev) =>
        prev.broadcastId === broadcastId && prev.full === isFull
          ? prev
          : { broadcastId, full: isFull },
      );
    } catch {
      if (controller.signal.aborted) return;
      if (current().status === 'loading') update(null, 'failed');
    } finally {
      if (busy.current === controller) busy.current = null;
    }
  }, [broadcastId, update, current]);

  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    void read();
    return () => controller.abort();
  }, [read]);

  const more = full.broadcastId === broadcastId && full.full;
  const loadMore = useCallback(() => {
    if (more) void read();
  }, [more, read]);
  return {
    messages: state.feed.messages,
    status: state.status,
    more,
    loadMore,
  };
}
