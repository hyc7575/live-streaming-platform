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

/**
 * 주소나 입력칸의 글자를 결과 화면이 찾는 검색어로 바꾼다. 앞뒤 공백을 빼고
 * SEARCH_QUERY_MAX_LENGTH자로 자른다(API는 넘으면 400이다). 비면 ''.
 * 결과 화면, 헤더 검색, 홈의 예전 `?q=` 이동이 같은 규칙을 쓴다.
 */
export function normalizeSearchQuery(raw: string | null): string {
  return (raw ?? '').trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
}
