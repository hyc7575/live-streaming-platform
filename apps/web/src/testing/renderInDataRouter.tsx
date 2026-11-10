import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';

/**
 * Renders `element` the way main.tsx does: under one splat route of a data
 * router. A page that uses useBlocker (the publish page) needs this; the
 * declarative MemoryRouter is enough for the rest.
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
