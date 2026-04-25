import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    worldNPC: { findUnique: vi.fn(), update: vi.fn() },
    worldLocation: { findUnique: vi.fn(), update: vi.fn() },
    pendingWorldStateChange: { upsert: vi.fn() },
  },
}));
vi.mock('./ragService.js', () => ({
  query: vi.fn(),
  index: vi.fn(),
  invalidate: vi.fn(),
  batchBackfillMissing: vi.fn(),
}));

import { prisma } from '../../lib/prisma.js';
import {
  entityTypeForKind,
  resolveWorldChanges,
  correlateWithShadowDiff,
  classifyConfidence,
  buildKnowledgeEntry,
  appendKnowledgeEntry,
  computeIdempotencyKey,
  applyWorldStateChanges,
  applyLocationKnowledgeChange,
  runWorldStateChangePipeline,
} from './postCampaignWorldChanges.js';

beforeEach(() => {
  prisma.worldNPC.findUnique.mockReset();
  prisma.worldNPC.update.mockReset();
  prisma.worldLocation.findUnique.mockReset();
  prisma.worldLocation.update.mockReset();
  prisma.pendingWorldStateChange.upsert.mockReset();
  prisma.pendingWorldStateChange.upsert.mockResolvedValue({});
});

// Shared test fixtures.
const npcDeathChange = {
  kind: 'npcDeath',
  targetHint: 'Kapitan Gerent',
  newValue: 'zginął pod bramą',
  confidence: 0.9,
  reason: 'memory fact #1',
};
const npcRelocationChange = {
  kind: 'npcRelocation',
  targetHint: 'Arcykapłanka Lyana',
  newValue: 'przeniosła się do Yeralden',
  confidence: 0.8,
  reason: 'memory fact #2',
};
const rumorChange = {
  kind: 'newRumor',
  targetHint: 'Eleya Tropicielka',
  newValue: 'plotka: widziała smoka w górach',
  confidence: 0.7,
  reason: 'journal',
};
const locBurnedChange = {
  kind: 'locationBurned',
  targetHint: 'Świetłogaj',
  newValue: 'spalony przez bandytów',
  confidence: 0.85,
  reason: 'fact #3',
};
const factionChange = {
  kind: 'factionShift',
  targetHint: 'Straż Miejska',
  newValue: 'pod nowym dowództwem',
  confidence: 0.7,
  reason: 'x',
};

describe('entityTypeForKind', () => {
  it('maps NPC-subject kinds to "npc"', () => {
    expect(entityTypeForKind('npcDeath')).toBe('npc');
    expect(entityTypeForKind('npcRelocation')).toBe('npc');
    expect(entityTypeForKind('newRumor')).toBe('npc');
  });
  it('maps location kinds to "location"', () => {
    expect(entityTypeForKind('locationBurned')).toBe('location');
  });
  it('returns null for kinds without a canonical target', () => {
    expect(entityTypeForKind('factionShift')).toBeNull();
    expect(entityTypeForKind('unknown')).toBeNull();
  });
});

describe('resolveWorldChanges', () => {
  it('returns [] for empty / non-array input', async () => {
    expect(await resolveWorldChanges([])).toEqual([]);
    expect(await resolveWorldChanges(null)).toEqual([]);
  });

  it('marks kinds with no entityType as unresolved without calling ragQuery', async () => {
    const ragQuery = vi.fn();
    const out = await resolveWorldChanges([factionChange], { ragQuery });
    expect(out[0].resolved).toBeNull();
    expect(out[0].reason).toBe('no_entity_type_for_kind');
    expect(ragQuery).not.toHaveBeenCalled();
  });

  it('returns the top RAG hit when similarity clears minSim', async () => {
    const ragQuery = vi.fn().mockResolvedValue([
      { entityId: 'w1', entityType: 'npc', similarity: 0.82, text: 'Kapitan Gerent...' },
    ]);
    const out = await resolveWorldChanges([npcDeathChange], { ragQuery });
    expect(out[0].resolved).toMatchObject({ entityId: 'w1', similarity: 0.82 });
    expect(ragQuery).toHaveBeenCalledWith('Kapitan Gerent', expect.objectContaining({
      filters: { entityType: 'npc' }, topK: 1,
    }));
  });

  it('marks empty hits as below_min_sim', async () => {
    const ragQuery = vi.fn().mockResolvedValue([]);
    const out = await resolveWorldChanges([npcDeathChange], { ragQuery });
    expect(out[0].resolved).toBeNull();
    expect(out[0].reason).toBe('below_min_sim');
  });

  it('tolerates rag errors (returns rag_error, does not throw)', async () => {
    const ragQuery = vi.fn().mockRejectedValue(new Error('network down'));
    const out = await resolveWorldChanges([npcDeathChange], { ragQuery });
    expect(out[0].resolved).toBeNull();
    expect(out[0].reason).toBe('rag_error');
  });
});

