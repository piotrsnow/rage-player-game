import { describe, it, expect } from 'vitest';
import {
  isValidNodeKey,
  unlockChildObjectives,
  closeSiblingBranches,
  getActiveFrontier,
  isQuestComplete,
  markObjectiveDiscovered,
  markBranchGroupDiscovered,
  getUndiscoveredCount,
  getKnownGraph,
  validateGraphIntegrity,
} from './questGraph.js';

// Helper — buduje objective z minimalną kształtką (graf w metadata).
function obj({ id = 1, nodeKey, status = 'pending', parents = [], unlocks = [], branchGroup, branchType, discovered = true, choiceLabel, ...rest }) {
  return {
    id, nodeKey, status,
    metadata: {
      parents,
      ...(unlocks.length ? { unlocks } : {}),
      ...(branchGroup ? { branchGroup } : {}),
      ...(branchType ? { branchType } : {}),
      ...(choiceLabel ? { choiceLabel } : {}),
      discovered,
    },
    ...rest,
  };
}

describe('isValidNodeKey', () => {
  it('accepts snake_case ascii', () => {
    expect(isValidNodeKey('meet_baron')).toBe(true);
    expect(isValidNodeKey('a')).toBe(true);
    expect(isValidNodeKey('a1_b2_c3')).toBe(true);
  });
  it('rejects empty / non-string / illegal chars', () => {
    expect(isValidNodeKey('')).toBe(false);
    expect(isValidNodeKey(null)).toBe(false);
    expect(isValidNodeKey('Meet-Baron')).toBe(false);
    expect(isValidNodeKey('meet baron')).toBe(false);
    expect(isValidNodeKey('meet.baron')).toBe(false);
  });
});

describe('unlockChildObjectives', () => {
  it('unlocks single child whose only parent just completed', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'done' }),
      obj({ id: 2, nodeKey: 'b', status: 'locked', parents: ['a'] }),
    ];
    const patches = unlockChildObjectives(objectives, 'a');
    expect(patches).toEqual([{ id: 2, nodeKey: 'b', status: 'pending' }]);
  });

  it('does NOT unlock node with multiple parents until all are done', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'done' }),
      obj({ id: 2, nodeKey: 'b', status: 'pending' }),  // not done
      obj({ id: 3, nodeKey: 'c', status: 'locked', parents: ['a', 'b'] }),
    ];
    const patches = unlockChildObjectives(objectives, 'a');
    expect(patches).toEqual([]);
  });

  it('unlocks via metadata.unlocks shortcut (no parents on child)', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'done', unlocks: ['b'] }),
      obj({ id: 2, nodeKey: 'b', status: 'locked' }),
    ];
    const patches = unlockChildObjectives(objectives, 'a');
    expect(patches).toEqual([{ id: 2, nodeKey: 'b', status: 'pending' }]);
  });

  it('treats completedNodeKey as done even if input still says locked', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'pending' }),  // caller hasn't updated yet
      obj({ id: 2, nodeKey: 'b', status: 'locked', parents: ['a'] }),
    ];
    const patches = unlockChildObjectives(objectives, 'a');
    expect(patches).toEqual([{ id: 2, nodeKey: 'b', status: 'pending' }]);
  });

  it('returns empty when no children match', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'done' }),
      obj({ id: 2, nodeKey: 'b', status: 'pending' }),
    ];
    expect(unlockChildObjectives(objectives, 'a')).toEqual([]);
  });
});

