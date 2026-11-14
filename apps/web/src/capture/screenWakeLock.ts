export type WakeLockStatus = 'pending' | 'active' | 'unsupported' | 'failed';

/**
 * 돌려받은 해제 함수를 부를 때까지 화면을 켜 둔다.
 * 브라우저는 페이지가 숨겨질 때마다 잠금을 풀기 때문에, 페이지가
 * 다시 보일 때마다 잠금을 새로 요청한다.
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
