import { z } from 'zod';

// 요청 body와 테스트 계정 seed가 함께 쓴다. 그래서 seed된 계정도
// 회원가입으로 만든 계정과 같은 규칙을 따른다.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const newPasswordSchema = z.string().min(8).max(128);
export const nicknameSchema = z.string().trim().min(1).max(20);

export const BIO_MAX_LENGTH = 200;
export const bioSchema = z.string().trim().max(BIO_MAX_LENGTH);
