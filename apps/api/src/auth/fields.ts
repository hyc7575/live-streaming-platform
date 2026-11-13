import { z } from 'zod';

// Shared by request bodies and the test-account seed, so a seeded account
// follows the same rules as one made through signup.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const newPasswordSchema = z.string().min(8).max(128);
export const nicknameSchema = z.string().trim().min(1).max(20);

export const BIO_MAX_LENGTH = 200;
export const bioSchema = z.string().trim().max(BIO_MAX_LENGTH);
