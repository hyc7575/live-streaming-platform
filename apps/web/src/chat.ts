// apps/api/src/chat/chat.service.ts의 ChatMessageView와 같은 모양이다.
export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; nickname: string };
}

export const CHAT_MAX_LENGTH = 200;

// API의 CHAT_PAGE_LIMIT이다. 이만큼 꽉 찬 페이지 뒤에는 더 있을 수 있다.
export const CHAT_PAGE_LIMIT = 200;

// 화면의 메시지다. API의 (createdAt, id) 순서이고 같은 id는
// 두 번 없다. `cursor`는 다음 폴링의 `after`다. 정렬상 그 이하인
// 메시지는 모두 폴링으로 받았다. 시청자가 직접 쓴 글은 목록에 들어가도
// cursor를 옮기지 않는다. 바로 앞에 다른 사람이 보낸 메시지를
// 아직 폴링하지 못했을 수 있기 때문이다.
export interface ChatFeed {
  messages: ChatMessage[];
  cursor: string | null;
}

export type ChatFeedAction =
  | { type: 'polled'; page: ChatMessage[] }
  | { type: 'added'; message: ChatMessage };

export const EMPTY_CHAT_FEED: ChatFeed = { messages: [], cursor: null };

// createdAt은 고정 길이 ISO 문자열이고 id는 소문자 uuid라서,
// 문자열 순서가 데이터베이스의 순서와 같다.
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
