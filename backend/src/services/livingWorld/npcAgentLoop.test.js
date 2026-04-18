import { describe, it, expect } from 'vitest';
import {
  isEligibleForTick,
  normalizeAction,
  buildNextGoalProgress,
} from './npcAgentLoop.js';
import { selectEligibleNpcs } from './npcTickDispatcher.js';

const now = new Date('2026-04-18T12:00:00Z');

function baseNpc(overrides = {}) {
  return {
    id: 'n1',
    name: 'Bjorn',
    alive: true,
    companionOfCampaignId: null,
    lockedByCampaignId: null,
    pausedAt: null,
    activeGoal: 'Znajdź ślad córki',
    tickIntervalHours: 24,
    lastTickAt: null,
    ...overrides,
  };
}

describe('isEligibleForTick', () => {
  it('eligible when never ticked and has goal', () => {
    expect(isEligibleForTick(baseNpc(), now).eligible).toBe(true);
  });

  it.each([
    ['dead', { alive: false }, 'dead'],
    ['companion', { companionOfCampaignId: 'camp1' }, 'companion'],
    ['locked', { lockedByCampaignId: 'camp2' }, 'locked'],
    ['paused', { pausedAt: new Date() }, 'paused'],
    ['no goal', { activeGoal: null }, 'no_goal'],
  ])('skips when %s', (_label, override, reason) => {
    const r = isEligibleForTick(baseNpc(override), now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe(reason);
  });

  it('too_soon when last tick within interval', () => {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const r = isEligibleForTick(baseNpc({ lastTickAt: twoHoursAgo, tickIntervalHours: 24 }), now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('too_soon');
  });

  it('eligible when interval elapsed', () => {
    const oneDayAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const r = isEligibleForTick(baseNpc({ lastTickAt: oneDayAgo, tickIntervalHours: 24 }), now);
    expect(r.eligible).toBe(true);
  });

  describe('scene-based eligibility (currentSceneIndex passed)', () => {
    it('eligible when never ticked', () => {
      const r = isEligibleForTick(baseNpc(), now, { currentSceneIndex: 10 });
      expect(r.eligible).toBe(true);
    });

    it('too_soon when last tick was recent (default interval 2)', () => {
      const npc = baseNpc({ lastTickSceneIndex: 9, tickIntervalScenes: 2 });
      const r = isEligibleForTick(npc, now, { currentSceneIndex: 10 });
      expect(r.eligible).toBe(false);
      expect(r.reason).toBe('too_soon');
    });

    it('eligible when interval reached', () => {
      const npc = baseNpc({ lastTickSceneIndex: 8, tickIntervalScenes: 2 });
      const r = isEligibleForTick(npc, now, { currentSceneIndex: 10 });
      expect(r.eligible).toBe(true);
    });

    it('respects per-npc tickIntervalScenes override', () => {
      const npc = baseNpc({ lastTickSceneIndex: 5, tickIntervalScenes: 10 });
      const r = isEligibleForTick(npc, now, { currentSceneIndex: 14 });
      expect(r.eligible).toBe(false);
      expect(r.reason).toBe('too_soon');
    });

    it('force=true bypasses too_soon', () => {
      const npc = baseNpc({ lastTickSceneIndex: 9, tickIntervalScenes: 2 });
      const r = isEligibleForTick(npc, now, { currentSceneIndex: 10, force: true });
      expect(r.eligible).toBe(true);
    });
  });

  it('missing npc returns failed reason', () => {
    const r = isEligibleForTick(null, now);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('missing_npc');
  });
});

describe('normalizeAction', () => {
  it('coerces invalid/unknown payloads to wait', () => {
    expect(normalizeAction(null).kind).toBe('wait');
    expect(normalizeAction({}).kind).toBe('wait');
    expect(normalizeAction({ kind: 'dance' }).kind).toBe('wait');
  });

  it('move requires destination', () => {
    expect(normalizeAction({ kind: 'move' }).kind).toBe('wait');
    expect(normalizeAction({ kind: 'move', toLocation: '   ' }).kind).toBe('wait');
    const ok = normalizeAction({ kind: 'move', toLocation: 'Altdorf' });
    expect(ok.kind).toBe('move');
    expect(ok.toLocation).toBe('Altdorf');
  });

  it('work_on_goal requires progressNote', () => {
    expect(normalizeAction({ kind: 'work_on_goal' }).kind).toBe('wait');
    const ok = normalizeAction({ kind: 'work_on_goal', progressNote: 'zebrał 3 zioła' });
    expect(ok.kind).toBe('work_on_goal');
    expect(ok.progressNote).toBe('zebrał 3 zioła');
  });

  it('finished defaults reason', () => {
    const out = normalizeAction({ kind: 'finished' });
    expect(out.kind).toBe('finished');
    expect(out.reason).toBe('goal_complete');
  });

  it('wait passes through note', () => {
    const out = normalizeAction({ kind: 'wait', note: 'resting' });
    expect(out.kind).toBe('wait');
    expect(out.note).toBe('resting');
  });
});

describe('buildNextGoalProgress', () => {
  it('starts from empty state', () => {
    const out = buildNextGoalProgress(null, { kind: 'work_on_goal', progressNote: 'krok 1' }, now);
    expect(out.step).toBe(1);
    expect(out.milestones).toHaveLength(1);
    expect(out.lastAction).toBe('work_on_goal');
    expect(out.updatedAt).toBe(now.toISOString());
  });

  it('increments step on work_on_goal', () => {
    const prev = { step: 3, milestones: [{ at: 'x', note: 'a' }] };
    const out = buildNextGoalProgress(prev, { kind: 'work_on_goal', progressNote: 'b' }, now);
    expect(out.step).toBe(4);
    expect(out.milestones).toHaveLength(2);
  });

  it('move updates lastLocation, does not increment step', () => {
    const prev = { step: 5, milestones: [] };
    const out = buildNextGoalProgress(prev, { kind: 'move', toLocation: 'Forest' }, now);
    expect(out.step).toBe(5);
    expect(out.lastLocation).toBe('Forest');
    expect(out.lastAction).toBe('move');
  });

  it('caps milestones at 20', () => {
    const prev = { step: 20, milestones: Array.from({ length: 20 }, (_, i) => ({ at: 't', note: `n${i}` })) };
    const out = buildNextGoalProgress(prev, { kind: 'work_on_goal', progressNote: 'fresh' }, now);
    expect(out.milestones).toHaveLength(20);
    expect(out.milestones[19].note).toBe('fresh');
  });
});

describe('selectEligibleNpcs', () => {
  it('filters out ineligible and orders oldest-first', () => {
    const neverTicked = baseNpc({ id: 'a', name: 'A' });
    const oldTick = baseNpc({ id: 'b', name: 'B', lastTickAt: new Date('2025-01-01T00:00:00Z') });
    const recentTick = baseNpc({
      id: 'c',
      name: 'C',
      lastTickAt: new Date(now.getTime() - 1000 * 60 * 60), // 1h ago
      tickIntervalHours: 24,
    });
    const dead = baseNpc({ id: 'd', alive: false });

    const picked = selectEligibleNpcs([recentTick, dead, neverTicked, oldTick], 10, now);
    expect(picked.map((n) => n.id)).toEqual(['a', 'b']); // never-ticked first (null → 0), then old
  });

  it('limit caps output', () => {
    const many = Array.from({ length: 5 }, (_, i) => baseNpc({ id: `n${i}` }));
    expect(selectEligibleNpcs(many, 2, now)).toHaveLength(2);
  });
});
