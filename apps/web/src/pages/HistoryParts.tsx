import { Link } from 'react-router';
import type { DonationTarget } from '../lime';

const historyTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// 후원한 방송. 방송이 지워졌으면 "삭제된 방송"을 보인다
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

// "불씨에게 · <방송 제목>". 받는 사람이 없는 것은, 후원이 받는 사람을 따로
// 저장하기 전에 방송이 지워진 후원뿐이다.
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
