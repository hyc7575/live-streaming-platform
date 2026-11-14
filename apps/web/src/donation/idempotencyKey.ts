// 후원 시도 한 번에 쓸 새 UUID v4다. `crypto.randomUUID`는 보안 컨텍스트
// (HTTPS, localhost)에만 있다. 그래서 일반 http의 시청자(LAN의 휴대폰)는
// 어디서나 동작하는 getRandomValues로 만든 값을 받는다.
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}
