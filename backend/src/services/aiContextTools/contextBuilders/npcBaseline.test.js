import { describe, it, expect } from 'vitest';
import {
  selectKeyNpcsWithWorldId,
  selectKeyNpcsForMemory,
  formatBaselineEntries,
  formatExperienceEntries,
} from './npcBaseline.js';

describe('selectKeyNpcsWithWorldId', () => {
  it('returns [] on empty / mismatched input', () => {
    expect(selectKeyNpcsWithWorldId([], [])).toEqual([]);
    expect(selectKeyNpcsWithWorldId(null, null)).toEqual([]);
  });

  it('skips ephemeral NPCs (worldNpcId=null)', () => {
    const ambient = [{ worldNpcId: null, keyNpc: true }];
    const withGoals = [{ name: 'Ephemeral' }];
    expect(selectKeyNpcsWithWorldId(ambient, withGoals)).toEqual([]);
  });

  it('skips background NPCs (keyNpc=false)', () => {
    const ambient = [{ worldNpcId: 'w1', keyNpc: false }];
    const withGoals = [{ name: 'Villager' }];
    expect(selectKeyNpcsWithWorldId(ambient, withGoals)).toEqual([]);
  });

  it('returns {worldNpcId, npcName} for each key NPC with canonical link', () => {
    const ambient = [
      { worldNpcId: 'w1', keyNpc: true },
      { worldNpcId: 'w2', keyNpc: true },
    ];
    const withGoals = [{ name: 'Gerent' }, { name: 'Lyana' }];
    expect(selectKeyNpcsWithWorldId(ambient, withGoals)).toEqual([
      { worldNpcId: 'w1', npcName: 'Gerent' },
      { worldNpcId: 'w2', npcName: 'Lyana' },
    ]);
  });

  it('tolerates missing goalEntry at same index', () => {
    const ambient = [{ worldNpcId: 'w1', keyNpc: true }];
    const withGoals = [null];
    expect(selectKeyNpcsWithWorldId(ambient, withGoals)).toEqual([]);
  });
});

describe('formatBaselineEntries', () => {
  it('returns [] for null/empty/undefined input', () => {
    expect(formatBaselineEntries(null)).toEqual([]);
    expect(formatBaselineEntries('')).toEqual([]);
    expect(formatBaselineEntries(undefined)).toEqual([]);
  });

  it('parses JSON string and shapes entries', () => {
    const kb = JSON.stringify([
      { content: 'Knows the king personally', source: 'baseline' },
      { content: 'Hates the baron', source: 'baseline' },
    ]);
    expect(formatBaselineEntries(kb)).toEqual([
      { content: 'Knows the king personally', source: 'baseline' },
      { content: 'Hates the baron', source: 'baseline' },
    ]);
  });

  it('accepts pre-parsed array too', () => {
    const kb = [{ content: 'fact A', source: 'baseline' }];
    expect(formatBaselineEntries(kb)).toEqual([{ content: 'fact A', source: 'baseline' }]);
  });

  it('filters empty / malformed entries', () => {
    const kb = JSON.stringify([
      { content: 'valid', source: 'baseline' },
      { content: '' },
      { content: '   ' },
      null,
      { source: 'baseline' }, // missing content
    ]);
    expect(formatBaselineEntries(kb)).toEqual([
      { content: 'valid', source: 'baseline' },
    ]);
  });

  it('defaults missing source to baseline', () => {
    const kb = JSON.stringify([{ content: 'fact' }]);
    expect(formatBaselineEntries(kb)).toEqual([{ content: 'fact', source: 'baseline' }]);
  });

  it('preserves non-baseline source (Stage 2 lived experience)', () => {
    const kb = JSON.stringify([{ content: 'lived fact', source: 'campaign:abc' }]);
    expect(formatBaselineEntries(kb)).toEqual([
      { content: 'lived fact', source: 'campaign:abc' },
    ]);
  });

  it('caps at maxEntries (default 6)', () => {
    const kb = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({ content: `fact ${i}`, source: 'baseline' })),
    );
    expect(formatBaselineEntries(kb)).toHaveLength(6);
  });

  it('respects custom cap', () => {
    const kb = JSON.stringify([
      { content: 'a', source: 'baseline' },
      { content: 'b', source: 'baseline' },
      { content: 'c', source: 'baseline' },
    ]);
    expect(formatBaselineEntries(kb, 2)).toHaveLength(2);
  });

  it('returns [] for malformed JSON without throwing', () => {
    expect(formatBaselineEntries('{not json')).toEqual([]);
    expect(formatBaselineEntries('null')).toEqual([]);
    expect(formatBaselineEntries('"plain string"')).toEqual([]);
  });
});

