import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { type BroadcastStatus, StatusBadge } from './StatusBadge';

afterEach(cleanup);

it.each<[BroadcastStatus, string]>([
  ['READY', '방송 전'],
  ['LIVE', 'LIVE'],
  ['ENDED', '방송 종료'],
])('labels %s as %s', (status, label) => {
  render(<StatusBadge status={status} />);
  expect(screen.getByText(label)).toBeDefined();
});
