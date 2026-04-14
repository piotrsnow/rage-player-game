import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { config } from '../config.js';
import { AIServiceError, AI_ERROR_CODES } from './aiErrors.js';

const ALGORITHM = 'aes-256-gcm';

function deriveKey(secret) {
  return createHash('sha256').update(secret).digest();
}

export function encrypt(text) {
  const key = deriveKey(config.apiKeyEncryptionSecret);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

export function decrypt(encryptedText) {
  if (!encryptedText || encryptedText === '{}') return '{}';
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const key = deriveKey(config.apiKeyEncryptionSecret);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '{}';
  }
}

// Resolve an API key with per-user precedence: if the caller passed the
// user's encrypted key bundle and it contains a value for `keyName`, that
// value wins. Otherwise we fall back to the environment key configured on
// the server. Returns '' when neither is available.
//
// `encryptedUserKeys` is the raw string stored on `User.apiKeys` (an
// encrypted JSON object). Pass '{}' or null for "no user keys".
export function resolveApiKey(encryptedUserKeys, keyName) {
  if (encryptedUserKeys && encryptedUserKeys !== '{}') {
    try {
      const parsed = JSON.parse(decrypt(encryptedUserKeys));
      if (parsed && typeof parsed === 'object' && parsed[keyName]) {
        return parsed[keyName];
      }
    } catch {
      // fall through to env
    }
  }
  return config.apiKeys[keyName] || '';
}

// Strict variant: resolves a key and throws 503 if nothing is configured.
// Accepts the user key bundle so per-user overrides work at the call site
// without touching `config.apiKeys` directly.
export function requireServerApiKey(keyName, providerLabelOrEncryptedKeys, encryptedKeysMaybe) {
  // Back-compat overload: callers that don't care about per-user keys can
  // still use `requireServerApiKey('openai', 'OpenAI')`. New callers use
  // `requireServerApiKey('openai', encryptedUserKeys, 'OpenAI')` or pass the
  // keys as the third arg.
  let encryptedUserKeys;
  let providerLabel;
  if (typeof providerLabelOrEncryptedKeys === 'string' && encryptedKeysMaybe === undefined) {
    providerLabel = providerLabelOrEncryptedKeys;
    encryptedUserKeys = null;
  } else if (typeof providerLabelOrEncryptedKeys === 'string' && typeof encryptedKeysMaybe === 'string') {
    providerLabel = providerLabelOrEncryptedKeys;
    encryptedUserKeys = encryptedKeysMaybe;
  } else {
    encryptedUserKeys = providerLabelOrEncryptedKeys ?? null;
    providerLabel = encryptedKeysMaybe || keyName;
  }

  const apiKey = resolveApiKey(encryptedUserKeys, keyName);
  if (!apiKey) {
    throw new AIServiceError(
      AI_ERROR_CODES.NO_SERVER_API_KEY,
      `Server ${providerLabel} API key is not configured. Please set the ${keyName.toUpperCase()}_API_KEY environment variable or store a user key.`,
      { statusCode: 503, retryable: false, provider: providerLabel },
    );
  }
  return apiKey;
}

// Load a user's encrypted API key bundle. Returns '{}' when the user row
// has no entry, so callers can pass it directly to `resolveApiKey`.
export async function loadUserApiKeys(prisma, userId) {
  if (!userId) return '{}';
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { apiKeys: true },
    });
    return user?.apiKeys || '{}';
  } catch {
    return '{}';
  }
}
