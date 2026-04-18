import { describe, it, expect } from 'vitest';
import {
  clampList,
  mergeMemoryEntries,
  mergePendingHooks,
  DM_MEMORY_CAP,
  PENDING_HOOKS_CAP,
} from './dmMemoryService.js';

describe('clampList', () => {
  it('returns identical array when under cap', () => {
    const list = [1, 2, 3];
    expect(clampList(list, 5)).toEqual([1, 2, 3]);
  });

  it('drops oldest entries when over cap', () => {
    const list = [1, 2, 3, 4, 5, 6];
    expect(clampList(list, 4)).toEqual([3, 4, 5, 6]);
  });

  it('handles non-array input safely', () => {
    expect(clampList(null, 5)).toEqual([]);
    expect(clampList(undefined, 5)).toEqual([]);
    expect(clampList('not-an-array', 5)).toEqual([]);
  });

  it('constants are sane', () => {
    expect(DM_MEMORY_CAP).toBeGreaterThanOrEqual(10);
    expect(PENDING_HOOKS_CAP).toBeGreaterThanOrEqual(5);
  });
});

describe('mergeMemoryEntries', () => {
  it('appends new entries to existing', () => {
    const existing = [{ summary: 'A', status: 'planned' }];
    const add = [{ summary: 'B', status: 'introduced' }];
    const out = mergeMemoryEntries(existing, add);
    expect(out).toHaveLength(2);
    expect(out[0].summary).toBe('A');
    expect(out[1].summary).toBe('B');
  });

  it('dedupes by summary (case-insensitive)', () => {
    const existing = [{ summary: 'Bjorn plans revenge', status: 'planned' }];
    const add = [{ summary: 'bjorn PLANS revenge', status: 'planned' }];
    const out = mergeMemoryEntries(existing, add);
    expect(out).toHaveLength(1);
  });

  it('populates default at/status on new entries', () => {
    const add = [{ summary: 'X' }];
    const out = mergeMemoryEntries([], add);
    expect(out[0].status).toBe('planned');
    expect(out[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('clamps at DM_MEMORY_CAP', () => {
    const existing = Array.from({ length: DM_MEMORY_CAP }, (_, i) => ({ summary: `M${i}` }));
    const add = [{ summary: 'NEW' }];
    const out = mergeMemoryEntries(existing, add);
    expect(out).toHaveLength(DM_MEMORY_CAP);
    // Oldest dropped, newest included
    expect(out[out.length - 1].summary).toBe('NEW');
    expect(out[0].summary).toBe('M1');
  });

  it('drops entries with empty summary', () => {
    const add = [{ summary: '' }, { summary: '   ' }, { summary: 'ok' }];
    const out = mergeMemoryEntries([], add);
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe('ok');
  });
});

describe('mergePendingHooks', () => {
  it('upserts by id', () => {
    const existing = [
      { id: 'cultist-ritual', kind: 'quest', summary: 'original summary', priority: 'normal' },
    ];
    const add = [
      { id: 'cultist-ritual', kind: 'quest', summary: 'updated summary', priority: 'high' },
    ];
    const out = mergePendingHooks(existing, add);
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe('updated summary');
    expect(out[0].priority).toBe('high');
  });

  it('drops resolved hooks', () => {
    const existing = [
      { id: 'hook1', summary: 'a' },
      { id: 'hook2', summary: 'b' },
    ];
    const out = mergePendingHooks(existing, [], ['hook1']);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('hook2');
  });

  it('rejects hooks without id or summary', () => {
    const add = [
      { kind: 'quest', summary: 'no id' },
      { id: 'ok', summary: 'fine' },
      { id: 'empty-summary' },
    ];
    const out = mergePendingHooks([], add);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('ok');
  });

  it('preserves createdAt on existing hooks across updates', () => {
    const existing = [{ id: 'h', summary: 'v1', createdAt: '2026-01-01T00:00:00Z' }];
    const out = mergePendingHooks(existing, [{ id: 'h', summary: 'v2' }]);
    expect(out[0].createdAt).toBe('2026-01-01T00:00:00Z');
    expect(out[0].summary).toBe('v2');
  });

  it('clamps at PENDING_HOOKS_CAP', () => {
    const existing = Array.from({ length: PENDING_HOOKS_CAP }, (_, i) => ({
      id: `h${i}`,
      summary: `hook${i}`,
    }));
    const add = [{ id: 'h-new', summary: 'newest' }];
    const out = mergePendingHooks(existing, add);
    expect(out).toHaveLength(PENDING_HOOKS_CAP);
    expect(out.find((h) => h.id === 'h-new')).toBeTruthy();
  });
});
