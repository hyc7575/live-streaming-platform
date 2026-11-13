import { useState } from 'react';
import styles from './UserAvatar.module.css';

// 원 안의 프로필 이미지. 없거나 로드에 실패하면 닉네임 첫 글자를
// 보인다. 크기는 호출자가 정한다. 장식용이다:
// 닉네임이 늘 옆에 적혀 있다.
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
