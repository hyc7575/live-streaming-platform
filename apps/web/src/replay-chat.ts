import type { RecordingPart } from './broadcasts';
import type { ChatMessage } from './chat';

// Viewers type while watching LL-HLS a few seconds behind the stream
// (ome/Server.xml LLHLS PartHoldBack 1.5 s plus the player's buffer), so a
// message refers to what was on screen about this long before its createdAt.
// createdAt and the part starts both come from the server clock; the
// viewer's clock never enters this.
export const VIEWER_DELAY_MS = 3000;

// A spot in a recording: which part (0-based) and how far into it.
export interface Playhead {
  part: number;
  seconds: number;
}

// When each part's video starts, in ms, or null when the replay cannot be
// lined up with chat: no parts, or a part whose start was never recorded.
export function partStarts(parts: readonly RecordingPart[]): number[] | null {
  if (parts.length === 0) return null;
  const starts: number[] = [];
  for (const { startedAt } of parts) {
    if (startedAt === null) return null;
    starts.push(Date.parse(startedAt));
  }
  return starts;
}

// Where in the replay a message belongs. Chat from before the first part
// (READY) sits at its 0 s. Chat from a gap between parts runs past the end
// of the earlier part, so it shows once playback reaches the next one.
export function chatPlacement(
  createdAtMs: number,
  starts: readonly number[],
): Playhead {
  const at = createdAtMs - VIEWER_DELAY_MS;
  let part = 0;
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] <= at) part = i;
  }
  return { part, seconds: Math.max(0, (at - starts[part]) / 1000) };
}

export function isReached(placement: Playhead, playhead: Playhead): boolean {
  return placement.part === playhead.part
    ? placement.seconds <= playhead.seconds
    : placement.part < playhead.part;
}

// The messages sent by the time the replay reaches `playhead`.
export function chatUpTo(
  messages: readonly ChatMessage[],
  starts: readonly number[],
  playhead: Playhead,
): ChatMessage[] {
  return messages.filter((m) =>
    isReached(chatPlacement(Date.parse(m.createdAt), starts), playhead),
  );
}
