const pad = (n: number) => String(n).padStart(2, '0');

// H:MM:SS, 한 시간 미만이면 M:SS.
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatMinutes(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '방금 시작';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
