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

// The images a card tries, in order, before it draws the title's first
// letter. A READY broadcast has no captured frame yet.
const IMAGE_ORDER: Record<BroadcastStatus, readonly ImageKind[]> = {
  READY: ['standby'],
  LIVE: ['thumbnail', 'standby'],
  ENDED: ['thumbnail', 'standby'],
};

// A captured frame fills the card. The standby image is the streamer's own
// picture, so all of it shows on the video background, as in the studio.
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

// A 16:9 picture: the first image in IMAGE_ORDER that has not failed to
// load, otherwise `text`'s first letter on the status tint. A URL that
// changes is tried again.
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
        // The title or heading sits right next to the picture, so alt stays
        // empty.
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
