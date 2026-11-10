import { useEffect, useState } from 'react';
import { formatClock, formatMinutes } from '../elapsed';

// The watch page ticks every second; a list card only needs the minute.
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

// No aria-live: a screen reader should not announce every tick.
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
