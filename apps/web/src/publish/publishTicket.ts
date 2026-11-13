import { ApiError, apiFetch } from '../api';

// 브라우저는 시작할 때마다 새 티켓을 받으므로 토큰 수명이
// 분 단위다. OBS는 URL을 간직하고 스스로 그 URL로 다시 연결하므로 토큰 수명이
// 시간 단위다(#89).
export type PublishClient = 'browser' | 'obs';

export type PublishTicketResult =
  | { kind: 'issued'; publishUrl: string; expiresAt: string }
  | { kind: 'unauthorized' }
  | { kind: 'refused'; error: string };

export async function requestPublishTicket(
  broadcastId: string,
  client: PublishClient,
): Promise<PublishTicketResult> {
  try {
    const ticket = await apiFetch<{ publishUrl: string; expiresAt: string }>(
      `/broadcasts/${broadcastId}/publish-token`,
      { method: 'POST', body: JSON.stringify({ client }) },
    );
    return { kind: 'issued', ...ticket };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { kind: 'unauthorized' };
    }
    return { kind: 'refused', error: refusalMessage(error) };
  }
}

function refusalMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '송출을 시작하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
  switch (error.status) {
    case 403:
      return '권한이 없습니다.';
    case 404:
      return '방송을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.';
    case 409:
      return error.serverMessage ?? '지금은 이 방송을 송출할 수 없습니다.';
    default:
      return '송출을 시작하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
}
