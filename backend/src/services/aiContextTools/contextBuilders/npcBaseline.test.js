import { describe, it, expect } from 'vitest';
import {
  selectKeyNpcsForMemory,
  selectKeyNpcsWithWorldId,
  formatBaselineEntries,
  formatExperienceEntries,
} from './npcBaseline.js';

describe('selectKeyNpcsWithWorldId (legacy alias)', () => {
  it('drops ephemeral NPCs without worldNpcId', () => {
    const ambient = [
      { id: 'cnpc1', worldNpcId: 'w1', keyNpc: true },
      { id: 'cnpc2', worldNpcId: null, keyNpc: true },
    ];
    const withGoals = [{ name: 'Linked' }, { name: 'Ephemeral' }];
    const result = selectKeyNpcsWithWorldId(ambient, withGoals);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ worldNpcId: 'w1', npcName: 'Linked' });
  });

  it('skips entries when withGoals slot is null', () => {
    const ambient = [{ worldNpcId: 'w1', keyNpc: true }];
    const withGoals = [null];
    expect(selectKeyNpcsWithWorldId(ambient, withGoals)).toEqual([]);
  });
});

describe('formatBaselineEntries', () => {
  it('returns [] for null/non-array input', () => {
    expect(formatBaselineEntries(null)).toEqual([]);
    expect(formatBaselineEntries(undefined)).toEqual([]);
    expect(formatBaselineEntries('not-an-array')).toEqual([]);
  });

  it('shapes WorldNpcKnowledge baseline rows', () => {
    const rows = [
      { content: 'Knows the king personally', source: 'baseline' },
      { content: 'Hates the baron', source: 'baseline' },
    ];
    expect(formatBaselineEntries(rows)).toEqual([
      { content: 'Knows the king personally', source: 'baseline' },
      { content: 'Hates the baron', source: 'baseline' },
    ]);
  });

  it('filters empty/malformed rows', () => {
    const rows = [
      { content: 'valid', source: 'baseline' },
      { content: '' },
      { content: '   ' },
      null,
      { source: 'baseline' }, // missing content
    ];
    expect(formatBaselineEntries(rows)).toEqual([
      { content: 'valid', source: 'baseline' },
    ]);
  });

  it('defaults missing source to baseline', () => {
    expect(formatBaselineEntries([{ content: 'fact' }])).toEqual([
      { content: 'fact', source: 'baseline' },
    ]);
  });

  it('drops cross-campaign rows (those go through formatCrossCampaignEntries)', () => {
    const rows = [
      { content: 'baseline fact', source: 'baseline' },
      { content: 'lived fact', source: 'campaign:abc' },
    ];
    expect(formatBaselineEntries(rows)).toEqual([
      { content: 'baseline fact', source: 'baseline' },
    ]);
  });

  it('caps at maxEntries (default 6)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      content: `fact ${i}`,
      source: 'baseline',
    }));
    expect(formatBaselineEntries(rows)).toHaveLength(6);
  });

  it('respects custom cap', () => {
    const rows = [
      { content: 'a', source: 'baseline' },
      { content: 'b', source: 'baseline' },
      { content: 'c', source: 'baseline' },
    ];
    expect(formatBaselineEntries(rows, 2)).toHaveLength(2);
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
  it('returns [] for null/non-array input', () => {
    expect(formatExperienceEntries(null)).toEqual([]);
    expect(formatExperienceEntries(undefined)).toEqual([]);
    expect(formatExperienceEntries('not-an-array')).toEqual([]);
  });

  it('tags all entries with source=campaign_current', () => {
    const rows = [
      { content: 'a', importance: 'minor', addedAt: 'ts1' },
      { content: 'b', importance: 'major', addedAt: 'ts2' },
    ];
    expect(formatExperienceEntries(rows)).toEqual([
      { content: 'a', source: 'campaign_current' },
      { content: 'b', source: 'campaign_current' },
    ]);
  });

  it('keeps the NEWEST entries when over cap', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ content: `m${i}`, importance: 'minor' }));
    const result = formatExperienceEntries(rows);
    expect(result).toHaveLength(8);
    expect(result.map((e) => e.content)).toEqual([
      'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
    ]);
  });

  it('respects custom cap', () => {
    const rows = [{ content: 'a' }, { content: 'b' }, { content: 'c' }];
    expect(formatExperienceEntries(rows, 2)).toEqual([
      { content: 'b', source: 'campaign_current' },
      { content: 'c', source: 'campaign_current' },
    ]);
  });

  it('filters missing / blank content', () => {
    const rows = [
      { content: 'keep' },
      { content: '' },
      { content: '   ' },
      null,
      {},
    ];
    expect(formatExperienceEntries(rows)).toEqual([
      { content: 'keep', source: 'campaign_current' },
    ]);
  });

  describe('Stage 2a.1 — importance-aware selection', () => {
    it('keeps a single major entry over a flood of newer minor entries', () => {
      const rows = [
        { content: 'PIVOTAL', importance: 'major', addedAt: '2026-04-01T00:00:00Z' },
        ...Array.from({ length: 10 }, (_, i) => ({
          content: `trivia${i}`,
          importance: 'minor',
          addedAt: `2026-04-02T00:${String(i).padStart(2, '0')}:00Z`,
        })),
      ];
      const result = formatExperienceEntries(rows);
      expect(result).toHaveLength(8);
      expect(result.map((e) => e.content)).toContain('PIVOTAL');
    });

    it('within same importance tier, newer wins', () => {
      const rows = [
        { content: 'old_minor', importance: 'minor', addedAt: '2026-04-01T00:00:00Z' },
        ...Array.from({ length: 8 }, (_, i) => ({
          content: `new_minor_${i}`,
          importance: 'minor',
          addedAt: `2026-04-02T${String(i).padStart(2, '0')}:00:00Z`,
        })),
      ];
      const result = formatExperienceEntries(rows);
      expect(result).toHaveLength(8);
      expect(result.map((e) => e.content)).not.toContain('old_minor');
    });

    it('treats missing importance as lowest rank (dropped first)', () => {
      const rows = [
        ...Array.from({ length: 8 }, (_, i) => ({
          content: `minor${i}`,
          importance: 'minor',
          addedAt: `2026-04-01T${String(i).padStart(2, '0')}:00:00Z`,
        })),
        { content: 'no_importance_field', addedAt: '2026-04-02T00:00:00Z' },
      ];
      const result = formatExperienceEntries(rows);
      expect(result).toHaveLength(8);
      expect(result.map((e) => e.content)).not.toContain('no_importance_field');
    });

    it('renders surviving entries in chronological (append) order, not importance order', () => {
      const rows = [
        { content: 'first_minor', importance: 'minor', addedAt: '2026-04-01T00:00:00Z' },
        { content: 'mid_major',   importance: 'major', addedAt: '2026-04-02T00:00:00Z' },
        { content: 'last_minor',  importance: 'minor', addedAt: '2026-04-03T00:00:00Z' },
      ];
      const result = formatExperienceEntries(rows);
      expect(result.map((e) => e.content)).toEqual(['first_minor', 'mid_major', 'last_minor']);
    });
  });
});
