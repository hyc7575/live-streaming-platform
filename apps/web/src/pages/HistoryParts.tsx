import { Link } from 'react-router';
import type { DonationTarget } from '../lime';

const historyTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// "불씨에게 · <방송 제목>", or "삭제된 방송" once the broadcast is gone
// (#114). The recipient is unknown then too, until donations keep it.
export function DonationTargetText({ target }: { target: DonationTarget }) {
  const { broadcast, recipient } = target;
  return (
    <>
      {recipient && `${recipient.nickname}에게 · `}
      {broadcast ? (
        <Link to={`/broadcasts/${broadcast.id}`}>{broadcast.title}</Link>
      ) : (
        '삭제된 방송'
      )}
    </>
  );
}

export function HistoryTime({ at }: { at: string }) {
  return <time dateTime={at}>{historyTimeFormat.format(new Date(at))}</time>;
}