describe('correlateWithShadowDiff', () => {
  const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.9 };

  it('returns null when resolved is null', () => {
    expect(correlateWithShadowDiff({ change: npcDeathChange, resolved: null }, null)).toBeNull();
  });

  it('returns null when shadow diff empty or missing', () => {
    expect(correlateWithShadowDiff({ change: npcDeathChange, resolved }, null)).toBeNull();
    expect(correlateWithShadowDiff({ change: npcDeathChange, resolved }, { npcDiffs: [] })).toBeNull();
  });

  it('correlates npcDeath with shadow alive:true→false on same NPC', () => {
    const diff = {
      npcDiffs: [
        { worldNpcId: 'w1', name: 'Gerent', changes: [{ field: 'alive', oldValue: true, newValue: false }] },
      ],
    };
    expect(correlateWithShadowDiff({ change: npcDeathChange, resolved }, diff))
      .toMatchObject({ worldNpcId: 'w1' });
  });

  it('does NOT correlate npcDeath when shadow has only location change for same NPC', () => {
    const diff = {
      npcDiffs: [
        { worldNpcId: 'w1', changes: [{ field: 'location', oldValue: 'a', newValue: 'b' }] },
      ],
    };
    expect(correlateWithShadowDiff({ change: npcDeathChange, resolved }, diff)).toBeNull();
  });

  it('correlates npcRelocation with shadow location change', () => {
    const diff = {
      npcDiffs: [{ worldNpcId: 'w1', changes: [{ field: 'location', newValue: 'loc_new' }] }],
    };
    expect(correlateWithShadowDiff({ change: npcRelocationChange, resolved }, diff))
      .toMatchObject({ worldNpcId: 'w1' });
  });

  it('returns null for kinds with no shadow-diff pathway (newRumor, locationBurned)', () => {
    const diff = { npcDiffs: [{ worldNpcId: 'w1', changes: [{ field: 'alive', newValue: false }] }] };
    expect(correlateWithShadowDiff({ change: rumorChange, resolved }, diff)).toBeNull();
    expect(correlateWithShadowDiff({ change: locBurnedChange, resolved: { ...resolved, entityType: 'location' } }, diff)).toBeNull();
  });

  it('returns null when shadow diff is for a different NPC', () => {
    const diff = {
      npcDiffs: [{ worldNpcId: 'wOTHER', changes: [{ field: 'alive', newValue: false }] }],
    };
    expect(correlateWithShadowDiff({ change: npcDeathChange, resolved }, diff)).toBeNull();
  });
});

describe('classifyConfidence', () => {
  it('low when resolved is null', () => {
    expect(classifyConfidence({ resolved: null, correlation: null })).toMatchObject({ tier: 'low' });
  });

  it('low when similarity below consider threshold', () => {
    const r = { entityId: 'w1', similarity: 0.5 };
    expect(classifyConfidence({ resolved: r, correlation: null })).toMatchObject({ tier: 'low' });
  });

  it('high when correlated AND sim ≥ auto threshold (0.75)', () => {
    const r = { entityId: 'w1', similarity: 0.8 };
    const correlation = { worldNpcId: 'w1' };
    expect(classifyConfidence({ resolved: r, correlation })).toMatchObject({ tier: 'high' });
  });

  it('medium when correlated but sim < auto threshold', () => {
    const r = { entityId: 'w1', similarity: 0.7 };
    const correlation = { worldNpcId: 'w1' };
    expect(classifyConfidence({ resolved: r, correlation })).toMatchObject({ tier: 'medium' });
  });

  it('medium when resolved but no correlation (LLM-only)', () => {
    const r = { entityId: 'w1', similarity: 0.9 };
    expect(classifyConfidence({ resolved: r, correlation: null })).toMatchObject({ tier: 'medium', reason: 'llm_only' });
  });
});

