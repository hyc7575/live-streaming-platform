import type { BroadcastGame } from '../broadcasts';
import { CATEGORY_LABEL, type BroadcastCategory } from '../categories';
import styles from './CategoryBadge.module.css';

// "기타"는 아무것도 말해 주지 않는 잡음이라 배지를 달지 않는다.
// 긴 게임 이름은 말줄임하므로 전체 문구를 title로 남긴다.
export function CategoryBadge({
  category,
  game = null,
  className = '',
}: {
  category: BroadcastCategory;
  game?: BroadcastGame | null;
  className?: string;
}) {
  if (category === 'ETC') return null;
  const label =
    category === 'GAME' && game
      ? `${CATEGORY_LABEL.GAME} · ${game.name}`
      : CATEGORY_LABEL[category];
  return (
    <span
      className={`${styles.badge} ${className}`}
      title={game ? label : undefined}
    >
      {label}
    </span>
  );
}
