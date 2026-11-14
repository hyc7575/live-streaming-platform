import { useEffect, useState } from 'react';
import { formatClock, formatMinutes } from '../elapsed';

// 시청 페이지는 매초 갱신한다. 목록 카드는 분 단위면 된다.
const PRECISION = {
  second: { tickMs: 1000, format: formatClock },
  minute: { tickMs: 60_000, format: formatMinutes },
} as const;

export type ElapsedPrecision = keyof typeof PRECISION;

function useNow(tickMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  return now;
}

// aria-live 없음: 스크린 리더가 매 틱을 읽으면 안 된다.
export function ElapsedTime({
  startedAt,
  precision,
  className,
}: {
  startedAt: string;
  precision: ElapsedPrecision;
  className?: string;
}) {
  const { tickMs, format } = PRECISION[precision];
  const now = useNow(tickMs);
  const elapsed = Math.max(0, now - Date.parse(startedAt));
  return (
    <time dateTime={startedAt} className={className}>
      {format(elapsed)}
    </time>
  );
}
