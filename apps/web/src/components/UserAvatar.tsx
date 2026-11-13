import { useState } from 'react';
import styles from './UserAvatar.module.css';

// The profile image in a circle, or the nickname's first letter when there
// is none or it fails to load. The caller sizes it. Decorative: the
// nickname is always written beside it.
export function UserAvatar({
  nickname,
  avatarUrl,
  className,
}: {
  nickname: string;
  avatarUrl: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!avatarUrl && avatarUrl !== failedUrl;
  return (
    <span
      className={className ? `${styles.avatar} ${className}` : styles.avatar}
      aria-hidden="true"
    >
      {showImage ? (
        <img src={avatarUrl} alt="" onError={() => setFailedUrl(avatarUrl)} />
      ) : (
        nickname.slice(0, 1)
      )}
    </span>
  );
}
