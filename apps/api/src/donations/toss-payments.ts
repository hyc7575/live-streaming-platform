import { z } from 'zod';

export interface TossConfirmInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt: string | null;
}

// Toss 결제 API 중 이 API가 요청하는 부분만 좁힌 것.
export interface TossPayments {
  // 후원자가 결제 위젯에서 인증한 결제를 승인한다.
  confirm(input: TossConfirmInput): Promise<TossPayment>;
}

export class TossPaymentsError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TossPaymentsError';
  }
}

export const TOSS_PAYMENTS = Symbol('TOSS_PAYMENTS');
export const TOSS_CONFIG = Symbol('TOSS_CONFIG');

export interface TossConfig {
  clientKey: string;
  secretKey: string;
}

// null이면 후원은 503으로 꺼지고 나머지 API는 계속 돈다.
// 운영 compose 파일은 두 키가 모두 없으면 시작을 거부한다.
export function tossConfigFromEnv(
  env: Record<string, string | undefined>,
): TossConfig | null {
  const clientKey = env.TOSS_CLIENT_KEY;
  const secretKey = env.TOSS_SECRET_KEY;
  if (!clientKey || !secretKey) return null;
  return { clientKey, secretKey };
}

// 확정 트랜잭션의 타임아웃보다 짧다. 그 트랜잭션은 이 요청을 기다리는 동안
// 주문 행을 잠가 둔다.
export const TOSS_REQUEST_TIMEOUT_MS = 10_000;

const BASE_URL = 'https://api.tosspayments.com';

const paymentSchema = z.object({
  paymentKey: z.string(),
  orderId: z.string(),
  status: z.string(),
  totalAmount: z.number(),
  approvedAt: z.string().nullable(),
});

const errorSchema = z.object({ code: z.string(), message: z.string() });

export class HttpTossPayments implements TossPayments {
  private readonly authorization: string;

  constructor(config: TossConfig) {
    this.authorization = `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`;
  }

  // Toss는 같은 Idempotency-Key에 첫 응답을 다시 돌려준다. 그래서 응답을
  // 잃은 뒤의 재시도는 ALREADY_PROCESSED_PAYMENT 대신
  // 승인 결과를 받는다.
  async confirm(input: TossConfirmInput): Promise<TossPayment> {
    const res = await fetch(`${BASE_URL}/v1/payments/confirm`, {
      method: 'POST',
      headers: {
        authorization: this.authorization,
        'content-type': 'application/json',
        'idempotency-key': input.orderId,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(TOSS_REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.ok) return paymentSchema.parse(JSON.parse(text));
    const error = errorSchema.safeParse(parseJson(text));
    if (!error.success) {
      throw new Error(`Toss confirm answered ${res.status}: ${text}`);
    }
    throw new TossPaymentsError(
      res.status,
      error.data.code,
      error.data.message,
    );
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
