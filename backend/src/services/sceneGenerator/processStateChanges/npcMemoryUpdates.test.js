import { describe, it, expect } from 'vitest';
import {
  npcNameToId,
  toMemoryEntry,
  detectMirrorTargets,
  buildMirrorEntry,
} from './npcMemoryUpdates.js';
import { parseNpcMemoryUpdates } from './schemas.js';

describe('npcNameToId', () => {
  it('lowercases and slugs spaces', () => {
    expect(npcNameToId('Kapitan Gerent')).toBe('kapitan_gerent');
    expect(npcNameToId('  Eleya  Tropicielka  ')).toBe('eleya_tropicielka');
  });

  it('returns empty string on empty / non-string input', () => {
    expect(npcNameToId('')).toBe('');
    expect(npcNameToId(null)).toBe('');
    expect(npcNameToId(undefined)).toBe('');
  });
});

describe('toMemoryEntry', () => {
  it('defaults importance to minor', () => {
    const now = new Date('2026-04-23T12:00:00Z');
    const entry = toMemoryEntry({ npcName: 'X', memory: 'saw magic' }, { now });
    expect(entry).toEqual({
      content: 'saw magic',
      importance: 'minor',
      addedAt: '2026-04-23T12:00:00.000Z',
    });
  });

  it('preserves major importance', () => {
    const now = new Date('2026-04-23T12:00:00Z');
    const entry = toMemoryEntry({ memory: 'lost faith', importance: 'major' }, { now });
    expect(entry.importance).toBe('major');
  });
});

describe('parseNpcMemoryUpdates (Zod)', () => {
  it('accepts minimal valid shape', () => {
    const { ok, data } = parseNpcMemoryUpdates([
      { npcName: 'Gerent', memory: 'saw the blood moon' },
    ]);
    expect(ok).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ npcName: 'Gerent', memory: 'saw the blood moon' });
  });

  it('accepts importance when provided', () => {
    const { ok, data } = parseNpcMemoryUpdates([
      { npcName: 'Lyana', memory: 'lost faith', importance: 'major' },
    ]);
    expect(ok).toBe(true);
    expect(data[0].importance).toBe('major');
  });

  it('rejects when memory is empty', () => {
    const { ok } = parseNpcMemoryUpdates([{ npcName: 'X', memory: '' }]);
    expect(ok).toBe(false);
  });

  it('rejects when importance is not in enum', () => {
    const { ok } = parseNpcMemoryUpdates([
      { npcName: 'X', memory: 'something', importance: 'critical' },
    ]);
    expect(ok).toBe(false);
  });

  it('trims whitespace from strings', () => {
    const { ok, data } = parseNpcMemoryUpdates([
      { npcName: '  Gerent  ', memory: '  fact  ' },
    ]);
    expect(ok).toBe(true);
    expect(data[0]).toMatchObject({ npcName: 'Gerent', memory: 'fact' });
  });

  it('enforces max array length', () => {
    const big = Array.from({ length: 25 }, () => ({ npcName: 'X', memory: 'x' }));
    const { ok } = parseNpcMemoryUpdates(big);
    expect(ok).toBe(false);
  });

  it('accepts empty array (handler turns into no-op)', () => {
    const { ok, data } = parseNpcMemoryUpdates([]);
    expect(ok).toBe(true);
    expect(data).toEqual([]);
  });
});

