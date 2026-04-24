import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    campaignNPC: { findMany: vi.fn() },
    worldNPC: { findMany: vi.fn(), update: vi.fn() },
    campaign: { findUnique: vi.fn() },
  },
}));
vi.mock('./postCampaignFactExtraction.js', () => ({
  extractWorldFacts: vi.fn(),
}));
vi.mock('./postCampaignWorldChanges.js', () => ({
  runWorldStateChangePipeline: vi.fn(),
}));
vi.mock('./postCampaignPromotion.js', () => ({
  runNpcPromotionPipeline: vi.fn(),
}));

import { prisma } from '../../lib/prisma.js';
import { extractWorldFacts } from './postCampaignFactExtraction.js';
import { runWorldStateChangePipeline } from './postCampaignWorldChanges.js';
import { runNpcPromotionPipeline } from './postCampaignPromotion.js';
import {
  diffNpcFields,
  filterAutoApplyChanges,
  applyShadowDiffToCanonical,
  runPostCampaignWorldWriteback,
} from './postCampaignWriteback.js';

beforeEach(() => {
  prisma.campaignNPC.findMany.mockReset();
  prisma.worldNPC.findMany.mockReset();
  prisma.worldNPC.update.mockReset();
  prisma.campaign.findUnique.mockReset();
  extractWorldFacts.mockReset();
  runWorldStateChangePipeline.mockReset();
  runNpcPromotionPipeline.mockReset();
  // Default: promotion pipeline returns empty (tests opt in by overriding).
  runNpcPromotionPipeline.mockResolvedValue({ collected: [], persisted: [], skipped: [] });
});

describe('diffNpcFields', () => {
  it('returns [] when clone or canonical missing', () => {
    expect(diffNpcFields(null, { alive: true })).toEqual([]);
    expect(diffNpcFields({ alive: true }, null)).toEqual([]);
  });

  it('flags alive transition true → false', () => {
    const clone = { alive: false, lastLocationId: 'loc1' };
    const canonical = { alive: true, currentLocationId: 'loc1' };
    const changes = diffNpcFields(clone, canonical);
    expect(changes).toContainEqual({ field: 'alive', oldValue: true, newValue: false });
    expect(changes.some((c) => c.field === 'location')).toBe(false);
  });

  it('maps lastLocationId → currentLocationId via synthetic `location` field', () => {
    const clone = { alive: true, lastLocationId: 'loc_final' };
    const canonical = { alive: true, currentLocationId: 'loc_start' };
    const changes = diffNpcFields(clone, canonical);
    expect(changes).toEqual([
      { field: 'location', oldValue: 'loc_start', newValue: 'loc_final' },
    ]);
  });

  it('does not report location change when clone.lastLocationId is null', () => {
    // Shadow never set a location → don't promote a null back to canonical.
    const clone = { alive: true, lastLocationId: null };
    const canonical = { alive: true, currentLocationId: 'loc_start' };
    expect(diffNpcFields(clone, canonical)).toEqual([]);
  });

  it('captures role / personality drift (info-only)', () => {
    const clone = { alive: true, role: 'captain', personality: 'stern' };
    const canonical = { alive: true, role: 'guard', personality: 'stern' };
    const changes = diffNpcFields(clone, canonical);
    expect(changes).toContainEqual({ field: 'role', oldValue: 'guard', newValue: 'captain' });
    expect(changes.some((c) => c.field === 'personality')).toBe(false);
  });

  it('ignores clone→null string drift (does not erase canonical)', () => {
    const clone = { alive: true, role: null };
    const canonical = { alive: true, role: 'guard' };
    expect(diffNpcFields(clone, canonical)).toEqual([]);
  });

  it('returns [] when shadow and canonical match', () => {
    const clone = { alive: true, lastLocationId: 'x', role: 'guard', personality: null };
    const canonical = { alive: true, currentLocationId: 'x', role: 'guard', personality: null };
    expect(diffNpcFields(clone, canonical)).toEqual([]);
  });
});

describe('filterAutoApplyChanges', () => {
  it('keeps alive true → false', () => {
    const kept = filterAutoApplyChanges([
      { field: 'alive', oldValue: true, newValue: false },
    ]);
    expect(kept).toHaveLength(1);
  });

  it('drops alive false → true (never auto-resurrect)', () => {
    const kept = filterAutoApplyChanges([
      { field: 'alive', oldValue: false, newValue: true },
    ]);
    expect(kept).toEqual([]);
  });

  it('keeps location changes with non-null newValue', () => {
    const kept = filterAutoApplyChanges([
      { field: 'location', oldValue: 'a', newValue: 'b' },
    ]);
    expect(kept).toHaveLength(1);
  });

  it('drops role / personality drift unless explicitly opted in', () => {
    const changes = [
      { field: 'role', oldValue: 'guard', newValue: 'captain' },
      { field: 'personality', oldValue: 'stern', newValue: 'jovial' },
    ];
    expect(filterAutoApplyChanges(changes)).toEqual([]);
    expect(filterAutoApplyChanges(changes, ['role'])).toHaveLength(1);
  });

  it('tolerates non-array input', () => {
    expect(filterAutoApplyChanges(null)).toEqual([]);
    expect(filterAutoApplyChanges(undefined)).toEqual([]);
  });
});

