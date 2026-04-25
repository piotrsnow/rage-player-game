import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    campaignNPC: { findMany: vi.fn() },
    campaignQuest: { findMany: vi.fn() },
    campaignScene: { findMany: vi.fn() },
    campaign: { findUnique: vi.fn() },
    nPCPromotionCandidate: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock('./ragService.js', () => ({
  index: vi.fn(),
  query: vi.fn(),
}));
vi.mock('./postCampaignPromotionVerdict.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runVerdictForCandidates: vi.fn(),
  };
});

import { prisma } from '../../lib/prisma.js';
import * as ragService from './ragService.js';
import { runVerdictForCandidates } from './postCampaignPromotionVerdict.js';
import {
  slugifyNpcId,
  computeStructuralInvolvement,
  scoreCandidate,
  selectTopNCandidates,
  buildCandidateEmbeddingText,
  bucketDialogByNpc,
  renderDialogSample,
  harvestDialogSamples,
  findDuplicateCandidate,
  collectPromotionCandidates,
  persistPromotionCandidates,
  runNpcPromotionPipeline,
} from './postCampaignPromotion.js';

beforeEach(() => {
  prisma.campaignNPC.findMany.mockReset();
  prisma.campaignQuest.findMany.mockReset();
  prisma.campaignScene.findMany.mockReset();
  prisma.campaign.findUnique.mockReset();
  prisma.nPCPromotionCandidate.upsert.mockReset();
  prisma.nPCPromotionCandidate.findUnique.mockReset();
  ragService.index.mockReset().mockResolvedValue([0.1, 0.2]);
  ragService.query.mockReset().mockResolvedValue([]);
  runVerdictForCandidates.mockReset().mockResolvedValue(new Map());
});

describe('slugifyNpcId', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugifyNpcId('Kapitan Gerent')).toBe('kapitan_gerent');
    expect(slugifyNpcId('  Eleya  Tropicielka  ')).toBe('eleya_tropicielka');
  });
  it('handles empty / null defensively', () => {
    expect(slugifyNpcId('')).toBe('');
    expect(slugifyNpcId(null)).toBe('');
    expect(slugifyNpcId(undefined)).toBe('');
  });
});

describe('computeStructuralInvolvement', () => {
  it('returns empty Map for empty / non-array input', () => {
    expect(computeStructuralInvolvement([]).size).toBe(0);
    expect(computeStructuralInvolvement(null).size).toBe(0);
  });

  it('counts each quest once per NPC role (questGiver + turnInNpc)', () => {
    const quests = [
      { questGiverId: 'gerent', turnInNpcId: 'lyana' },
      { questGiverId: 'gerent', turnInNpcId: 'gerent' },
      { questGiverId: 'dorgun', turnInNpcId: null },
    ];
    const counts = computeStructuralInvolvement(quests);
    expect(counts.get('gerent')).toBe(2);
    expect(counts.get('lyana')).toBe(1);
    expect(counts.get('dorgun')).toBe(1);
  });

  it('slugifies NPC identifiers with spaces and case drift', () => {
    const quests = [{ questGiverId: 'Kapitan Gerent', turnInNpcId: 'KAPITAN GERENT' }];
    const counts = computeStructuralInvolvement(quests);
    expect(counts.get('kapitan_gerent')).toBe(1);
  });

  it('skips quests with missing or blank NPC IDs', () => {
    const quests = [
      { questGiverId: null, turnInNpcId: null },
      { questGiverId: '', turnInNpcId: '   ' },
    ];
    const counts = computeStructuralInvolvement(quests);
    expect(counts.size).toBe(0);
  });
});

describe('scoreCandidate', () => {
  it('weights structural quest strongest, then return visits, then raw interactions', () => {
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 0, structuralQuestCount: 0 })).toBe(5);
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 2, structuralQuestCount: 0 })).toBe(5 + 2 * 3);
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 0, structuralQuestCount: 1 })).toBe(5 + 10);
    expect(scoreCandidate({ interactionCount: 5, questInvolvementCount: 2, structuralQuestCount: 1 })).toBe(5 + 6 + 10);
  });

  it('defaults missing signals to zero', () => {
    expect(scoreCandidate({})).toBe(0);
    expect(scoreCandidate({ interactionCount: null, questInvolvementCount: undefined, structuralQuestCount: 0 })).toBe(0);
  });
});

