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

// Toss's payment API, narrowed to what the API asks of it.
export interface TossPayments {
  // Approves the payment the donor authorized in the payment widget.
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

// Null turns donations off with 503 while the rest of the API still runs.
// The production compose file refuses to start without both keys.
export function tossConfigFromEnv(
  env: Record<string, string | undefined>,
): TossConfig | null {
  const clientKey = env.TOSS_CLIENT_KEY;
  const secretKey = env.TOSS_SECRET_KEY;
  if (!clientKey || !secretKey) return null;
  return { clientKey, secretKey };
}

// Shorter than the confirm transaction's timeout, which holds the order row
// locked while it waits for this request.
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

  // Toss replays the first answer for a repeated Idempotency-Key, so a retry
  // after a lost response gets the approval instead of
  // ALREADY_PROCESSED_PAYMENT.
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
