import { ApiError, apiFetch } from '../api';

// The browser asks for a fresh ticket on every start, so its token lives
// minutes. OBS keeps the URL and reconnects with it on its own, so its token
// lives hours (#89).
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
