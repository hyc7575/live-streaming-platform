import { CATEGORY_LABEL, type BroadcastCategory } from '../categories';
import styles from './CategoryBadge.module.css';

// "기타"는 아무것도 말해 주지 않는 잡음이라 배지를 달지 않는다.
export function CategoryBadge({
  category,
  className = '',
}: {
  category: BroadcastCategory;
  className?: string;
}) {
  if (category === 'ETC') return null;
  return (
    <span className={`${styles.badge} ${className}`}>
      {CATEGORY_LABEL[category]}
    </span>
  );
}
