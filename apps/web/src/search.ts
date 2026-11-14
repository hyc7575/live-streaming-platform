import type { Broadcast } from './broadcasts';
import type { StreamerProfile } from './streamers';

// apps/api/src/search/search.service.ts의 SearchResult와 같은 모양이다.
export type SearchStreamer = Omit<StreamerProfile, 'bio'>;

export interface SearchResult {
  streamers: SearchStreamer[];
  // LIVE 먼저, 그다음 READY
  broadcasts: Broadcast[];
  // 방송 종료. 늦게 끝난 순
  past: Broadcast[];
}

// API의 SEARCH_BROADCAST_LIMIT·SEARCH_QUERY_MAX_LENGTH와 같은 값이다.
export const SEARCH_BROADCAST_LIMIT = 30;
export const SEARCH_QUERY_MAX_LENGTH = 50;

export function searchPath(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}
