import { afterEach, expect, it, vi } from 'vitest';
import { holdScreenWakeLock, type WakeLockStatus } from './screenWakeLock';

class FakeSentinel extends EventTarget {
  released = false;
  release() {
    if (!this.released) {
      this.released = true;
      this.dispatchEvent(new Event('release'));
    }
    return Promise.resolve();
  }
}

let visibility: DocumentVisibilityState = 'visible';
const sentinels: FakeSentinel[] = [];

function installWakeLock(request: () => Promise<FakeSentinel>) {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });
}

function grantingWakeLock() {
  installWakeLock(() => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return Promise.resolve(sentinel);
  });
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  if (next === 'hidden') sentinels.forEach((s) => void s.release());
  document.dispatchEvent(new Event('visibilitychange'));
}

vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
  () => visibility,
);

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  sentinels.length = 0;
  visibility = 'visible';
});

function track() {
  const statuses: WakeLockStatus[] = [];
  return { statuses, onChange: (s: WakeLockStatus) => statuses.push(s) };
}

it('reports unsupported when the browser has no Wake Lock API', () => {
  const { statuses, onChange } = track();
  holdScreenWakeLock(onChange);
  expect(statuses).toEqual(['unsupported']);
});

it('requests the lock again after the page comes back into view', async () => {
  grantingWakeLock();
  const { statuses, onChange } = track();
  holdScreenWakeLock(onChange);
  await vi.waitFor(() => expect(statuses.at(-1)).toBe('active'));

  setVisibility('hidden');
  expect(statuses.at(-1)).toBe('pending');
  expect(sentinels).toHaveLength(1);

  setVisibility('visible');
  await vi.waitFor(() => expect(statuses.at(-1)).toBe('active'));
  expect(sentinels.map((s) => s.released)).toEqual([true, false]);
});

it('releases the lock and stops re-requesting once released', async () => {
  grantingWakeLock();
  const { statuses, onChange } = track();
  const release = holdScreenWakeLock(onChange);
  await vi.waitFor(() => expect(statuses.at(-1)).toBe('active'));

  release();
  setVisibility('hidden');
  setVisibility('visible');
  await Promise.resolve();
  expect(sentinels.map((s) => s.released)).toEqual([true]);
  expect(statuses.at(-1)).toBe('active');
});

it('reports failed when the browser refuses the lock', async () => {
  installWakeLock(() =>
    Promise.reject(new DOMException('denied', 'NotAllowedError')),
  );
  const { statuses, onChange } = track();
  holdScreenWakeLock(onChange);
  await vi.waitFor(() => expect(statuses.at(-1)).toBe('failed'));
});
