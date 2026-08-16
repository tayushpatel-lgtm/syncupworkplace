import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Encrypts shared passwords at rest with AES-256-GCM. The key is derived from
 * SESSION_SECRET rather than a separate env var — one less secret to configure
 * and lose. The trade-off: rotating SESSION_SECRET (which also signs everyone
 * out) re-derives this key too, so do it deliberately, not casually.
 */
function vaultKey() {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short — the password vault has nothing to derive a key from.');
  }
  return createHash('sha256').update(`syncup-vault:${raw}`).digest();
}

/** iv (12 bytes) + authTag (16 bytes) + ciphertext, all in one buffer. */
export function encryptSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

export function decryptSecret(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