describe('selectKeyNpcsForMemory', () => {
  it('includes ephemeral NPC (no worldNpcId) if it has a CampaignNPC row', () => {
    const ambient = [{ id: 'cnpc1', worldNpcId: null, keyNpc: true }];
    const withGoals = [{ name: 'Ephemeral Contact' }];
    expect(selectKeyNpcsForMemory(ambient, withGoals)).toEqual([
      { worldNpcId: null, campaignNpcId: 'cnpc1', npcName: 'Ephemeral Contact' },
    ]);
  });

  it('skips background NPCs (keyNpc=false)', () => {
    const ambient = [{ id: 'cnpc1', worldNpcId: 'w1', keyNpc: false }];
    const withGoals = [{ name: 'Villager' }];
    expect(selectKeyNpcsForMemory(ambient, withGoals)).toEqual([]);
  });

  it('returns canonical + shadow handles when both present', () => {
    const ambient = [{ id: 'cnpc1', worldNpcId: 'w1', keyNpc: true }];
    const withGoals = [{ name: 'Gerent' }];
    expect(selectKeyNpcsForMemory(ambient, withGoals)).toEqual([
      { worldNpcId: 'w1', campaignNpcId: 'cnpc1', npcName: 'Gerent' },
    ]);
  });

  it('selectKeyNpcsWithWorldId alias only keeps canonical-linked', () => {
    const ambient = [
      { id: 'cnpc1', worldNpcId: 'w1', keyNpc: true },
      { id: 'cnpc2', worldNpcId: null, keyNpc: true },
    ];
    const withGoals = [{ name: 'Linked' }, { name: 'Ephemeral' }];
    const result = selectKeyNpcsWithWorldId(ambient, withGoals);
    expect(result).toHaveLength(1);
    expect(result[0].npcName).toBe('Linked');
  });
});

describe('formatExperienceEntries', () => {
  it('returns [] for null/empty/malformed input', () => {
    expect(formatExperienceEntries(null)).toEqual([]);
    expect(formatExperienceEntries('')).toEqual([]);
    expect(formatExperienceEntries('{not json')).toEqual([]);
  });

  it('tags all entries with source=campaign_current', () => {
    const log = JSON.stringify([
      { content: 'a', importance: 'minor', addedAt: 'ts1' },
      { content: 'b', importance: 'major', addedAt: 'ts2' },
    ]);
    expect(formatExperienceEntries(log)).toEqual([
      { content: 'a', source: 'campaign_current' },
      { content: 'b', source: 'campaign_current' },
    ]);
  });

  it('keeps the NEWEST entries when over cap', () => {
    // Cap = 8 by default; add 10 entries, check tail of last 8.
    const log = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({ content: `m${i}`, importance: 'minor' })),
    );
    const result = formatExperienceEntries(log);
    expect(result).toHaveLength(8);
    expect(result.map((e) => e.content)).toEqual([
      'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
    ]);
  });

  it('respects custom cap', () => {
    const log = JSON.stringify([
      { content: 'a' }, { content: 'b' }, { content: 'c' },
    ]);
    expect(formatExperienceEntries(log, 2)).toEqual([
      { content: 'b', source: 'campaign_current' },
      { content: 'c', source: 'campaign_current' },
    ]);
  });

  it('filters missing / blank content', () => {
    const log = JSON.stringify([
      { content: 'keep' },
      { content: '' },
      { content: '   ' },
      null,
      {},
    ]);
    expect(formatExperienceEntries(log)).toEqual([
      { content: 'keep', source: 'campaign_current' },
    ]);
  });

  // Stage 2a.1 — importance-aware merge.
  describe('Stage 2a.1 — importance-aware selection', () => {
    it('keeps a single major entry over a flood of newer minor entries', () => {
      const log = JSON.stringify([
        { content: 'PIVOTAL', importance: 'major', addedAt: '2026-04-01T00:00:00Z' },
        ...Array.from({ length: 10 }, (_, i) => ({
          content: `trivia${i}`,
          importance: 'minor',
          addedAt: `2026-04-02T00:${String(i).padStart(2, '0')}:00Z`,
        })),
      ]);
      const result = formatExperienceEntries(log);
      expect(result).toHaveLength(8);
      expect(result.map((e) => e.content)).toContain('PIVOTAL');
    });

    it('within same importance tier, newer wins', () => {
      const log = JSON.stringify([
        { content: 'old_minor', importance: 'minor', addedAt: '2026-04-01T00:00:00Z' },
        ...Array.from({ length: 8 }, (_, i) => ({
          content: `new_minor_${i}`,
          importance: 'minor',
          addedAt: `2026-04-02T${String(i).padStart(2, '0')}:00:00Z`,
        })),
      ]);
      const result = formatExperienceEntries(log);
      expect(result).toHaveLength(8);
      expect(result.map((e) => e.content)).not.toContain('old_minor');
    });

    it('treats missing importance as lowest rank (dropped first)', () => {
      const log = JSON.stringify([
        ...Array.from({ length: 8 }, (_, i) => ({
          content: `minor${i}`,
          importance: 'minor',
          addedAt: `2026-04-01T${String(i).padStart(2, '0')}:00:00Z`,
        })),
        { content: 'no_importance_field', addedAt: '2026-04-02T00:00:00Z' },
      ]);
      const result = formatExperienceEntries(log);
      expect(result).toHaveLength(8);
      expect(result.map((e) => e.content)).not.toContain('no_importance_field');
    });

    it('renders surviving entries in chronological (append) order, not importance order', () => {
      const log = JSON.stringify([
        { content: 'first_minor', importance: 'minor', addedAt: '2026-04-01T00:00:00Z' },
        { content: 'mid_major',   importance: 'major', addedAt: '2026-04-02T00:00:00Z' },
        { content: 'last_minor',  importance: 'minor', addedAt: '2026-04-03T00:00:00Z' },
      ]);
      const result = formatExperienceEntries(log);
      expect(result.map((e) => e.content)).toEqual(['first_minor', 'mid_major', 'last_minor']);
    });
  });
});