describe('closeSiblingBranches', () => {
  it('marks XOR siblings as skipped', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'spare_witch', status: 'pending', branchGroup: 'witch_resolution', branchType: 'path' }),
      obj({ id: 2, nodeKey: 'kill_witch', status: 'pending', branchGroup: 'witch_resolution', branchType: 'path' }),
      obj({ id: 3, nodeKey: 'flee_witch', status: 'locked', branchGroup: 'witch_resolution', branchType: 'path' }),
    ];
    const patches = closeSiblingBranches(objectives, 'witch_resolution', 'spare_witch');
    expect(patches).toHaveLength(2);
    expect(patches.map((p) => p.nodeKey).sort()).toEqual(['flee_witch', 'kill_witch']);
    expect(patches.every((p) => p.status === 'skipped')).toBe(true);
  });

  it('does not skip already-done siblings (idempotent)', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'pending', branchGroup: 'g' }),
      obj({ id: 2, nodeKey: 'b', status: 'done', branchGroup: 'g' }),
    ];
    const patches = closeSiblingBranches(objectives, 'g', 'a');
    expect(patches).toEqual([]);
  });

  it('ignores nodes outside branchGroup', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'pending', branchGroup: 'g1' }),
      obj({ id: 2, nodeKey: 'b', status: 'pending', branchGroup: 'g2' }),
    ];
    const patches = closeSiblingBranches(objectives, 'g1', 'a');
    expect(patches).toEqual([]);
  });
});

describe('getActiveFrontier', () => {
  it('returns only pending discovered nodes', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'pending', discovered: true }),
      obj({ id: 2, nodeKey: 'b', status: 'pending', discovered: false }),
      obj({ id: 3, nodeKey: 'c', status: 'locked', discovered: true }),
      obj({ id: 4, nodeKey: 'd', status: 'done', discovered: true }),
    ];
    const front = getActiveFrontier(objectives);
    expect(front.map((o) => o.nodeKey)).toEqual(['a']);
  });
});

describe('isQuestComplete', () => {
  it('false on empty objectives (no auto-complete for empty quest)', () => {
    expect(isQuestComplete([])).toBe(false);
  });
  it('true when all done', () => {
    expect(isQuestComplete([
      obj({ id: 1, nodeKey: 'a', status: 'done' }),
      obj({ id: 2, nodeKey: 'b', status: 'done' }),
    ])).toBe(true);
  });
  it('true with skipped tail (XOR branch closed)', () => {
    expect(isQuestComplete([
      obj({ id: 1, nodeKey: 'a', status: 'done' }),
      obj({ id: 2, nodeKey: 'b', status: 'done' }),
      obj({ id: 3, nodeKey: 'c', status: 'skipped' }),
    ])).toBe(true);
  });
  it('false when any pending or locked remains', () => {
    expect(isQuestComplete([
      obj({ id: 1, nodeKey: 'a', status: 'done' }),
      obj({ id: 2, nodeKey: 'b', status: 'locked' }),
    ])).toBe(false);
  });
});

describe('markObjectiveDiscovered', () => {
  it('sets discovered=true and returns patch with new metadata', () => {
    const objectives = [obj({ id: 1, nodeKey: 'a', discovered: false })];
    const patch = markObjectiveDiscovered(objectives, 'a');
    expect(patch).not.toBeNull();
    expect(patch.id).toBe(1);
    expect(patch.metadata.discovered).toBe(true);
  });

  it('returns null when already discovered (sticky, no churn)', () => {
    const objectives = [obj({ id: 1, nodeKey: 'a', discovered: true })];
    expect(markObjectiveDiscovered(objectives, 'a')).toBeNull();
  });

  it('retroactive reveal works on locked nodes', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'future', status: 'locked', parents: ['root'], discovered: false }),
    ];
    const patch = markObjectiveDiscovered(objectives, 'future');
    expect(patch.metadata.discovered).toBe(true);
    // Status pozostaje locked — discovery NIE odblokowuje mechanicznie.
  });

  it('returns null for unknown nodeKey', () => {
    expect(markObjectiveDiscovered([obj({ id: 1, nodeKey: 'a' })], 'b')).toBeNull();
  });
});

describe('markBranchGroupDiscovered', () => {
  it('reveals listed nodes that belong to the group', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'spare', branchGroup: 'g', discovered: false }),
      obj({ id: 2, nodeKey: 'kill', branchGroup: 'g', discovered: false }),
      obj({ id: 3, nodeKey: 'wrong_group', branchGroup: 'h', discovered: false }),
    ];
    const patches = markBranchGroupDiscovered(objectives, 'g', ['spare', 'kill', 'wrong_group']);
    expect(patches.map((p) => p.nodeKey).sort()).toEqual(['kill', 'spare']);
    expect(patches.every((p) => p.metadata.discovered === true)).toBe(true);
  });

  it('skips already-discovered nodes', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'spare', branchGroup: 'g', discovered: true }),
      obj({ id: 2, nodeKey: 'kill', branchGroup: 'g', discovered: false }),
    ];
    const patches = markBranchGroupDiscovered(objectives, 'g', ['spare', 'kill']);
    expect(patches.map((p) => p.nodeKey)).toEqual(['kill']);
  });
});

