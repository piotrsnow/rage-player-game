import { describe, it, expect } from 'vitest';
import { slugifyItemName } from './itemKeys.js';

describe('slugifyItemName', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugifyItemName('Stalowy Miecz')).toBe('stalowy_miecz');
  });

  it('strips Polish diacritics via NFKD', () => {
    expect(slugifyItemName('Mikstura Życia')).toBe('mikstura_zycia');
    expect(slugifyItemName('mięso')).toBe('mieso');
    expect(slugifyItemName('Skóra')).toBe('skora');
  });

  it('explicitly maps Ł/ł to l (NFKD does not decompose them)', () => {
    expect(slugifyItemName('Łuk')).toBe('luk');
    expect(slugifyItemName('łopata')).toBe('lopata');
  });

  it('drops symbols outside [a-z0-9_]', () => {
    expect(slugifyItemName('Łuk +1')).toBe('luk_1');
    expect(slugifyItemName('a-b/c')).toBe('abc');
  });

  it('trims leading/trailing whitespace and collapses multiple spaces', () => {
    expect(slugifyItemName('  spaces  ')).toBe('spaces');
    expect(slugifyItemName('A   B   C')).toBe('a_b_c');
  });

  it('strips leading/trailing underscores left over after symbol removal', () => {
    expect(slugifyItemName('--name--')).toBe('name');
  });

  it('returns "unnamed" for empty / pure-symbol input so PK never collides on empty key', () => {
    expect(slugifyItemName('')).toBe('unnamed');
    expect(slugifyItemName(null)).toBe('unnamed');
    expect(slugifyItemName(undefined)).toBe('unnamed');
    expect(slugifyItemName('!!!')).toBe('unnamed');
    expect(slugifyItemName('   ')).toBe('unnamed');
  });

  it('produces the same key for case + accent variants (so "Skóra" and "skora" stack)', () => {
    expect(slugifyItemName('Skóra')).toBe(slugifyItemName('skora'));
    expect(slugifyItemName('Łuk')).toBe(slugifyItemName('luk'));
  });
});
