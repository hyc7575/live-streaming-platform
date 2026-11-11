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

// What `tagged` holds for `broadcastId`: nothing yet if it is another's.
const heldFor = (tagged: Tagged, broadcastId: string): Tagged =>
  tagged.broadcastId === broadcastId ? tagged : initial(broadcastId);

// Reads a broadcast's chat with the `after` cursor (PRD §8.2: no realtime
// push). A full page is followed at once; otherwise the next poll waits
// `pollMs`. With `pollMs: null` it reads to the end once and stops.
// `added` and `removed` show the viewer's own post or delete right away.
export function useChatFeed(
  broadcastId: string,
  { pollMs }: { pollMs: number | null },
): {
  messages: ChatMessage[];
  status: ChatFeedStatus;
  added: (message: ChatMessage) => void;
  removed: (id: string) => void;
} {
  const [state, setState] = useState(() => initial(broadcastId));
  // The poll loop needs the cursor of the latest feed, not the one its
  // closure saw, so every change also lands here.
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
        // A failed re-read keeps what is on screen and tries again.
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
  const removed = useCallback(
    (id: string) => update({ type: 'removed', id }),
    [update],
  );
  const { feed, status } = heldFor(state, broadcastId);
  return { messages: feed.messages, status, added, removed };
}
