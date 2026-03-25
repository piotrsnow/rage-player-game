import { describe, expect, it } from 'vitest';
import { normalizeAutoPlayerChatMessage } from './autoPlayer.js';

describe('normalizeAutoPlayerChatMessage', () => {
  it('returns null for empty values', () => {
    expect(normalizeAutoPlayerChatMessage()).toBeNull();
    expect(normalizeAutoPlayerChatMessage('')).toBeNull();
    expect(normalizeAutoPlayerChatMessage('   ')).toBeNull();
  });

  it('wraps plain text in straight double quotes', () => {
    expect(normalizeAutoPlayerChatMessage('Powinniśmy wejść do środka.')).toBe('"Powinniśmy wejść do środka."');
  });

  it('keeps already quoted text unchanged', () => {
    expect(normalizeAutoPlayerChatMessage('"Stój tam!"')).toBe('"Stój tam!"');
  });

  it('normalizes smart quotes to straight double quotes', () => {
    expect(normalizeAutoPlayerChatMessage('„Nie podoba mi się to.”')).toBe('"Nie podoba mi się to."');
    expect(normalizeAutoPlayerChatMessage('«Uciekaj!»')).toBe('"Uciekaj!"');
  });
});
