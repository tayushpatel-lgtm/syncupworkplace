import { randomBytes, createHash } from 'crypto';

const CODE_TTL_MS = 5 * 60 * 1000; // an authorization code only has to survive one round trip

/** A high-entropy authorization code — a short-lived bearer secret, not a row id. */
export function mintAuthCode() {
  return randomBytes(24).toString('base64url');
}

export function authCodeExpiry() {
  return new Date(Date.now() + CODE_TTL_MS);
}

/** RFC 7636 S256: base64url(SHA-256(code_verifier)) must equal the stored challenge. */
export function verifyPkce(codeVerifier, codeChallenge) {
  if (!codeVerifier || !codeChallenge) return false;
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}

/** Only http(s) URLs a client actually registered are ever sent an authorization code to. */
export function redirectUriAllowed(client, redirectUri) {
  return !!redirectUri && client.redirectUris.includes(redirectUri);
}