describe('buildKnowledgeEntry', () => {
  const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.824 };

  it('produces a stable shape with content suffixed by reason', () => {
    const entry = buildKnowledgeEntry({ change: npcDeathChange, resolved, campaignId: 'c1' });
    expect(entry).toMatchObject({
      content: 'zginął pod bramą (memory fact #1)',
      source: 'llm_extraction:c1',
      kind: 'npcDeath',
      confidence: 0.9,
      similarity: 0.824,
    });
    expect(typeof entry.addedAt).toBe('string');
  });

  it('omits trailing " ()" when reason is empty', () => {
    const entry = buildKnowledgeEntry({ change: { ...npcDeathChange, reason: '' }, resolved, campaignId: 'c1' });
    expect(entry.content).toBe('zginął pod bramą');
  });

  it('handles missing campaignId gracefully', () => {
    const entry = buildKnowledgeEntry({ change: npcDeathChange, resolved });
    expect(entry.source).toBe('llm_extraction:unknown');
  });
});

describe('appendKnowledgeEntry', () => {
  const newEntry = { content: 'NEW', source: 'llm_extraction:c1' };

  it('appends to an existing parsed array', () => {
    const next = appendKnowledgeEntry([{ content: 'old', source: 'baseline' }], newEntry);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual(newEntry);
  });

  it('still tolerates a legacy JSON-string input', () => {
    const next = appendKnowledgeEntry(JSON.stringify([{ content: 'old', source: 'baseline' }]), newEntry);
    expect(next).toHaveLength(2);
  });

  it('starts fresh when input is null/empty/malformed', () => {
    expect(appendKnowledgeEntry(null, newEntry)).toEqual([newEntry]);
    expect(appendKnowledgeEntry('', newEntry)).toEqual([newEntry]);
    expect(appendKnowledgeEntry('{malformed', newEntry)).toEqual([newEntry]);
  });

  it('caps FIFO when total exceeds cap', () => {
    const many = Array.from({ length: 52 }, (_, i) => ({ content: `k${i}`, source: 'baseline' }));
    const result = appendKnowledgeEntry(many, newEntry, { cap: 50 });
    expect(result).toHaveLength(50);
    expect(result[result.length - 1]).toEqual(newEntry);
    expect(result[0].content).toBe('k3');
  });
});

