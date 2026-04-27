import { describe, it, expect } from 'vitest';
import {
  planMemoryInserts,
  planHookMutations,
  DM_MEMORY_CAP,
  PENDING_HOOKS_CAP,
} from './dmMemoryService.js';

describe('planMemoryInserts', () => {
  it('returns net-new entries when none exist', () => {
    const out = planMemoryInserts([], [{ summary: 'A' }, { summary: 'B' }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ summary: 'A', status: 'planned', plannedFor: null });
  });

  it('dedupes against already-persisted summaries (case-insensitive)', () => {
    const out = planMemoryInserts(['Bjorn plans revenge'], [{ summary: 'bjorn PLANS revenge' }]);
    expect(out).toHaveLength(0);
  });

  it('dedupes within the additions list itself', () => {
    const out = planMemoryInserts([], [{ summary: 'X' }, { summary: 'x' }]);
    expect(out).toHaveLength(1);
  });

  it('drops entries with empty summary', () => {
    const out = planMemoryInserts([], [{ summary: '' }, { summary: '   ' }, { summary: 'ok' }]);
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe('ok');
  });

  it('preserves status and plannedFor when provided', () => {
    const out = planMemoryInserts([], [
      { summary: 'X', status: 'introduced', plannedFor: 'next session' },
    ]);
    expect(out[0]).toEqual({ summary: 'X', status: 'introduced', plannedFor: 'next session' });
  });

  it('handles non-array inputs safely', () => {
    expect(planMemoryInserts(null, null)).toEqual([]);
    expect(planMemoryInserts(undefined, [{ summary: 'a' }])).toHaveLength(1);
  });

  it('cap constants are sane', () => {
    expect(DM_MEMORY_CAP).toBeGreaterThanOrEqual(10);
    expect(PENDING_HOOKS_CAP).toBeGreaterThanOrEqual(5);
  });
});

describe('planHookMutations', () => {
  it('treats every addition as a new INSERT (no LLM-supplied id)', () => {
    const plan = planHookMutations(
      ['existing-hook-uuid'],
      [
        { kind: 'quest', summary: 'first' },
        { kind: 'intrigue', summary: 'second' },
      ],
    );
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.toCreate.every((h) => !('id' in h))).toBe(true);
    expect(plan.toCreate[0]).toMatchObject({ kind: 'quest', summary: 'first' });
  });

  it('lists resolved-hook ids in toDelete (only those that actually exist)', () => {
    const plan = planHookMutations(['hook1', 'hook2'], [], ['hook1', 'never-existed']);
    expect(plan.toDelete).toEqual(['hook1']);
  });

  it('drops hooks without summary', () => {
    const plan = planHookMutations([], [
      { kind: 'quest', summary: 'fine' },
      { kind: 'quest' },
      { summary: '' },
    ]);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].summary).toBe('fine');
  });

  it('defaults kind to "generic" and priority to "normal"', () => {
    const plan = planHookMutations([], [{ summary: 's' }]);
    expect(plan.toCreate[0]).toMatchObject({ kind: 'generic', priority: 'normal', idealTiming: null });
  });

  it('handles empty resolvedHookIds and additions safely', () => {
    expect(planHookMutations([], [], [])).toEqual({ toCreate: [], toDelete: [] });
    expect(planHookMutations(null, null, null)).toEqual({ toCreate: [], toDelete: [] });
  });
});
