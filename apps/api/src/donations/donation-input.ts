import { z } from 'zod';
import {
  DONATION_MAX_AMOUNT,
  DONATION_MESSAGE_MAX_LENGTH,
  DONATION_MIN_AMOUNT,
} from './donations.service.js';

// The amount and message of a donation, whichever way it is paid. Unknown
// keys such as `donorId` are stripped.
export const donationInputSchema = z.object({
  amount: z.number().int().min(DONATION_MIN_AMOUNT).max(DONATION_MAX_AMOUNT),
  message: z.string().trim().max(DONATION_MESSAGE_MAX_LENGTH).default(''),
});