describe('getUndiscoveredCount', () => {
  it('counts pending undiscovered', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'pending', discovered: true }),
      obj({ id: 2, nodeKey: 'b', status: 'pending', discovered: false }),
      obj({ id: 3, nodeKey: 'c', status: 'pending', discovered: false }),
    ];
    expect(getUndiscoveredCount(objectives)).toBe(2);
  });

  it('counts reachable locked (parents done) but not deep-locked', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'done', discovered: true }),
      obj({ id: 2, nodeKey: 'b', status: 'locked', parents: ['a'], discovered: false }),  // reachable
      obj({ id: 3, nodeKey: 'c', status: 'locked', parents: ['b'], discovered: false }),  // deep
    ];
    expect(getUndiscoveredCount(objectives)).toBe(1);
  });

  it('does not count done/skipped/failed', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'done', discovered: false }),
      obj({ id: 2, nodeKey: 'b', status: 'skipped', discovered: false }),
      obj({ id: 3, nodeKey: 'c', status: 'failed', discovered: false }),
    ];
    expect(getUndiscoveredCount(objectives)).toBe(0);
  });
});

describe('getKnownGraph', () => {
  it('hides skipped, shows discovered locked, shows failed', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'done_known', status: 'done', discovered: true }),
      obj({ id: 2, nodeKey: 'pending_undisc', status: 'pending', discovered: false }),
      obj({ id: 3, nodeKey: 'locked_disc', status: 'locked', discovered: true }),
      obj({ id: 4, nodeKey: 'skipped_node', status: 'skipped' }),
      obj({ id: 5, nodeKey: 'failed_node', status: 'failed', discovered: false }),
    ];
    const known = getKnownGraph(objectives);
    expect(known.map((o) => o.nodeKey).sort()).toEqual(['done_known', 'failed_node', 'locked_disc']);
  });
});

describe('validateGraphIntegrity', () => {
  it('returns empty errors on valid linear graph', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'done' }),
      obj({ id: 2, nodeKey: 'b', status: 'pending', parents: ['a'] }),
    ];
    expect(validateGraphIntegrity(objectives)).toEqual([]);
  });

  it('detects cycle', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', parents: ['b'] }),
      obj({ id: 2, nodeKey: 'b', parents: ['a'] }),
    ];
    const errors = validateGraphIntegrity(objectives);
    expect(errors.some((e) => e.kind === 'cycle')).toBe(true);
  });

  it('detects missing parent ref', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'b', parents: ['nonexistent'] }),
    ];
    const errors = validateGraphIntegrity(objectives);
    expect(errors.some((e) => e.kind === 'missing_parent' && e.parent === 'nonexistent')).toBe(true);
  });

  it('detects self-parent', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', parents: ['a'] }),
    ];
    const errors = validateGraphIntegrity(objectives);
    expect(errors.some((e) => e.kind === 'self_parent')).toBe(true);
  });

  it('detects invalid status / branch type', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'a', status: 'pending', branchType: 'and' }),
      { id: 2, nodeKey: 'b', status: 'whatever', metadata: { branchType: 'XOR' } },
    ];
    const errors = validateGraphIntegrity(objectives);
    expect(errors.some((e) => e.kind === 'invalid_status')).toBe(true);
    expect(errors.some((e) => e.kind === 'invalid_branch_type')).toBe(true);
  });

  it('detects duplicate node keys', () => {
    const objectives = [
      obj({ id: 1, nodeKey: 'dup' }),
      obj({ id: 2, nodeKey: 'dup' }),
    ];
    const errors = validateGraphIntegrity(objectives);
    expect(errors.some((e) => e.kind === 'duplicate_node_key')).toBe(true);
  });
});
