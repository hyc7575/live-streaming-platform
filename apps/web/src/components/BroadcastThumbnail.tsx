import { useState, type ReactNode } from 'react';
import type { Broadcast } from '../broadcasts';
import styles from './BroadcastThumbnail.module.css';
import { ElapsedTime } from './ElapsedTime';
import { type BroadcastStatus, StatusBadge } from './StatusBadge';

const TINT: Record<BroadcastStatus, string> = {
  READY: styles.ready,
  LIVE: styles.live,
  ENDED: styles.ended,
};

type ImageKind = 'thumbnail' | 'standby';

// 카드가 제목 첫 글자를 그리기 전에 차례로 시도하는 이미지.
// READY 방송은 아직 캡처한 프레임이 없다.
const IMAGE_ORDER: Record<BroadcastStatus, readonly ImageKind[]> = {
  READY: ['standby'],
  LIVE: ['thumbnail', 'standby'],
  ENDED: ['thumbnail', 'standby'],
};

// 캡처한 프레임은 카드를 채운다. 기본 대기 이미지는 스트리머가 직접 올린
// 그림이라, 스튜디오에서처럼 영상 배경 위에 전부 보인다.
const FIT: Record<ImageKind, string> = {
  thumbnail: styles.cover,
  standby: styles.contain,
};

interface PictureSource {
  url: string;
  className: string;
}

interface PictureImages {
  thumbnailUrl?: string | null;
  standbyImageUrl?: string | null;
}

function sourcesOf(
  status: BroadcastStatus,
  images: PictureImages,
): PictureSource[] {
  const urls: Record<ImageKind, string | null | undefined> = {
    thumbnail: images.thumbnailUrl,
    standby: images.standbyImageUrl,
  };
  return IMAGE_ORDER[status].flatMap((kind) => {
    const url = urls[kind];
    return url ? [{ url, className: FIT[kind] }] : [];
  });
}

// 16:9 그림: IMAGE_ORDER에서 로드에 실패하지 않은 첫 이미지, 없으면
// 상태 색 위에 `text`의 첫 글자. URL이
// 바뀌면 다시 시도한다.
export function ThumbnailPicture({
  status,
  text,
  children,
  ...images
}: PictureImages & {
  status: BroadcastStatus;
  text: string;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const source = sourcesOf(status, images).find((s) => !failed.includes(s.url));
  const initial = (Array.from(text.trim())[0] ?? '').toUpperCase();
  return (
    <div className={`${styles.thumbnail} ${TINT[status]}`}>
      {source ? (
        // 제목이나 heading이 그림 바로 옆에 있으므로 alt는 비워
        // 둔다.
        <img
          key={source.url}
          className={`${styles.image} ${source.className}`}
          src={source.url}
          alt=""
          loading="lazy"
          onError={() => setFailed((list) => [...list, source.url])}
        />
      ) : (
        <span className={styles.initial} aria-hidden="true">
          {initial}
        </span>
      )}
      {children}
    </div>
  );
}

type ThumbnailBroadcast = Pick<
  Broadcast,
  'title' | 'status' | 'startedAt' | 'thumbnailUrl' | 'standbyImageUrl'
>;

export function BroadcastThumbnail({
  broadcast,
}: {
  broadcast: ThumbnailBroadcast;
}) {
  const { title, status, startedAt, thumbnailUrl, standbyImageUrl } = broadcast;
  return (
    <ThumbnailPicture
      status={status}
      text={title}
      thumbnailUrl={thumbnailUrl}
      standbyImageUrl={standbyImageUrl}
    >
      <span className={styles.badge}>
        <StatusBadge status={status} />
      </span>
      {status === 'LIVE' && startedAt && (
        <ElapsedTime
          startedAt={startedAt}
          precision="minute"
          className={styles.elapsed}
        />
      )}
    </ThumbnailPicture>
  );
}
