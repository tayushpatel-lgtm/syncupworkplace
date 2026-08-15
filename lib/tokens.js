import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const PREFIX = 'syncup_';

/**
 * Tokens are high-entropy random strings, so a plain SHA-256 is the right hash —
 * it keeps the lookup a single indexed query, and there is no low-entropy secret
 * for a rainbow table to attack.
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function mintToken() {
  const token = `${PREFIX}${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 14) };
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