describe('detectMirrorTargets (Stage 2a.2)', () => {
  const lyana = { id: 'row-lyana', npcId: 'lyana', name: 'Lyana' };
  const gerent = { id: 'row-gerent', npcId: 'gerent', name: 'Gerent' };
  const torvan = { id: 'row-torvan', npcId: 'torvan', name: 'Król Torvan' };

  it('returns [] when text is empty or otherNpcs is empty', () => {
    expect(detectMirrorTargets('', 'Gerent', [lyana])).toEqual([]);
    expect(detectMirrorTargets('mentions Lyana', 'Gerent', [])).toEqual([]);
    expect(detectMirrorTargets(null, 'X', [lyana])).toEqual([]);
  });

  it('detects a single other-NPC mention (case insensitive)', () => {
    const targets = detectMirrorTargets('gracz zdradził Lyanę przy bramie', 'Gerent', [lyana, gerent]);
    expect(targets).toHaveLength(1);
    expect(targets[0].npcId).toBe('lyana');
  });

  it('skips self-mention', () => {
    const targets = detectMirrorTargets('Gerent sam się okrył chwałą', 'Gerent', [gerent, lyana]);
    expect(targets.map((t) => t.npcId)).not.toContain('gerent');
  });

  it('detects multi-word names', () => {
    const targets = detectMirrorTargets('Król Torvan wydał rozkaz', 'Gerent', [torvan, lyana]);
    expect(targets).toHaveLength(1);
    expect(targets[0].npcId).toBe('torvan');
  });

  it('dedups when the same name appears multiple times', () => {
    const targets = detectMirrorTargets('Lyana poszła po Lyane, Lyana widziała', 'Gerent', [lyana]);
    expect(targets).toHaveLength(1);
  });

  it('caps at maxTargets (default 3)', () => {
    const one   = { id: 'r1', npcId: 'n1', name: 'Alpha' };
    const two   = { id: 'r2', npcId: 'n2', name: 'Beta' };
    const three = { id: 'r3', npcId: 'n3', name: 'Gamma' };
    const four  = { id: 'r4', npcId: 'n4', name: 'Delta' };
    const targets = detectMirrorTargets(
      'Alpha Beta Gamma Delta spotkali się',
      'Source',
      [one, two, three, four],
    );
    expect(targets).toHaveLength(3);
  });

  it('respects custom maxTargets', () => {
    const targets = detectMirrorTargets('Lyana i Gerent', 'Source', [lyana, gerent], { maxTargets: 1 });
    expect(targets).toHaveLength(1);
  });

  it('ignores substring-in-a-word false positives', () => {
    // "Ger" as prefix of "Germana" (a fake NPC name that would match naive substring)
    // Gerent should NOT be detected when the text only says "Germania" — it's a
    // different word. The whole-word boundary prevents that.
    const targets = detectMirrorTargets('Germania to dalekie państwo', 'Source', [gerent]);
    expect(targets).toEqual([]);
  });

  it('does detect Polish inflected forms (Lyany, Lyaną, Lyanę)', () => {
    for (const form of ['Lyany', 'Lyaną', 'Lyanę', 'Lyano']) {
      const targets = detectMirrorTargets(`widziałem ${form} wczoraj`, 'Source', [lyana]);
      expect(targets, `form=${form}`).toHaveLength(1);
    }
  });
});

describe('buildMirrorEntry (Stage 2a.2)', () => {
  const now = new Date('2026-04-23T12:00:00Z');

  it('builds a mirror from a major source entry with step-down to minor', () => {
    const source = { content: 'zabił Lyanę', importance: 'major', addedAt: '2026-04-22T00:00:00Z' };
    const mirror = buildMirrorEntry(source, 'Gerent', { now });
    expect(mirror).toEqual({
      content: '[zasłyszane o Gerent] zabił Lyanę',
      importance: 'minor',
      addedAt: now.toISOString(),
      mirror: true,
    });
  });

  it('returns null for minor source (step-down below threshold)', () => {
    const source = { content: 'marudził', importance: 'minor', addedAt: '2026-04-22T00:00:00Z' };
    expect(buildMirrorEntry(source, 'Gerent')).toBeNull();
  });

  it('returns null for already-mirrored source (no ping-pong)', () => {
    const source = {
      content: '[zasłyszane o X] Y',
      importance: 'major', // intentionally major to prove mirror flag wins
      mirror: true,
    };
    expect(buildMirrorEntry(source, 'Z')).toBeNull();
  });

  it('returns null for missing / non-object source', () => {
    expect(buildMirrorEntry(null, 'X')).toBeNull();
    expect(buildMirrorEntry(undefined, 'X')).toBeNull();
    expect(buildMirrorEntry('string', 'X')).toBeNull();
  });

  it('falls back to generic prefix when sourceName is missing', () => {
    const source = { content: 'X', importance: 'major' };
    const mirror = buildMirrorEntry(source, '');
    expect(mirror?.content).toContain('innego NPC');
  });
});
