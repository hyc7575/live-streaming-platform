import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';

/**
 * main.tsx와 같은 방식으로 `element`를 렌더링한다. data router의 splat
 * route 하나 아래에 둔다. useBlocker를 쓰는 페이지(송출 페이지)는 이게
 * 필요하고, 나머지는 선언형 MemoryRouter로 충분하다.
 */
export function renderInDataRouter(
  initialEntries: string[],
  element: ReactNode,
) {
  const router = createMemoryRouter([{ path: '*', element }], {
    initialEntries,
    initialIndex: initialEntries.length - 1,
  });
  return { router, ...render(<RouterProvider router={router} />) };
}
