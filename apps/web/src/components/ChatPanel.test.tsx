import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import type { ChatMessage } from '../chat';
import { ChatHistory, ChatPanel } from './ChatPanel';

// 채팅 훅은 테스트가 정한 메시지를 돌려준다. 렌더 횟수만 본다.
let held: ChatMessage[] = [];
vi.mock('../use-chat-feed', () => ({
  useChatFeed: () => ({ messages: held, status: 'loaded', added: () => {} }),
  useChatHistory: () => ({
    messages: held,
    status: 'loaded',
    more: false,
    loadMore: () => {},
  }),
}));

const auth: AuthContextValue = {
  state: { status: 'anonymous' },
  logIn: async () => {},
  logInAsTestAccount: async () => {},
  logOut: async () => {},
  recheck: () => {},
  setUser: () => {},
};

const message = (id: string, createdAt: string): ChatMessage => ({
  id,
  body: id,
  createdAt,
  author: { id: 'u1', nickname: '불씨' },
  donation: null,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Panel() {
  return (
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <ChatPanel broadcastId="b1" />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

it('새 메시지가 와도 기존 채팅 줄은 다시 그리지 않는다', () => {
  const m1 = message('m1', '2026-11-10T01:00:00.000Z');
  const m2 = message('m2', '2026-11-10T01:00:01.000Z');
  held = [m1];
  const { rerender } = render(<Panel />);
  // format은 getter라서 접근 횟수로 시각을 만든 횟수를 센다.
  const proto = Intl.DateTimeFormat.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'format')!;
  let formats = 0;
  Object.defineProperty(proto, 'format', {
    configurable: true,
    get(this: Intl.DateTimeFormat) {
      formats++;
      return original.get!.call(this) as Intl.DateTimeFormat['format'];
    },
  });
  try {
    // 같은 메시지 객체로 다시 그리면 시각을 다시 만들지 않는다.
    held = [m1];
    rerender(<Panel />);
    expect(formats).toBe(0);

    // 새 메시지가 오면 그 줄만 시각을 만든다(title과 시각 두 번).
    held = [m1, m2];
    rerender(<Panel />);
    expect(formats).toBe(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  } finally {
    Object.defineProperty(proto, 'format', original);
  }
});

it('재생 위치가 바뀌어도 메시지 자리는 다시 계산하지 않는다', () => {
  const parse = vi.spyOn(Date, 'parse');
  held = [
    message('m1', '2026-11-10T01:00:10.000Z'),
    message('m2', '2026-11-10T01:00:20.000Z'),
  ];
  const starts = [Date.parse('2026-11-10T01:00:00.000Z')];
  parse.mockClear();
  const view = (seconds: number) => (
    <MemoryRouter>
      <ChatHistory
        broadcastId="b1"
        partStarts={starts}
        playhead={{ part: 0, seconds }}
      />
    </MemoryRouter>
  );
  const { rerender } = render(view(1));
  const first = parse.mock.calls.length;
  expect(first).toBe(2);
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);

  rerender(view(8));
  rerender(view(30));
  expect(parse.mock.calls.length).toBe(first);
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});