describe('selectTopNCandidates', () => {
  const mkNpc = (id, npcId, interactionCount, questInvolvementCount, lastInteractionAt) => ({
    id, npcId, name: npcId, role: 'x', personality: 'y',
    interactionCount, questInvolvementCount, dialogCharCount: 0,
    lastInteractionAt, lastInteractionSceneIndex: null,
  });

  it('returns [] for empty input', () => {
    expect(selectTopNCandidates([], new Map())).toEqual([]);
  });

  it('drops zero-score candidates', () => {
    const npcs = [mkNpc('a', 'a', 0, 0, null)];
    expect(selectTopNCandidates(npcs, new Map())).toEqual([]);
  });

  it('sorts by score DESC and takes top N', () => {
    const npcs = [
      mkNpc('a', 'a', 1, 0, null),
      mkNpc('b', 'b', 5, 2, null),
      mkNpc('c', 'c', 2, 0, null),
    ];
    const result = selectTopNCandidates(npcs, new Map(), 2);
    expect(result.map((r) => r.npc.npcId)).toEqual(['b', 'c']);
  });

  it('applies structural quest count from map', () => {
    const npcs = [
      mkNpc('a', 'a', 1, 0, null),
      mkNpc('b', 'b', 1, 0, null),
    ];
    const structural = new Map([['a', 2]]);
    const result = selectTopNCandidates(npcs, structural);
    expect(result[0].npc.npcId).toBe('a');
    expect(result[0].stats.structuralQuestCount).toBe(2);
    expect(result[0].stats.score).toBe(21);
  });

  it('breaks ties on lastInteractionAt DESC', () => {
    const olderDate = '2026-04-01T00:00:00Z';
    const newerDate = '2026-04-10T00:00:00Z';
    const npcs = [
      mkNpc('older', 'older', 5, 0, olderDate),
      mkNpc('newer', 'newer', 5, 0, newerDate),
    ];
    const result = selectTopNCandidates(npcs, new Map());
    expect(result[0].npc.npcId).toBe('newer');
  });
});

describe('buildCandidateEmbeddingText (Slice B)', () => {
  it('joins name + role + personality with em-dash separator', () => {
    expect(buildCandidateEmbeddingText({ name: 'Gerent', role: 'guard captain', personality: 'stern' }))
      .toBe('Gerent — guard captain — stern');
  });

  it('skips missing / blank fields', () => {
    expect(buildCandidateEmbeddingText({ name: 'Gerent', role: null, personality: '' }))
      .toBe('Gerent');
  });

  it('truncates long personality to 200 chars', () => {
    const longPers = 'a'.repeat(500);
    const out = buildCandidateEmbeddingText({ name: 'X', role: 'r', personality: longPers });
    expect(out).toBe(`X — r — ${'a'.repeat(200)}`);
  });
});

describe('bucketDialogByNpc + renderDialogSample (Slice B)', () => {
  const sceneOf = (segs) => ({ dialogueSegments: JSON.stringify(segs) });

  it('groups dialogue lines by speaker slug', () => {
    const scenes = [
      sceneOf([
        { type: 'narration', text: 'nothing' },
        { type: 'dialogue', character: 'Gerent', text: 'Halt!' },
        { type: 'dialogue', character: 'Lyana', text: 'Peace, captain.' },
        { type: 'dialogue', character: 'Gerent', text: 'Who goes there?' },
      ]),
    ];
    const bucket = bucketDialogByNpc(scenes);
    expect(bucket.get('gerent')).toEqual(['Halt!', 'Who goes there?']);
    expect(bucket.get('lyana')).toEqual(['Peace, captain.']);
  });

  it('keeps only the last N lines per NPC (sliding window)', () => {
    const scenes = [sceneOf(Array.from({ length: 10 }, (_, i) => ({
      type: 'dialogue', character: 'G', text: `line ${i}`,
    })))];
    const bucket = bucketDialogByNpc(scenes, 3);
    expect(bucket.get('g')).toEqual(['line 7', 'line 8', 'line 9']);
  });

  it('tolerates malformed dialogueSegments JSON', () => {
    const bucket = bucketDialogByNpc([{ dialogueSegments: '{not json' }]);
    expect(bucket.size).toBe(0);
  });

  it('renders lines with newlines, capped at char budget', () => {
    const out = renderDialogSample(['short', 'longer line', 'x']);
    expect(out).toBe('short\nlonger line\nx');
  });

  it('returns null for empty or whitespace-only buckets', () => {
    expect(renderDialogSample([])).toBeNull();
    expect(renderDialogSample(null)).toBeNull();
    expect(renderDialogSample(['', '   '])).toBeNull();
  });

  it('truncates last line when cap would overflow', () => {
    const long = 'x'.repeat(200);
    const out = renderDialogSample([long, long, long, long]);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out).toContain('xxx');
  });
});

