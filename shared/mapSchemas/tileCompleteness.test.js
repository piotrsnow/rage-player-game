import { describe, it, expect } from 'vitest';
import {
  tileCompleteness,
  formatMissingSectionsPl,
  ATOM_SECTIONS,
  SECTION_ORDER,
  SECTION_COUNT,
} from './tileCompleteness.js';

describe('tileCompleteness', () => {
  it('treats null / empty input as fully incomplete', () => {
    for (const input of [null, undefined, [], [''], ['unknown_atom']]) {
      const r = tileCompleteness(input);
      expect(r.complete).toBe(false);
      expect(r.filled).toBe(0);
      expect(r.total).toBe(SECTION_COUNT);
      expect(r.present).toEqual([]);
      expect(r.missing).toEqual([...SECTION_ORDER]);
    }
  });

  it('marks a tile complete only when every canonical section has an atom', () => {
    const atoms = ['walkable', 'floor', 'autotile_role_fill', 'layer_hint_ground'];
    const r = tileCompleteness(atoms);
    expect(r.complete).toBe(true);
    expect(r.filled).toBe(SECTION_COUNT);
    expect(r.missing).toEqual([]);
    expect(r.present).toEqual([...SECTION_ORDER]);
  });

  it('identifies the exact missing sections', () => {
    const atoms = ['walkable', 'floor']; // missing role + layer
    const r = tileCompleteness(atoms);
    expect(r.complete).toBe(false);
    expect(r.filled).toBe(2);
    expect(r.missing).toEqual(['role', 'layer']);
    expect(r.present).toEqual(['passability', 'structure']);
  });

  it('tolerates extra unknown atoms and edge_* atoms (they are not sections)', () => {
    const atoms = [
      'walkable',
      'floor',
      'autotile_role_fill',
      'layer_hint_ground',
      'edge_N',
      'custom_extension_atom',
    ];
    expect(tileCompleteness(atoms).complete).toBe(true);
  });

  it('counts a single atom per section as sufficient', () => {
    for (const key of SECTION_ORDER) {
      const oneOfEach = SECTION_ORDER.map((k) => ATOM_SECTIONS[k][0]);
      const r = tileCompleteness(oneOfEach);
      expect(r.complete).toBe(true);
      expect(r.filled).toBe(SECTION_COUNT);
      // use `key` so the loop isn't flagged as unused
      expect(r.present).toContain(key);
    }
  });

  it('returns `missing` in canonical SECTION_ORDER', () => {
    // Random atom order must not change missing-section ordering in the result.
    const r = tileCompleteness(['layer_hint_ground']);
    expect(r.missing).toEqual(['passability', 'structure', 'role']);
  });
});

describe('formatMissingSectionsPl', () => {
  it('returns empty string for empty input', () => {
    expect(formatMissingSectionsPl([])).toBe('');
    expect(formatMissingSectionsPl(null)).toBe('');
    expect(formatMissingSectionsPl(undefined)).toBe('');
  });

  it('translates section keys to Polish labels', () => {
    expect(formatMissingSectionsPl(['passability', 'layer'])).toBe('Przejezdność, Hint warstwy');
    expect(formatMissingSectionsPl(['role'])).toBe('Rola autotile');
  });

  it('falls back to the raw key if a label is unknown', () => {
    expect(formatMissingSectionsPl(['passability', 'unknown_section'])).toBe('Przejezdność, unknown_section');
  });
});
