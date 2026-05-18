import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    npc: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    campaignQuest: { findMany: vi.fn() },
    nPCPromotionCandidate: { upsert: vi.fn() },
  },
}));
vi.mock('./ragService.js', () => ({
  index: vi.fn(),
  query: vi.fn(),
}));

import { prisma } from '../../lib/prisma.js';
import * as ragService from './ragService.js';
import {
  slugifyNpcId,
  buildNpcCanonicalId,
  scoreCandidate,
  selectTopNCandidates,
  collectPromotionCandidates,
  runNpcPromotionPipeline,
  promoteCampaignNpcToWorld,
} from './postCampaignPromotion.js';

beforeEach(() => {
  vi.clearAllMocks();
  ragService.index.mockResolvedValue([0.1, 0.2]);
  ragService.query.mockResolvedValue([]);
});

describe('slugifyNpcId', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyNpcId('Kapitan Gerent')).toBe('kapitan-gerent');
    expect(slugifyNpcId('  Eleya  Tropicielka  ')).toBe('eleya--tropicielka');
  });
  it('handles empty / null defensively', () => {
    expect(slugifyNpcId('')).toBe('');
    expect(slugifyNpcId(null)).toBe('');
    expect(slugifyNpcId(undefined)).toBe('');
  });
});

describe('buildNpcCanonicalId', () => {
  it('builds id from name + role suffix', () => {
    const id = buildNpcCanonicalId({ name: 'Gerent', role: 'guard captain' });
    expect(id).toBe('gerent-guard-captain');
  });
  it('omits role suffix when role is empty', () => {
    expect(buildNpcCanonicalId({ name: 'Gerent', role: '' })).toBe('gerent');
    expect(buildNpcCanonicalId({ name: 'Gerent', role: null })).toBe('gerent');
  });
});

describe('scoreCandidate', () => {
  it('weights interaction*2, quest*5, structural*3', () => {
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 0, structuralQuestCount: 0 })).toBe(10);
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 2, structuralQuestCount: 0 })).toBe(10 + 10);
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 0, structuralQuestCount: 1 })).toBe(10 + 3);
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 2, structuralQuestCount: 1 })).toBe(10 + 10 + 3);
  });
  it('defaults missing signals to zero', () => {
    expect(scoreCandidate({})).toBe(0);
  });
});

describe('selectTopNCandidates', () => {
  const mkNpc = (npcId, interactionCount, questInvolvementCount) => ({
    id: npcId, npcId, name: npcId, interactionCount, questInvolvementCount,
  });

  it('returns [] for empty input', () => {
    expect(selectTopNCandidates([], new Map())).toEqual([]);
  });

  it('sorts by score DESC and takes top N', () => {
    const npcs = [
      mkNpc('a', 1, 0),
      mkNpc('b', 5, 2),
      mkNpc('c', 2, 0),
    ];
    const result = selectTopNCandidates(npcs, new Map(), 2);
    expect(result.map((r) => r.npcId)).toEqual(['b', 'c']);
  });

  it('applies structural quest count from map', () => {
    const npcs = [
      mkNpc('a', 1, 0),
      mkNpc('b', 1, 0),
    ];
    const structural = new Map([['a', 2]]);
    const result = selectTopNCandidates(npcs, structural);
    expect(result[0].npcId).toBe('a');
  });
});

