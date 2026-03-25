import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { config } from '../config.js';

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

export function resolveApiKey(encryptedUserKeys, keyName) {
  const serverKey = config.apiKeys[keyName];
  if (serverKey) return serverKey;
  if (keyName === 'elevenlabs') return '';

  try {
    const userKeys = JSON.parse(decrypt(encryptedUserKeys));
    return userKeys[keyName] || '';
  } catch {
    return '';
  }
}