describe('applyShadowDiffToCanonical (dryRun semantics)', () => {
  it('classifies unauthorized changes as skipped with reason=needs_review', async () => {
    const diff = {
      npcDiffs: [
        {
          worldNpcId: 'w1',
          name: 'Bjorn',
          changes: [
            { field: 'alive', oldValue: true, newValue: false },
            { field: 'role', oldValue: 'guard', newValue: 'captain' },
          ],
        },
      ],
    };
    const result = await applyShadowDiffToCanonical({ diff, dryRun: true });
    expect(result.applied).toEqual([
      {
        worldNpcId: 'w1',
        name: 'Bjorn',
        changes: [{ field: 'alive', oldValue: true, newValue: false }],
      },
    ]);
    expect(result.skipped).toEqual([
      {
        worldNpcId: 'w1',
        name: 'Bjorn',
        reason: 'needs_review',
        changes: [{ field: 'role', oldValue: 'guard', newValue: 'captain' }],
      },
    ]);
  });

  it('returns empty when diff has no npc changes', async () => {
    const result = await applyShadowDiffToCanonical({
      diff: { npcDiffs: [] },
      dryRun: true,
    });
    expect(result).toEqual({ applied: [], skipped: [], dryRun: true });
  });
});

describe('runPostCampaignWorldWriteback — Phase 11 extraction wiring', () => {
  it('propagates extracted changes into the return shape', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue({
      coreState: JSON.stringify({ gameStateSummary: [{ fact: 'X died', sceneIndex: 1 }] }),
    });
    extractWorldFacts.mockResolvedValue({
      changes: [{ kind: 'npcDeath', targetHint: 'X', newValue: 'died', confidence: 0.9, reason: 'summary' }],
    });
    runWorldStateChangePipeline.mockResolvedValue({
      classifications: [], appliedKnowledge: [], pending: [], skipped: [],
    });

    const result = await runPostCampaignWorldWriteback('c1', { dryRun: true });

    expect(extractWorldFacts).toHaveBeenCalledTimes(1);
    expect(extractWorldFacts).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'c1',
      shadowDiffSummary: expect.any(Object),
      modelTier: 'nanoReasoning',
      provider: 'openai',
    }));
    expect(result.factExtraction.changes).toHaveLength(1);
    expect(result.factExtraction.changes[0].kind).toBe('npcDeath');
  });

  it('skips extraction and marks `skipped: true` when skipExtraction=true', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);

    const result = await runPostCampaignWorldWriteback('c1', { dryRun: true, skipExtraction: true });

    expect(extractWorldFacts).not.toHaveBeenCalled();
    expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
    expect(result.factExtraction).toEqual({ changes: [], skipped: true });
  });

  it('tolerates missing coreState — extraction simply skipped, apply still runs', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue(null);

    const result = await runPostCampaignWorldWriteback('c1', { dryRun: true });

    expect(extractWorldFacts).not.toHaveBeenCalled();
    expect(result.factExtraction.skipped).toBe(true);
    expect(result.apply).toBeDefined();
  });

  it('tolerates malformed coreState JSON — logs warn, continues', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue({ coreState: '{malformed' });

    const result = await runPostCampaignWorldWriteback('c1', { dryRun: true });

    expect(extractWorldFacts).not.toHaveBeenCalled();
    expect(result.factExtraction.skipped).toBe(true);
  });

  it('forwards provider / modelTier / userApiKeys overrides', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue({
      coreState: JSON.stringify({ gameStateSummary: [{ fact: 'x', sceneIndex: 0 }] }),
    });
    extractWorldFacts.mockResolvedValue({ changes: [] });

    await runPostCampaignWorldWriteback('c1', {
      dryRun: true,
      extractionProvider: 'anthropic',
      extractionModelTier: 'standard',
      extractionUserApiKeys: { anthropic: 'sk-xyz' },
    });

    expect(extractWorldFacts).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'anthropic',
      modelTier: 'standard',
      userApiKeys: { anthropic: 'sk-xyz' },
    }));
  });
});

