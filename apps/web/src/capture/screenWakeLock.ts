export type WakeLockStatus = 'pending' | 'active' | 'unsupported' | 'failed';

/**
 * Keeps the screen on until the returned release function is called.
 * The browser drops the lock whenever the page is hidden, so it is requested
 * again each time the page becomes visible.
 */
export function holdScreenWakeLock(
  onChange: (status: WakeLockStatus) => void,
): () => void {
  if (!('wakeLock' in navigator)) {
    onChange('unsupported');
    return () => {};
  }

  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  async function acquire() {
    if (released || document.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    onChange('pending');
    try {
      const next = await navigator.wakeLock.request('screen');
      if (released) {
        void next.release();
        return;
      }
      sentinel = next;
      next.addEventListener('release', () => {
        if (!released) onChange('pending');
      });
      onChange('active');
    } catch {
      if (!released) onChange('failed');
    }
  }

  const onVisibilityChange = () => void acquire();
  document.addEventListener('visibilitychange', onVisibilityChange);
  void acquire();

  return () => {
    if (released) return;
    released = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    void sentinel?.release();
  };
}
