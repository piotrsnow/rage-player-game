import { describe, it, expect, vi } from 'vitest';

// apiKeyService.js pulls config at module load; provide a stable mock so
// encrypt/decrypt have a deterministic AES key.
vi.mock('../config.js', () => ({
  config: {
    apiKeyEncryptionSecret: 'unit-test-secret-encryption-passphrase-for-aes-256',
    apiKeys: {
      openai: 'sk-server-test-openai',
      anthropic: 'sk-server-test-anthropic',
    },
  },
}));

import { encrypt, decrypt, resolveApiKey } from './apiKeyService.js';

describe('encrypt/decrypt', () => {
  it('round-trips a plain string', () => {
    const plain = 'sk-abc123-very-secret-key';
    const encrypted = encrypt(plain);
    expect(encrypted).not.toContain(plain);
    expect(decrypt(encrypted)).toBe(plain);
  });

  it('round-trips JSON payloads', () => {
    const plain = JSON.stringify({ openai: 'sk-1', anthropic: 'ck-2', empty: '' });
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('hello');
    const b = encrypt('hello');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('hello');
    expect(decrypt(b)).toBe('hello');
  });

  it('decrypt returns empty JSON object for null/undefined/empty/placeholder input', () => {
    expect(decrypt(null)).toBe('{}');
    expect(decrypt(undefined)).toBe('{}');
    expect(decrypt('')).toBe('{}');
    expect(decrypt('{}')).toBe('{}');
  });

  it('decrypt returns empty JSON object when ciphertext is corrupt', () => {
    // Tampered auth tag — AES-GCM should reject
    const encrypted = encrypt('secret');
    const [iv, _authTag, ct] = encrypted.split(':');
    const tampered = `${iv}:0000000000000000000000000000000000000000000000000000000000000000:${ct}`;
    expect(decrypt(tampered)).toBe('{}');
  });

  it('decrypt returns empty JSON object for garbage input', () => {
    expect(decrypt('not:actually:encrypted')).toBe('{}');
    expect(decrypt('totally-garbage')).toBe('{}');
  });
});

describe('resolveApiKey', () => {
  it('returns the configured server API key for known providers', () => {
    expect(resolveApiKey(null, 'openai')).toBe('sk-server-test-openai');
    expect(resolveApiKey(null, 'anthropic')).toBe('sk-server-test-anthropic');
  });

  it('returns empty string for unknown providers', () => {
    expect(resolveApiKey(null, 'nonexistent')).toBe('');
  });

  it('ignores the first argument (user-encrypted keys) — BYO keys are not resolved here', () => {
    // Legacy signature takes encrypted user keys but current impl always
    // returns the server-side config value. Guarantees no key leak from
    // client input into this function.
    expect(resolveApiKey('user-encrypted-blob', 'openai')).toBe('sk-server-test-openai');
  });
});
