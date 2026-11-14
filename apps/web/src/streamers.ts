// apps/api/src/streamers/streamers.service.ts의 StreamerProfile과 같은 모양이다.
// GET /streamers/:id로 받는 공개 채널 페이지의 머리 부분이다.
export interface StreamerProfile {
  id: string;
  nickname: string;
  bio: string;
  avatarUrl: string | null;
  followerCount: number;
  liveBroadcastId: string | null;
}

export function channelPath(streamerId: string): string {
  return `/channels/${encodeURIComponent(streamerId)}`;
}