describe('harvestDialogSamples (Slice B)', () => {
  it('attaches dialogSample to matching candidates', async () => {
    prisma.campaignScene.findMany.mockResolvedValue([
      { dialogueSegments: JSON.stringify([
        { type: 'dialogue', character: 'Gerent', text: 'Halt!' },
        { type: 'dialogue', character: 'Gerent', text: 'You look suspicious.' },
      ]) },
    ]);
    const candidates = [
      { npc: { npcId: 'gerent', name: 'Gerent' }, stats: {} },
      { npc: { npcId: 'unknown', name: 'Unknown' }, stats: {} },
    ];
    await harvestDialogSamples('c1', candidates);
    expect(candidates[0].stats.dialogSample).toContain('Halt!');
    expect(candidates[0].stats.dialogSample).toContain('suspicious');
    expect(candidates[1].stats.dialogSample).toBeUndefined();
  });

  it('tolerates empty scene list', async () => {
    prisma.campaignScene.findMany.mockResolvedValue([]);
    const candidates = [{ npc: { npcId: 'x', name: 'X' }, stats: {} }];
    await harvestDialogSamples('c1', candidates);
    expect(candidates[0].stats.dialogSample).toBeUndefined();
  });

  it('tolerates DB errors silently (best-effort)', async () => {
    prisma.campaignScene.findMany.mockRejectedValue(new Error('db down'));
    const candidates = [{ npc: { npcId: 'x', name: 'X' }, stats: {} }];
    await expect(harvestDialogSamples('c1', candidates)).resolves.toBeUndefined();
  });
});

describe('findDuplicateCandidate (Slice B)', () => {
  it('returns match when ragService has a hit', async () => {
    ragService.query.mockResolvedValueOnce([
      { entityId: 'other-cn', similarity: 0.92, text: 'Similar NPC' },
    ]);
    const { match } = await findDuplicateCandidate('Gerent — guard');
    expect(match.entityId).toBe('other-cn');
    expect(match.similarity).toBeGreaterThanOrEqual(0.85);
    expect(ragService.query).toHaveBeenCalledWith('Gerent — guard', expect.objectContaining({
      filters: { entityType: 'promotion_candidate' },
      minSim: 0.85,
    }));
  });

  it('returns null match when query is empty', async () => {
    const { match } = await findDuplicateCandidate('');
    expect(match).toBeNull();
    expect(ragService.query).not.toHaveBeenCalled();
  });

  it('returns null match on ragService failure', async () => {
    ragService.query.mockRejectedValueOnce(new Error('rag down'));
    const { match } = await findDuplicateCandidate('X');
    expect(match).toBeNull();
  });
});

describe('collectPromotionCandidates', () => {
  it('returns [] when campaignId is missing', async () => {
    expect(await collectPromotionCandidates(null)).toEqual([]);
    expect(prisma.campaignNPC.findMany).not.toHaveBeenCalled();
  });

  it('joins ephemerals with structural quest counts and returns scored top-N', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([
      {
        id: 'cn1', npcId: 'gerent', name: 'Gerent', role: 'guard', personality: 'stern',
        interactionCount: 5, questInvolvementCount: 1, dialogCharCount: 0,
        lastInteractionAt: null, lastInteractionSceneIndex: 3,
      },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([
      { questId: 'q1', questGiverId: 'Gerent', turnInNpcId: null },
    ]);

    const result = await collectPromotionCandidates('c1');
    expect(result).toHaveLength(1);
    expect(result[0].stats.structuralQuestCount).toBe(1);
    expect(result[0].stats.score).toBe(5 + 1 * 3 + 1 * 10);
  });

  it('tolerates DB errors and returns empty array', async () => {
    prisma.campaignNPC.findMany.mockRejectedValue(new Error('db down'));
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    const result = await collectPromotionCandidates('c1');
    expect(result).toEqual([]);
  });

  it('skips canonical-linked NPCs (worldNpcId filter is where=null)', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    await collectPromotionCandidates('c1');
    expect(prisma.campaignNPC.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { campaignId: 'c1', worldNpcId: null },
    }));
  });
});