describe('applyWorldStateChanges', () => {
  const basePipeline = (change, resolved, tier, reason = 'x') => ({
    change, resolved, tier, reason,
  });

  it('routes low tier to skipped', async () => {
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, null, 'low', 'no_resolution')],
      campaignId: 'c1',
      dryRun: true,
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.appliedKnowledge).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
  });

  it('routes medium tier to pending with persisted row shape', async () => {
    const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.65 };
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, resolved, 'medium', 'llm_only')],
      campaignId: 'c1',
      dryRun: true,
    });
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0]).toMatchObject({
      campaignId: 'c1',
      targetEntityId: 'w1',
      targetEntityType: 'npc',
      kind: 'npcDeath',
      reason: 'llm_only',
      dryRun: true,
    });
    expect(result.pending[0].idempotencyKey).toMatch(/^[a-f0-9]{16}$/);
  });

  it('dryRun HIGH appends to appliedKnowledge without DB writes', async () => {
    const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.9 };
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, resolved, 'high')],
      campaignId: 'c1',
      dryRun: true,
    });
    expect(result.appliedKnowledge).toHaveLength(1);
    expect(result.appliedKnowledge[0]).toMatchObject({ worldNpcId: 'w1', dryRun: true });
    expect(prisma.worldNPC.findUnique).not.toHaveBeenCalled();
  });

  it('HIGH tier with location entity routes to pending with location_requires_review', async () => {
    const resolved = { entityId: 'loc1', entityType: 'location', similarity: 0.9 };
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(locBurnedChange, resolved, 'high')],
      campaignId: 'c1',
      dryRun: true,
    });
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].reason).toBe('location_requires_review');
    expect(result.pending[0].targetEntityType).toBe('location');
  });

  it('MEDIUM persists via pendingWorldStateChange.upsert when not dryRun', async () => {
    const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.65 };
    await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, resolved, 'medium', 'llm_only')],
      campaignId: 'c1',
    });
    expect(prisma.pendingWorldStateChange.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.pendingWorldStateChange.upsert.mock.calls[0][0];
    expect(call.where.campaignId_idempotencyKey).toMatchObject({ campaignId: 'c1' });
    expect(call.create).toMatchObject({
      campaignId: 'c1',
      kind: 'npcDeath',
      targetEntityId: 'w1',
      reason: 'llm_only',
    });
    // Update block is stat-only; reviewer fields are never touched on re-run.
    expect(call.update).not.toHaveProperty('status');
    expect(call.update).not.toHaveProperty('reviewedBy');
    expect(call.update).not.toHaveProperty('reviewedAt');
    expect(call.update).not.toHaveProperty('reviewNotes');
  });

  it('pending upsert write failure degrades gracefully (no crash, item dropped)', async () => {
    const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.65 };
    prisma.pendingWorldStateChange.upsert.mockRejectedValueOnce(new Error('db down'));
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, resolved, 'medium', 'llm_only')],
      campaignId: 'c1',
    });
    expect(result.pending).toHaveLength(0);
  });

  it('HIGH tier writes to WorldNPC.knowledgeBase when not dryRun', async () => {
    prisma.worldNPC.findUnique.mockResolvedValue({ id: 'w1', knowledgeBase: [] });
    prisma.worldNPC.update.mockResolvedValue({});
    const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.9 };
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, resolved, 'high')],
      campaignId: 'c1',
    });
    expect(prisma.worldNPC.update).toHaveBeenCalledTimes(1);
    expect(result.appliedKnowledge).toHaveLength(1);
    const writtenData = prisma.worldNPC.update.mock.calls[0][0].data;
    expect(writtenData.knowledgeBase[0].source).toBe('llm_extraction:c1');
  });

  it('skips HIGH write when WorldNPC row no longer exists', async () => {
    prisma.worldNPC.findUnique.mockResolvedValue(null);
    const resolved = { entityId: 'wGhost', entityType: 'npc', similarity: 0.9 };
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, resolved, 'high')],
      campaignId: 'c1',
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('world_npc_not_found');
  });

  it('write failure lands in skipped with write_failed reason', async () => {
    prisma.worldNPC.findUnique.mockResolvedValue({ id: 'w1', knowledgeBase: '[]' });
    prisma.worldNPC.update.mockRejectedValue(new Error('db down'));
    const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.9 };
    const result = await applyWorldStateChanges({
      classifications: [basePipeline(npcDeathChange, resolved, 'high')],
      campaignId: 'c1',
    });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('write_failed');
  });
});

describe('runWorldStateChangePipeline', () => {
  it('threads resolve → correlate → classify → apply end-to-end (dryRun)', async () => {
    const ragQuery = vi.fn().mockResolvedValue([
      { entityId: 'w1', entityType: 'npc', similarity: 0.85, text: 'Gerent' },
    ]);
    const shadowDiff = {
      npcDiffs: [
        { worldNpcId: 'w1', changes: [{ field: 'alive', oldValue: true, newValue: false }] },
      ],
    };
    const result = await runWorldStateChangePipeline({
      changes: [npcDeathChange],
      shadowDiff,
      campaignId: 'c1',
      dryRun: true,
      ragQuery,
    });
    expect(result.classifications[0].tier).toBe('high');
    expect(result.appliedKnowledge).toHaveLength(1);
  });

  it('assigns medium when LLM change lacks shadow corroboration', async () => {
    const ragQuery = vi.fn().mockResolvedValue([
      { entityId: 'w1', entityType: 'npc', similarity: 0.85, text: 'x' },
    ]);
    const result = await runWorldStateChangePipeline({
      changes: [rumorChange],
      shadowDiff: { npcDiffs: [] },
      campaignId: 'c1',
      dryRun: true,
      ragQuery,
    });
    expect(result.classifications[0].tier).toBe('medium');
    expect(result.pending).toHaveLength(1);
  });

  it('kinds without entityType land in low with no_resolution reason', async () => {
    const ragQuery = vi.fn();
    const result = await runWorldStateChangePipeline({
      changes: [factionChange],
      shadowDiff: null,
      campaignId: 'c1',
      dryRun: true,
      ragQuery,
    });
    expect(result.classifications[0].tier).toBe('low');
    expect(result.skipped).toHaveLength(1);
    expect(ragQuery).not.toHaveBeenCalled();
  });
});

