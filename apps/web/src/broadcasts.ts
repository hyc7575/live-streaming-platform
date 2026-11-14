import type { BroadcastCategory } from './categories';
import type { BroadcastStatus } from './components/StatusBadge';

// apps/api/src/broadcasts/broadcasts.service.ts의 BroadcastView와 같은 모양이다.
export interface Broadcast {
  id: string;
  title: string;
  description: string;
  category: BroadcastCategory;
  // 카테고리가 GAME일 때만 있다.
  game: BroadcastGame | null;
  status: BroadcastStatus;
  startedAt: string | null;
  endedAt: string | null;
  // LIVE 중 송출이 끊긴 시각이다. 유예 시간 동안 값이 있고,
  // 송출이 연결돼 있거나 한 번도 연결된 적 없으면 null이다.
  disconnectedAt: string | null;
  createdAt: string;
  // /recordings 아래 경로다. 오래된 것이 먼저 온다. 비어 있으면 다시보기가 없다.
  recordingFiles: string[];
  // 같은 파일을 같은 순서로 담고, 각 영상의 0 s가 서버 시각으로 언제인지 붙인다.
  // 그 시각이 기록되지 않았으면 null이다.
  recordingParts: RecordingPart[];
  // /thumbnails 아래 스트리머의 가장 최근 캡처 프레임이다. 방송이
  // 한 번도 올리지 않았으면 null이다.
  thumbnailUrl: string | null;
  // /thumbnails 아래 스트리머의 기본 대기 이미지다. 그 스트리머의 모든 방송이
  // 함께 쓴다. 한 번도 올리지 않았으면 null이다.
  standbyImageUrl: string | null;
  streamer: { id: string; nickname: string };
}

// 방송을 저장할 때의 게임 이름 스냅샷이다. 목록에서 고르면 qid가 있고,
// 직접 입력하면 null이다.
export interface BroadcastGame {
  qid: string | null;
  name: string;
}

export interface RecordingPart {
  file: string;
  startedAt: string | null;
}

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const GAME_NAME_MAX_LENGTH = 50;
