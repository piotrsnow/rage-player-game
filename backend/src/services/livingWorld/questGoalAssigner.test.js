import { describe, it, expect } from 'vitest';
import { classifyQuestRole, buildGoalString, generateBackgroundGoal } from './questGoalAssigner.js';

function q(overrides = {}) {
  return {
    questId: 'q1',
    name: 'Test Quest',
    status: 'active',
    questGiverId: null,
    turnInNpcId: null,
    prerequisites: [],
    ...overrides,
  };
}

describe('classifyQuestRole', () => {
  it('returns null for NPC with no quest role', () => {
    const quests = [q({ questGiverId: 'other', status: 'active' })];
    expect(classifyQuestRole('nobody', quests)).toBeNull();
  });

  it('identifies giver_active', () => {
    const quests = [q({ questGiverId: 'edric', name: 'Heart', status: 'active' })];
    const r = classifyQuestRole('edric', quests);
    expect(r?.kind).toBe('giver_active');
    expect(r?.quest.name).toBe('Heart');
  });

  it('identifies turnin_active (different from giver)', () => {
    const quests = [q({ questGiverId: 'kupiec', turnInNpcId: 'burmistrz', status: 'active' })];
    const r = classifyQuestRole('burmistrz', quests);
    expect(r?.kind).toBe('turnin_active');
  });

  it('prefers giver_active over turnin when NPC is both', () => {
    const quests = [q({ questGiverId: 'edric', turnInNpcId: 'edric', status: 'active' })];
    const r = classifyQuestRole('edric', quests);
    expect(r?.kind).toBe('giver_active');
  });

  it('identifies giver_next when prerequisites done and quest not started', () => {
    const quests = [
      q({ questId: 'q0', status: 'completed' }),
      q({ questId: 'q1', questGiverId: 'edric', status: 'available', prerequisites: [{ prerequisiteId: 'q0' }] }),
    ];
    const r = classifyQuestRole('edric', quests);
    expect(r?.kind).toBe('giver_next');
    expect(r?.quest.questId).toBe('q1');
  });

  it('does NOT mark giver_next when prerequisites unfinished', () => {
    const quests = [
      q({ questId: 'q0', status: 'active' }),
      q({ questId: 'q1', questGiverId: 'edric', status: 'available', prerequisites: [{ prerequisiteId: 'q0' }] }),
    ];
    const r = classifyQuestRole('edric', quests);
    expect(r).toBeNull();
  });

  it('returns done when all giver-quests completed', () => {
    const quests = [
      q({ questId: 'q0', questGiverId: 'edric', status: 'completed' }),
    ];
    const r = classifyQuestRole('edric', quests);
    expect(r?.kind).toBe('done');
  });

  it('prefers latest-in-chain next quest', () => {
    const quests = [
      q({ questId: 'q0', status: 'completed' }),
      q({ questId: 'q1', status: 'completed' }),
      q({ questId: 'qA', questGiverId: 'e', status: 'available', prerequisites: [{ prerequisiteId: 'q0' }] }),
      q({ questId: 'qB', questGiverId: 'e', status: 'available', prerequisites: [{ prerequisiteId: 'q0' }, { prerequisiteId: 'q1' }] }),
    ];
    const r = classifyQuestRole('e', quests);
    expect(r?.kind).toBe('giver_next');
    expect(r?.quest.questId).toBe('qB'); // longer prereq chain wins
  });

  it('handles plain string-id array form (legacy/test convenience)', () => {
    const quests = [
      q({ questId: 'q0', status: 'completed' }),
      q({ questId: 'q1', questGiverId: 'e', status: 'available', prerequisites: ['q0'] }),
    ];
    const r = classifyQuestRole('e', quests);
    expect(r?.kind).toBe('giver_next');
  });

  it('handles malformed prerequisites gracefully', () => {
    const quests = [
      q({ questId: 'q1', questGiverId: 'e', status: 'available', prerequisites: 'not an array' }),
    ];
    const r = classifyQuestRole('e', quests);
    // Malformed → empty prereqs → every([]) true → quest available
    expect(r?.kind).toBe('giver_next');
  });
});

describe('buildGoalString', () => {
  it('null for null role', () => {
    expect(buildGoalString(null)).toBeNull();
  });

  it('null for done role (caller applies return-home fallback)', () => {
    expect(buildGoalString({ kind: 'done' })).toBeNull();
  });

  it('giver_active → wait for player', () => {
    const s = buildGoalString({ kind: 'giver_active', quest: { name: 'Heart' } }, { characterName: 'Random' });
    expect(s).toContain('Random');
    expect(s).toContain('Heart');
    expect(s).toMatch(/Czekam w swojej lokacji/i);
  });

  it('turnin_active → wait for delivery', () => {
    const s = buildGoalString({ kind: 'turnin_active', quest: { name: 'Key' } }, { characterName: 'Random' });
    expect(s).toContain('Random');
    expect(s).toContain('Key');
    expect(s).toMatch(/dostarczy/i);
  });

  it('giver_next + co-located → wait variant', () => {
    const s = buildGoalString(
      { kind: 'giver_next', quest: { name: 'Mission' } },
      { characterName: 'Random', coLocated: true },
    );
    expect(s).toMatch(/poczekam|zapyta/i);
  });

  it('giver_next + not co-located → seeker variant', () => {
    const s = buildGoalString(
      { kind: 'giver_next', quest: { name: 'Mission' } },
      { characterName: 'Random', coLocated: false },
    );
    expect(s).toMatch(/odnaleźć/i);
    expect(s).toContain('Mission');
  });

  it('falls back to generic "gracza" when no character name', () => {
    const s = buildGoalString(
      { kind: 'giver_active', quest: { name: 'X' } },
      { characterName: null },
    );
    expect(s).toContain('gracza');
    expect(s).not.toContain('null');
  });
});

describe('generateBackgroundGoal', () => {
  it('returns null for missing npc', () => {
    expect(generateBackgroundGoal(null)).toBeNull();
  });

  it('returns a goal object with text for known roles', () => {
    const goal = generateBackgroundGoal({ role: 'karczmarz' }, { seed: 0 });
    expect(goal).toHaveProperty('text');
    expect(typeof goal.text).toBe('string');
    expect(goal.text.length).toBeGreaterThan(0);
  });

  it('karczmarz pool contains an offerable radiant entry somewhere', () => {
    // Scan all three karczmarz seeds (pool size = 3). At least one should
    // land on the bounty_bandits radiant hook.
    const picks = [0, 1000, 2000].map((s) =>
      generateBackgroundGoal({ role: 'karczmarz' }, { seed: s }),
    );
    expect(picks.some((p) => p.offerable === true && !!p.template)).toBe(true);
  });

  it('unknown roles fall back to neutral pool (no offerable entries)', () => {
    const goal = generateBackgroundGoal({ role: 'bezdomny' }, { seed: 0 });
    expect(goal.offerable).toBe(false);
    expect(goal.template).toBeNull();
  });
});
