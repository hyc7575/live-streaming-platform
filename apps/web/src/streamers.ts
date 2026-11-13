// Mirrors StreamerProfile from apps/api/src/streamers/streamers.service.ts:
// GET /streamers/:id, the public channel page's header.
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