describe('persistPromotionCandidates', () => {
  const baseCandidate = () => ({
    npc: { id: 'cn1', npcId: 'gerent', name: 'Gerent', role: 'guard', personality: 'stern' },
    stats: { interactionCount: 5, questInvolvementCount: 1, structuralQuestCount: 1, score: 18 },
  });

  it('returns empty lists for empty input', async () => {
    const result = await persistPromotionCandidates('c1', []);
    expect(result).toEqual({ persisted: [], skipped: [] });
    expect(prisma.nPCPromotionCandidate.upsert).not.toHaveBeenCalled();
  });

  it('dryRun collects would-write rows without DB writes', async () => {
    const result = await persistPromotionCandidates('c1', [baseCandidate()], { dryRun: true });
    expect(result.persisted).toHaveLength(1);
    expect(result.persisted[0].dryRun).toBe(true);
    expect(prisma.nPCPromotionCandidate.upsert).not.toHaveBeenCalled();
    expect(ragService.index).not.toHaveBeenCalled();
  });

  it('upserts candidate and indexes embedding for future dedup', async () => {
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});
    await persistPromotionCandidates('c1', [baseCandidate()]);
    expect(prisma.nPCPromotionCandidate.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ campaignId_campaignNpcId: { campaignId: 'c1', campaignNpcId: 'cn1' } });
    expect(call.create.stats.score).toBe(18);
    expect(call.create.status).toBe('pending');
    // Indexed for future cross-campaign dedup.
    expect(ragService.index).toHaveBeenCalledWith('promotion_candidate', 'cn1', expect.stringContaining('Gerent'));
  });

  it('dedup: stashes dedupeOfId in stats when ragService finds a match', async () => {
    ragService.query.mockResolvedValueOnce([
      { entityId: 'other-cn', similarity: 0.91, text: 'similar' },
    ]);
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});

    await persistPromotionCandidates('c1', [baseCandidate()]);

    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.create.stats.dedupeOfId).toBe('other-cn');
    expect(call.create.stats.dedupeSimilarity).toBeCloseTo(0.91);
  });

  it('dedup: does NOT stash when rag match points at the same candidate id', async () => {
    ragService.query.mockResolvedValueOnce([
      { entityId: 'cn1', similarity: 0.99, text: 'self' },
    ]);
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});

    await persistPromotionCandidates('c1', [baseCandidate()]);

    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.create.stats.dedupeOfId).toBeUndefined();
  });

  it('verdict: rejects auto-reject candidates with status=rejected and reviewNotes', async () => {
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});

    const verdictByNpcId = new Map([[
      'cn1',
      {
        verdict: {
          recommend: 'no', uniqueness: 2, worldFit: 3,
          reasons: ['stock guard archetype'],
        },
      },
    ]]);

    await persistPromotionCandidates('c1', [baseCandidate()], { verdictByNpcId });

    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.create.status).toBe('rejected');
    expect(call.create.reviewNotes).toContain('stock guard archetype');
    expect(call.create.smallModelVerdict).toContain('"recommend":"no"');
  });

  it('verdict: uniqueness<5 auto-rejects even when recommend=yes', async () => {
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});

    const verdictByNpcId = new Map([[
      'cn1',
      {
        verdict: {
          recommend: 'yes', uniqueness: 4, worldFit: 7,
          reasons: ['too archetypal despite story role'],
        },
      },
    ]]);

    await persistPromotionCandidates('c1', [baseCandidate()], { verdictByNpcId });
    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.create.status).toBe('rejected');
  });

  it('verdict: keeps status=pending when recommend=yes AND uniqueness>=5', async () => {
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});

    const verdictByNpcId = new Map([[
      'cn1',
      {
        verdict: {
          recommend: 'yes', uniqueness: 7, worldFit: 8,
          reasons: ['distinct voice'],
        },
      },
    ]]);

    await persistPromotionCandidates('c1', [baseCandidate()], { verdictByNpcId });
    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.create.status).toBe('pending');
    expect(call.create.reviewNotes).toBeNull();
  });

  it('stickiness: update path preserves admin-touched status and reviewNotes', async () => {
    // Admin already reviewed this candidate — row has reviewedBy set.
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue({
      status: 'approved',
      reviewedBy: 'admin-user',
    });
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});

    const verdictByNpcId = new Map([[
      'cn1',
      {
        verdict: {
          recommend: 'no', uniqueness: 1, worldFit: 0,
          reasons: ['would have been auto-rejected'],
        },
      },
    ]]);

    await persistPromotionCandidates('c1', [baseCandidate()], { verdictByNpcId });

    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('status');
    expect(call.update).not.toHaveProperty('reviewNotes');
    // Stats + verdict still refresh.
    expect(call.update.stats.score).toBe(18);
    expect(call.update.smallModelVerdict).toContain('"recommend":"no"');
  });

  it('attaches harvested dialogSample onto the upsert row', async () => {
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockResolvedValue({});
    const cand = baseCandidate();
    cand.stats.dialogSample = 'Halt!\nWho goes there?';

    await persistPromotionCandidates('c1', [cand]);

    const call = prisma.nPCPromotionCandidate.upsert.mock.calls[0][0];
    expect(call.create.dialogSample).toBe('Halt!\nWho goes there?');
    expect(call.update.dialogSample).toBe('Halt!\nWho goes there?');
  });

  it('skips missing candidate id defensively', async () => {
    const result = await persistPromotionCandidates('c1', [{ npc: {}, stats: {} }]);
    expect(result.skipped).toHaveLength(1);
    expect(result.persisted).toHaveLength(0);
  });

  it('write failure lands in skipped with reason=write_failed', async () => {
    prisma.nPCPromotionCandidate.findUnique.mockResolvedValue(null);
    prisma.nPCPromotionCandidate.upsert.mockRejectedValue(new Error('db down'));
    const result = await persistPromotionCandidates('c1', [baseCandidate()]);
    expect(result.persisted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('write_failed');
  });
});

