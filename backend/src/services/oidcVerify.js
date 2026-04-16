import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

/**
 * Verify a Google OIDC token from Cloud Tasks. Checks audience, issuer,
 * and expected service account email.
 */
export async function verifyOidcToken(token, { audience, issuer = 'https://accounts.google.com', expectedServiceAccount }) {
  const { payload } = await jwtVerify(token, JWKS, { audience, issuer });
  if (payload.email !== expectedServiceAccount) {
    throw new Error(`Unexpected service account: ${payload.email}`);
  }
  return payload;
}