describe('collectPromotionCandidates', () => {
  it('returns [] when no ephemeral NPCs exist', async () => {
    prisma.npc.findMany.mockResolvedValue([]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    const result = await collectPromotionCandidates('c1');
    expect(result).toEqual([]);
  });

  it('filters by campaignId and canonicalNpcId=null', async () => {
    prisma.npc.findMany.mockResolvedValue([]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    await collectPromotionCandidates('c1');
    expect(prisma.npc.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { campaignId: 'c1', canonicalNpcId: null },
    }));
  });

  it('returns scored top-N NPCs', async () => {
    prisma.npc.findMany.mockResolvedValue([
      { id: 'cn1', npcId: 'gerent', name: 'Gerent', interactionCount: 5, questInvolvementCount: 1 },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([
      { questGiverId: 'gerent', turnInNpcId: null },
    ]);
    const result = await collectPromotionCandidates('c1');
    expect(result).toHaveLength(1);
    expect(result[0].npcId).toBe('gerent');
  });
});

describe('promoteCampaignNpcToWorld', () => {
  it('returns not_found when NPC does not exist', async () => {
    prisma.npc.findUnique.mockResolvedValue(null);
    const result = await promoteCampaignNpcToWorld('x');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns already_canonical when NPC has no campaignId', async () => {
    prisma.npc.findUnique.mockResolvedValue({ id: 'x', campaignId: null, name: 'X' });
    const result = await promoteCampaignNpcToWorld('x');
    expect(result).toEqual({ ok: false, reason: 'already_canonical' });
  });

  it('returns no_name when NPC name is blank', async () => {
    prisma.npc.findUnique.mockResolvedValue({ id: 'x', campaignId: 'c1', name: '  ' });
    const result = await promoteCampaignNpcToWorld('x');
    expect(result).toEqual({ ok: false, reason: 'no_name' });
  });

  it('dedupes against existing canonical NPC', async () => {
    prisma.npc.findUnique.mockResolvedValue({ id: 'cn1', campaignId: 'c1', name: 'Gerent', role: 'guard' });
    prisma.npc.findFirst.mockResolvedValue({ id: 'canonical-gerent', name: 'Gerent' });
    prisma.npc.update.mockResolvedValue({});
    const result = await promoteCampaignNpcToWorld('cn1');
    expect(result.ok).toBe(true);
    expect(result.deduped).toBe(true);
    expect(prisma.npc.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cn1' },
      data: { canonicalNpcId: 'canonical-gerent' },
    }));
  });

  it('promotes NPC to canonical and indexes in RAG', async () => {
    prisma.npc.findUnique.mockResolvedValue({ id: 'cn1', campaignId: 'c1', name: 'Gerent', role: 'guard', personality: 'stern', currentLocationId: 'loc1' });
    prisma.npc.findFirst.mockResolvedValue(null);
    prisma.npc.update.mockResolvedValue({ id: 'cn1', name: 'Gerent' });
    const result = await promoteCampaignNpcToWorld('cn1', { reviewedBy: 'admin' });
    expect(result.ok).toBe(true);
    expect(result.reviewedBy).toBe('admin');
    expect(ragService.index).toHaveBeenCalledWith('npc', 'cn1', expect.stringContaining('Gerent'));
  });
});

describe('runNpcPromotionPipeline', () => {
  it('returns zeros when no candidates qualify', async () => {
    prisma.npc.findMany.mockResolvedValue([]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    const result = await runNpcPromotionPipeline({ campaignId: 'c1' });
    expect(result).toEqual({ collected: 0, persisted: 0, skipped: 0 });
  });

  it('dryRun counts candidates without writing', async () => {
    prisma.npc.findMany.mockResolvedValue([
      { id: 'cn1', npcId: 'g', name: 'G', interactionCount: 3, questInvolvementCount: 1 },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    const result = await runNpcPromotionPipeline({ campaignId: 'c1', dryRun: true });
    expect(result.collected).toBe(1);
    expect(result.persisted).toBe(1);
    expect(prisma.nPCPromotionCandidate.upsert).not.toHaveBeenCalled();
  });

  it('upserts candidates when not dryRun', async () => {
    prisma.npc.findMany.mockResolvedValue([
      { id: 'cn1', npcId: 'g', name: 'G', role: 'r', personality: 'p', interactionCount: 3, questInvolvementCount: 0 },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});
    const result = await runNpcPromotionPipeline({ campaignId: 'c1' });
    expect(result.persisted).toBe(1);
    expect(prisma.nPCPromotionCandidate.upsert).toHaveBeenCalledTimes(1);
  });

  it('counts upsert failures as skipped', async () => {
    prisma.npc.findMany.mockResolvedValue([
      { id: 'cn1', npcId: 'g', name: 'G', interactionCount: 5, questInvolvementCount: 0 },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    prisma.nPCPromotionCandidate.upsert.mockRejectedValue(new Error('db down'));
    const result = await runNpcPromotionPipeline({ campaignId: 'c1' });
    expect(result.skipped).toBe(1);
    expect(result.persisted).toBe(0);
  });
});