describe('runNpcPromotionPipeline', () => {
  it('threads collect → harvest → verdict → persist end-to-end (dryRun)', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([
      {
        id: 'cn1', npcId: 'gerent', name: 'Gerent', role: 'guard', personality: 'stern',
        interactionCount: 3, questInvolvementCount: 1, dialogCharCount: 0,
        lastInteractionAt: null, lastInteractionSceneIndex: null,
      },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([
      { questId: 'q1', questGiverId: 'Gerent', turnInNpcId: null },
    ]);
    prisma.campaignScene.findMany.mockResolvedValue([
      { dialogueSegments: JSON.stringify([
        { type: 'dialogue', character: 'Gerent', text: 'Halt!' },
      ]) },
    ]);
    prisma.campaign.findUnique.mockResolvedValue({ name: 'C', genre: 'fantasy', tone: 'dark' });

    const result = await runNpcPromotionPipeline({ campaignId: 'c1', dryRun: true });

    expect(runVerdictForCandidates).toHaveBeenCalledTimes(1);
    expect(result.collected).toHaveLength(1);
    expect(result.persisted).toHaveLength(1);
    expect(result.persisted[0].dryRun).toBe(true);
    expect(result.persisted[0].dialogSample).toContain('Halt!');
    expect(prisma.nPCPromotionCandidate.upsert).not.toHaveBeenCalled();
  });

  it('skipVerdict=true bypasses the LLM call', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([
      {
        id: 'cn1', npcId: 'x', name: 'X', role: 'x', personality: 'x',
        interactionCount: 5, questInvolvementCount: 0, dialogCharCount: 0,
        lastInteractionAt: null, lastInteractionSceneIndex: null,
      },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    prisma.campaignScene.findMany.mockResolvedValue([]);

    await runNpcPromotionPipeline({ campaignId: 'c1', dryRun: true, skipVerdict: true });

    expect(runVerdictForCandidates).not.toHaveBeenCalled();
  });

  it('forwards verdict provider / modelTier / userApiKeys', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([
      {
        id: 'cn1', npcId: 'x', name: 'X', role: 'x', personality: 'x',
        interactionCount: 5, questInvolvementCount: 0, dialogCharCount: 0,
        lastInteractionAt: null, lastInteractionSceneIndex: null,
      },
    ]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    prisma.campaignScene.findMany.mockResolvedValue([]);
    prisma.campaign.findUnique.mockResolvedValue(null);

    await runNpcPromotionPipeline({
      campaignId: 'c1',
      dryRun: true,
      verdictProvider: 'openai',
      verdictModelTier: 'nano',
      verdictUserApiKeys: { openai: 'sk-xyz' },
    });

    expect(runVerdictForCandidates).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      provider: 'openai',
      modelTier: 'nano',
      userApiKeys: { openai: 'sk-xyz' },
    }));
  });

  it('returns empty structures when no candidates qualify', async () => {
    prisma.campaignNPC.findMany.mockResolvedValue([]);
    prisma.campaignQuest.findMany.mockResolvedValue([]);
    const result = await runNpcPromotionPipeline({ campaignId: 'c1', dryRun: true });
    expect(result.collected).toEqual([]);
    expect(result.persisted).toEqual([]);
    expect(runVerdictForCandidates).not.toHaveBeenCalled();
  });
});
