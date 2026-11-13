import { Link } from 'react-router';
import type { DonationTarget } from '../lime';

const historyTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// The broadcast a donation was made on, or "삭제된 방송" once it is gone
// (#114).
export function BroadcastLink({
  broadcast,
}: {
  broadcast: DonationTarget['broadcast'];
}) {
  return broadcast ? (
    <Link to={`/broadcasts/${broadcast.id}`}>{broadcast.title}</Link>
  ) : (
    '삭제된 방송'
  );
}

// "불씨에게 · <방송 제목>". The recipient is missing only on donations whose
// broadcast was deleted before donations kept their recipient.
export function DonationTargetText({ target }: { target: DonationTarget }) {
  return (
    <>
      {target.recipient && `${target.recipient.nickname}에게 · `}
      <BroadcastLink broadcast={target.broadcast} />
    </>
  );
}

export function HistoryTime({ at }: { at: string }) {
  return <time dateTime={at}>{historyTimeFormat.format(new Date(at))}</time>;
}
