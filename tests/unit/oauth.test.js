import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { verifyPkce, redirectUriAllowed, mintAuthCode, authCodeExpiry } from '../../lib/oauth.js';

describe('PKCE verification', () => {
  it('accepts a verifier whose SHA-256 matches the stored challenge', () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it('rejects a verifier that does not match', () => {
    const challenge = createHash('sha256').update('the-real-one').digest('base64url');
    expect(verifyPkce('an-imposter', challenge)).toBe(false);
  });

  it('rejects a missing verifier or challenge', () => {
    expect(verifyPkce('', 'something')).toBe(false);
    expect(verifyPkce('something', '')).toBe(false);
  });
});

describe('redirectUriAllowed', () => {
  const client = { redirectUris: ['https://example.com/callback'] };

  it('accepts a registered redirect URI', () => {
    expect(redirectUriAllowed(client, 'https://example.com/callback')).toBe(true);
  });

  it('rejects anything not in the registered list', () => {
    expect(redirectUriAllowed(client, 'https://evil.example.com')).toBe(false);
    expect(redirectUriAllowed(client, '')).toBe(false);
    expect(redirectUriAllowed(client, undefined)).toBe(false);
  });
});

describe('authorization codes', () => {
  it('mints high-entropy, distinct codes', () => {
    const a = mintAuthCode();
    const b = mintAuthCode();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it('expires a few minutes out, not hours', () => {
    const expiry = authCodeExpiry();
    const minutesOut = (expiry.getTime() - Date.now()) / 60000;
    expect(minutesOut).toBeGreaterThan(0);
    expect(minutesOut).toBeLessThanOrEqual(5);
  });
});