describe('computeIdempotencyKey (Phase 12 closeout)', () => {
  it('produces a stable 16-char hex hash', () => {
    const key = computeIdempotencyKey({
      kind: 'npcDeath', targetHint: 'Gerent', newValue: 'zginął pod bramą',
    });
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is deterministic for the same triple', () => {
    const args = { kind: 'npcDeath', targetHint: 'Gerent', newValue: 'zginął' };
    expect(computeIdempotencyKey(args)).toBe(computeIdempotencyKey(args));
  });

  it('different newValue wordings produce different keys (feature, not bug — rumors!)', () => {
    const a = computeIdempotencyKey({ kind: 'npcDeath', targetHint: 'Gerent', newValue: 'zginął pod bramą' });
    const b = computeIdempotencyKey({ kind: 'npcDeath', targetHint: 'Gerent', newValue: 'poległ w walce' });
    expect(a).not.toBe(b);
  });

  it('case-sensitive — "Gerent" ≠ "gerent"', () => {
    const a = computeIdempotencyKey({ kind: 'npcDeath', targetHint: 'Gerent', newValue: 'x' });
    const b = computeIdempotencyKey({ kind: 'npcDeath', targetHint: 'gerent', newValue: 'x' });
    expect(a).not.toBe(b);
  });

  it('tolerates missing fields defensively', () => {
    expect(computeIdempotencyKey({})).toMatch(/^[a-f0-9]{16}$/);
    expect(computeIdempotencyKey({ kind: null, targetHint: undefined })).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe('applyLocationKnowledgeChange (Phase 12 closeout)', () => {
  it('appends to WorldLocation.knowledgeBase on happy path', async () => {
    prisma.worldLocation.findUnique.mockResolvedValue({ id: 'loc1', knowledgeBase: '[]' });
    prisma.worldLocation.update.mockResolvedValue({});

    const resolved = { entityId: 'loc1', entityType: 'location', similarity: 0.9 };
    const result = await applyLocationKnowledgeChange({
      change: locBurnedChange, resolved, campaignId: 'c1',
    });

    expect(result.ok).toBe(true);
    expect(prisma.worldLocation.update).toHaveBeenCalledTimes(1);
    const data = prisma.worldLocation.update.mock.calls[0][0].data;
    expect(data.knowledgeBase[0]).toMatchObject({
      content: expect.stringContaining('spalony przez bandytów'),
      source: 'llm_extraction:c1',
      kind: 'locationBurned',
    });
  });

  it('rejects non-location resolved shapes', async () => {
    const resolved = { entityId: 'w1', entityType: 'npc', similarity: 0.9 };
    const result = await applyLocationKnowledgeChange({
      change: locBurnedChange, resolved, campaignId: 'c1',
    });
    expect(result).toEqual({ ok: false, reason: 'not_a_location_change' });
    expect(prisma.worldLocation.findUnique).not.toHaveBeenCalled();
  });

  it('returns reason=world_location_not_found when the row is missing', async () => {
    prisma.worldLocation.findUnique.mockResolvedValue(null);
    const resolved = { entityId: 'gone', entityType: 'location', similarity: 0.9 };
    const result = await applyLocationKnowledgeChange({
      change: locBurnedChange, resolved, campaignId: 'c1',
    });
    expect(result).toEqual({ ok: false, reason: 'world_location_not_found' });
  });

  it('returns reason=write_failed when update throws', async () => {
    prisma.worldLocation.findUnique.mockResolvedValue({ id: 'loc1', knowledgeBase: '[]' });
    prisma.worldLocation.update.mockRejectedValue(new Error('db down'));
    const resolved = { entityId: 'loc1', entityType: 'location', similarity: 0.9 };
    const result = await applyLocationKnowledgeChange({
      change: locBurnedChange, resolved, campaignId: 'c1',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('write_failed');
  });
});
