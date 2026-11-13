import { z } from 'zod';
import {
  DONATION_MAX_AMOUNT,
  DONATION_MESSAGE_MAX_LENGTH,
  DONATION_MIN_AMOUNT,
} from './donations.service.js';

// 결제 방식과 상관없이 쓰는 후원 금액과 메시지. `donorId` 같은 모르는
// 키는 제거한다.
export const donationInputSchema = z.object({
  amount: z.number().int().min(DONATION_MIN_AMOUNT).max(DONATION_MAX_AMOUNT),
  message: z.string().trim().max(DONATION_MESSAGE_MAX_LENGTH).default(''),
});
