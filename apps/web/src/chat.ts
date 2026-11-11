// Mirrors ChatMessageView from apps/api/src/chat/chat.service.ts.
export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; nickname: string };
}

export const CHAT_MAX_LENGTH = 200;

// The API's CHAT_PAGE_LIMIT. A page this full may have more behind it.
export const CHAT_PAGE_LIMIT = 200;

// The messages on screen, in the API's (createdAt, id) order with no id
// twice. `cursor` is the `after` for the next poll: every message that sorts
// at or before it has been answered by a poll. The viewer's own post joins
// the list without moving it, because messages others sent just before it
// may not have been polled yet.
export interface ChatFeed {
  messages: ChatMessage[];
  cursor: string | null;
}

export type ChatFeedAction =
  | { type: 'polled'; page: ChatMessage[] }
  | { type: 'added'; message: ChatMessage };

export const EMPTY_CHAT_FEED: ChatFeed = { messages: [], cursor: null };

// createdAt is a fixed-width ISO string and ids are lowercase uuids, so
// string order matches the database's.
function compare(a: ChatMessage, b: ChatMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function merge(messages: ChatMessage[], incoming: ChatMessage[]) {
  const known = new Set(messages.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  if (fresh.length === 0) return messages;
  return [...messages, ...fresh].sort(compare);
}

export function chatFeed(feed: ChatFeed, action: ChatFeedAction): ChatFeed {
  switch (action.type) {
    case 'polled': {
      const last = action.page.at(-1);
      return {
        messages: merge(feed.messages, action.page),
        cursor: last ? last.id : feed.cursor,
      };
    }
    case 'added':
      return { ...feed, messages: merge(feed.messages, [action.message]) };
  }
}