describe('runPostCampaignWorldWriteback — Phase 12 world state change wiring', () => {
  const baseChange = { kind: 'npcDeath', targetHint: 'Gerent', newValue: 'died', confidence: 0.9, reason: 'x' };
  const coreState = JSON.stringify({ gameStateSummary: [{ fact: 'fact', sceneIndex: 1 }] });

  it('runs Phase 12 pipeline when extraction produced changes', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue({ coreState });
    extractWorldFacts.mockResolvedValue({ changes: [baseChange] });
    runWorldStateChangePipeline.mockResolvedValue({
      classifications: [{ change: baseChange, tier: 'high' }],
      appliedKnowledge: [{ worldNpcId: 'w1', entry: {} }],
      pending: [],
      skipped: [],
    });

    const result = await runPostCampaignWorldWriteback('c1', { dryRun: true });

    expect(runWorldStateChangePipeline).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'c1',
      dryRun: true,
      changes: [baseChange],
      shadowDiff: expect.any(Object),
    }));
    expect(result.worldStateChanges.appliedKnowledge).toHaveLength(1);
  });

  it('auto-skips Phase 12 when extraction produced no changes', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue({ coreState });
    extractWorldFacts.mockResolvedValue({ changes: [] });

    const result = await runPostCampaignWorldWriteback('c1', { dryRun: true });

    expect(runWorldStateChangePipeline).not.toHaveBeenCalled();
    expect(result.worldStateChanges).toEqual({
      classifications: [], appliedKnowledge: [], pending: [], skipped: [],
    });
  });

  it('skipWorldChangePipeline=true bypasses Phase 12 even when changes exist', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue({ coreState });
    extractWorldFacts.mockResolvedValue({ changes: [baseChange] });

    const result = await runPostCampaignWorldWriteback('c1', {
      dryRun: true, skipWorldChangePipeline: true,
    });

    expect(runWorldStateChangePipeline).not.toHaveBeenCalled();
    expect(result.worldStateChanges.appliedKnowledge).toEqual([]);
  });

  it('passes the full shadow diff object to the pipeline (for correlation)', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([
      { id: 'c-n1', name: 'Gerent', worldNpcId: 'w1', alive: false, lastLocationId: 'l1', role: 'guard', personality: 'stern' },
    ]);
    prisma.worldNPC.findMany.mockResolvedValue([
      { id: 'w1', name: 'Gerent', alive: true, currentLocationId: 'l1', role: 'guard', personality: 'stern' },
    ]);
    prisma.campaign.findUnique.mockResolvedValue({ coreState });
    extractWorldFacts.mockResolvedValue({ changes: [baseChange] });
    runWorldStateChangePipeline.mockResolvedValue({
      classifications: [], appliedKnowledge: [], pending: [], skipped: [],
    });

    await runPostCampaignWorldWriteback('c1', { dryRun: true });

    const pipelineArg = runWorldStateChangePipeline.mock.calls[0][0];
    expect(pipelineArg.shadowDiff.npcDiffs).toHaveLength(1);
    expect(pipelineArg.shadowDiff.npcDiffs[0].worldNpcId).toBe('w1');
  });
});

describe('runPostCampaignWorldWriteback — Phase 12b promotion wiring', () => {
  it('runs the promotion pipeline by default and propagates its output', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    runNpcPromotionPipeline.mockResolvedValue({
      collected: [{ npc: { id: 'cn1' }, stats: { score: 12 } }],
      persisted: [{ campaignId: 'c1', campaignNpcId: 'cn1' }],
      skipped: [],
    });

    const result = await runPostCampaignWorldWriteback('c1', { dryRun: true, skipExtraction: true });

    expect(runNpcPromotionPipeline).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'c1', dryRun: true, topN: 5,
    }));
    expect(result.promotion.collected).toHaveLength(1);
    expect(result.promotion.persisted).toHaveLength(1);
  });

  it('skipPromotion=true bypasses the pipeline entirely', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    const result = await runPostCampaignWorldWriteback('c1', {
      dryRun: true, skipExtraction: true, skipPromotion: true,
    });
    expect(runNpcPromotionPipeline).not.toHaveBeenCalled();
    expect(result.promotion).toEqual({ collected: [], persisted: [], skipped: [] });
  });

  it('forwards promotionTopN override', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    await runPostCampaignWorldWriteback('c1', {
      dryRun: true, skipExtraction: true, promotionTopN: 10,
    });
    expect(runNpcPromotionPipeline).toHaveBeenCalledWith(expect.objectContaining({ topN: 10 }));
  });

  it('forwards Slice B verdict opts (provider / modelTier / userApiKeys)', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    await runPostCampaignWorldWriteback('c1', {
      dryRun: true,
      skipExtraction: true,
      promotionProvider: 'openai',
      promotionModelTier: 'nano',
      promotionUserApiKeys: { openai: 'sk-xyz' },
    });
    expect(runNpcPromotionPipeline).toHaveBeenCalledWith(expect.objectContaining({
      verdictProvider: 'openai',
      verdictModelTier: 'nano',
      verdictUserApiKeys: { openai: 'sk-xyz' },
      skipVerdict: false,
    }));
  });

  it('skipPromotionVerdict=true propagates to pipeline', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    await runPostCampaignWorldWriteback('c1', {
      dryRun: true, skipExtraction: true, skipPromotionVerdict: true,
    });
    expect(runNpcPromotionPipeline).toHaveBeenCalledWith(expect.objectContaining({
      skipVerdict: true,
    }));
  });
});
