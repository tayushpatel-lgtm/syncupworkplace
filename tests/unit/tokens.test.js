import { describe, it, expect } from 'vitest';
import { hashToken, mintToken, safeEqual } from '../../lib/tokens.js';

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('is different for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('mintToken', () => {
  it('returns a token whose hash matches, and a prefix that is a real prefix of it', () => {
    const { token, hash, prefix } = mintToken();
    expect(token.startsWith('syncup_')).toBe(true);
    expect(hashToken(token)).toBe(hash);
    expect(token.startsWith(prefix)).toBe(true);
  });

  it('never mints the same token twice', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(mintToken().token);
    expect(seen.size).toBe(200);
  });
});

describe('safeEqual', () => {
  it('matches identical strings', () => {
    expect(safeEqual('same-secret', 'same-secret')).toBe(true);
  });

  it('rejects different strings, even of the same length', () => {
    expect(safeEqual('aaaaaaaa', 'aaaaaaab')).toBe(false);
  });

  it('rejects strings of different lengths without throwing', () => {
    expect(safeEqual('short', 'a-lot-longer-string')).toBe(false);
  });
});
