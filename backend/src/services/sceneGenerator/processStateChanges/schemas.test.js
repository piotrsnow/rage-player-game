import { describe, it, expect } from 'vitest';
import {
  parseLocationMentions,
  parseCampaignComplete,
  parseDungeonComplete,
  parseWorldImpactFlags,
} from './schemas.js';

describe('parseLocationMentions', () => {
  it('accepts valid array with byNpcId', () => {
    const result = parseLocationMentions([
      { locationName: 'loc1', byNpcId: 'npc1' },
      { locationName: 'loc2', byNpcId: 'npc2' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('accepts byNpc / npcId aliases', () => {
    const result = parseLocationMentions([
      { locationName: 'loc1', npcId: 'npc1' },
      { locationName: 'loc2', byNpc: 'Geralt' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects mentions with no NPC identifier', () => {
    const result = parseLocationMentions([{ locationName: 'loc1' }]);
    expect(result.ok).toBe(false);
  });

  it('rejects arrays over 20 mentions (runaway LLM guard)', () => {
    const oversized = Array.from({ length: 25 }, (_, i) => ({
      locationName: `loc${i}`,
      byNpcId: `npc${i}`,
    }));
    const result = parseLocationMentions(oversized);
    expect(result.ok).toBe(false);
  });

  it('rejects empty locationName', () => {
    const result = parseLocationMentions([{ locationName: '', byNpcId: 'n' }]);
    expect(result.ok).toBe(false);
  });

  it('returns empty array for empty input', () => {
    const result = parseLocationMentions([]);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });
});

describe('parseCampaignComplete', () => {
  it('accepts a valid payload', () => {
    const result = parseCampaignComplete({
      title: 'The Fall of Skaldheim',
      summary: 'The hero shattered the frost god.',
      majorAchievements: ['Killed Skoll', 'Freed the capital'],
    });
    expect(result.ok).toBe(true);
    expect(result.data.majorAchievements).toHaveLength(2);
  });

  it('trims and caps title at 120 chars', () => {
    const longTitle = 'x'.repeat(200);
    const result = parseCampaignComplete({
      title: longTitle,
      summary: 'short',
      majorAchievements: ['a'],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects missing title', () => {
    const result = parseCampaignComplete({
      summary: 'x',
      majorAchievements: ['a'],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-object input (LLM emits string)', () => {
    const result = parseCampaignComplete('done');
    expect(result.ok).toBe(false);
  });

  it('defaults majorAchievements to empty array when array is omitted', () => {
    const result = parseCampaignComplete({
      title: 'The End',
      summary: 'Fin.',
    });
    // Schema requires at least 1 via .min(1) — omission + default=[] should fail
    expect(result.ok).toBe(false);
  });

  it('rejects more than 3 majorAchievements', () => {
    const result = parseCampaignComplete({
      title: 'T',
      summary: 'S',
      majorAchievements: ['a', 'b', 'c', 'd'],
    });
    expect(result.ok).toBe(false);
  });
});

describe('parseDungeonComplete', () => {
  it('accepts valid payload', () => {
    const result = parseDungeonComplete({ name: 'Crypt', summary: 'cleared' });
    expect(result.ok).toBe(true);
  });

  it('rejects payload with missing name', () => {
    const result = parseDungeonComplete({ summary: 'cleared' });
    expect(result.ok).toBe(false);
  });

  it('caps summary at 400 chars', () => {
    const result = parseDungeonComplete({
      name: 'Crypt',
      summary: 'x'.repeat(500),
    });
    expect(result.ok).toBe(false);
  });
});

describe('parseWorldImpactFlags', () => {
  it('accepts minor/major worldImpact', () => {
    expect(parseWorldImpactFlags({ worldImpact: 'minor' }).ok).toBe(true);
    expect(parseWorldImpactFlags({ worldImpact: 'major' }).ok).toBe(true);
  });

  it('rejects invalid worldImpact value', () => {
    const result = parseWorldImpactFlags({ worldImpact: 'massive' });
    expect(result.ok).toBe(false);
  });

  it('caps worldImpactReason at 300 chars', () => {
    const result = parseWorldImpactFlags({
      worldImpactReason: 'x'.repeat(500),
    });
    expect(result.ok).toBe(false);
  });

  it('accepts nullable worldImpact', () => {
    const result = parseWorldImpactFlags({ worldImpact: null });
    expect(result.ok).toBe(true);
  });
});
