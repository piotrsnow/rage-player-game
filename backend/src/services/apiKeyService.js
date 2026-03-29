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

export function resolveApiKey(_encryptedUserKeys, keyName) {
  return config.apiKeys[keyName] || '';
}

export function requireServerApiKey(keyName, providerLabel = keyName) {
  const apiKey = resolveApiKey(null, keyName);
  if (!apiKey) {
    throw new AIServiceError(
      AI_ERROR_CODES.NO_SERVER_API_KEY,
      `Server ${providerLabel} API key is not configured. Please set the ${keyName.toUpperCase()}_API_KEY environment variable.`,
      { statusCode: 503, retryable: false, provider: providerLabel },
    );
  }
  return apiKey;
}
