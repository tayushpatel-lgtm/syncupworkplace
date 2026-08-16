import { describe, it, expect, beforeAll } from 'vitest';

// The module reads SESSION_SECRET lazily inside each call, so setting it here
// before importing is enough — no need to restart anything between tests.
beforeAll(() => {
  process.env.SESSION_SECRET = 'unit-test-session-secret-0123456789abcdef';
});

const { encryptSecret, decryptSecret } = await import('../../lib/crypto.js');

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext string', () => {
    const ciphertext = encryptSecret('correct horse battery staple');
    expect(decryptSecret(ciphertext)).toBe('correct horse battery staple');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same input');
    const b = encryptSecret('same input');
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(decryptSecret(a)).toBe('same input');
    expect(decryptSecret(b)).toBe('same input');
  });

  it('rejects ciphertext that has been tampered with', () => {
    const ciphertext = Buffer.from(encryptSecret('do not touch me'));
    ciphertext[ciphertext.length - 1] ^= 0xff; // flip a bit in the encrypted payload
    expect(() => decryptSecret(ciphertext)).toThrow();
  });

  it('handles an empty string', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('handles unicode', () => {
    const text = '密码🔒café';
    expect(decryptSecret(encryptSecret(text))).toBe(text);
  });
});
