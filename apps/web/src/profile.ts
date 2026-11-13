// PATCH /me/profile이 검사하는 한도다(apps/api/src/auth/fields.ts). 그래서
// 잘못된 값은 보내기 전에 거절한다.
export const NICKNAME_MAX_LENGTH = 20;
export const BIO_MAX_LENGTH = 200;
