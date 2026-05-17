import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────
// vi.mock hoists to the top of the file. Each mock returns a minimal
// stub; individual tests override via mockResolvedValueOnce as needed.

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    campaignScene: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'scene-1', sceneIndex: 0 }),
    },
    campaignQuickBeat: { findMany: vi.fn().mockResolvedValue([]) },
    campaign: { update: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((fn) => fn({
      campaignScene: {
        create: vi.fn().mockResolvedValue({ id: 'scene-1', sceneIndex: 0 }),
      },
    })),
  },
}));

vi.mock('./campaignLoader.js', () => ({
  loadCampaignState: vi.fn(),
}));

vi.mock('../intentClassifier.js', () => ({
  classifyIntent: vi.fn(),
}));

vi.mock('./streamingClient.js', () => ({
  runTwoStagePipelineStreaming: vi.fn(),
}));

vi.mock('../apiKeyService.js', () => ({
  requireServerApiKey: vi.fn().mockReturnValue('test-key'),
}));

vi.mock('../diceResolver.js', () => ({
  resolveBackendDiceRollWithPreRoll: vi.fn().mockReturnValue(null),
  generatePreRolls: vi.fn().mockReturnValue([
    { d50: 25, luckySuccess: false },
    { d50: 30, luckySuccess: false },
    { d50: 15, luckySuccess: false },
  ]),
  inferForcedRollSkill: vi.fn().mockReturnValue(null),
  CREATIVITY_BONUS_MAX: 3,
}));

vi.mock('../rewardResolver.js', () => ({
  resolveAndApplyRewards: vi.fn(),
}));

vi.mock('../questWrapupFallback.js', () => ({
  generateWrapupFallback: vi.fn().mockResolvedValue(null),
  pickWrapupSpeaker: vi.fn().mockReturnValue(null),
}));

vi.mock('../characterMutations.js', () => ({
  applyCharacterStateChanges: vi.fn((char) => char),
}));

vi.mock('../characterRelations.js', () => ({
  persistCharacterSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./shortcuts.js', () => ({
  tryTradeShortcut: vi.fn().mockReturnValue({ handled: false }),
  tryCombatFastPath: vi.fn().mockResolvedValue({ handled: false }),
}));

vi.mock('./inlineKeys.js', () => ({
  getInlineEntityKeys: vi.fn().mockReturnValue(new Set()),
}));

vi.mock('./systemPrompt.js', () => ({
  buildLeanSystemPrompt: vi.fn().mockReturnValue({
    staticPrefix: 'system prompt',
    dynamicSuffix: '',
  }),
}));

vi.mock('./userPrompt.js', () => ({
  buildUserPrompt: vi.fn().mockReturnValue('user prompt text'),
}));

vi.mock('./locationSanityCheck.js', () => ({
  detectSuspiciousLocationChange: vi.fn().mockReturnValue({ score: 0, signals: [], suspect: {} }),
}));

vi.mock('./diceResolution.js', () => ({
  applyCreativityToRoll: vi.fn(),
  applyForceRollModifier: vi.fn(),
  isCreativityEligible: vi.fn().mockReturnValue(false),
  resolveModelDiceRolls: vi.fn(),
  calculateFreeformSkillXP: vi.fn(),
}));

vi.mock('./enemyFill.js', () => ({
  fillEnemiesFromBestiary: vi.fn(),
}));

vi.mock('./combatFallback.js', () => ({
  injectCombatFallback: vi.fn(),
}));

vi.mock('./dialogueRepairPipeline.js', () => ({
  repairSceneDialogue: vi.fn(),
}));

vi.mock('../../../../shared/domain/worldConsistency.js', () => ({
  checkWorldConsistency: vi.fn().mockReturnValue({ corrections: [], warnings: [], statePatches: {} }),
  applyConsistencyPatches: vi.fn().mockReturnValue(null),
}));

vi.mock('../livingWorld/dungeonEntry.js', () => ({
  handleDungeonEntry: vi.fn().mockResolvedValue(null),
}));

vi.mock('../livingWorld/cloneReconciliation.js', () => ({
  reconcileCloneBatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../livingWorld/questGoalAssigner.js', () => ({
  pickQuestGiver: vi.fn().mockResolvedValue(null),
}));

vi.mock('../cloudTasks.js', () => ({
  enqueuePostSceneWork: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../serverConfig.js', () => ({
  resolveModelForTask: vi.fn().mockResolvedValue('gpt-4o'),
}));

vi.mock('../../../../shared/domain/achievementTracker.js', () => ({
  processStateChanges: vi.fn().mockReturnValue({
    newlyUnlocked: [],
    updatedAchievementState: {},
  }),
}));

vi.mock('../../../../shared/domain/combatXp.js', () => ({
  computeCombatCharXp: vi.fn().mockReturnValue(0),
}));

vi.mock('./yassatoCameo.js', () => ({
  mentionsYassato: vi.fn().mockReturnValue(false),
  isYassatoCameoOnCooldown: vi.fn().mockResolvedValue(true),
  generateYassatoCameoScene: vi.fn(),
}));

vi.mock('./magicExposure.js', () => ({
  detectMagicExposure: vi.fn().mockReturnValue(null),
}));

vi.mock('../aiContextTools.js', () => ({
  assembleContext: vi.fn().mockResolvedValue({}),
}));

vi.mock('../campaignSync.js', () => ({
  loadQuestsForReconcile: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../shared/domain/mergeRestRecoveryIntoStateChanges.js', () => ({
  mergeRestRecoveryIntoStateChanges: vi.fn((sc) => sc),
}));

vi.mock('../difficultyScalingConfig.js', () => ({
  getScaleForTier: vi.fn().mockReturnValue(null),
}));

vi.mock('../../lib/logger.js', () => ({
  childLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { generateSceneStream } from './generateSceneStream.js';
import { loadCampaignState } from './campaignLoader.js';
import { classifyIntent } from '../intentClassifier.js';
import { runTwoStagePipelineStreaming } from './streamingClient.js';
import { prisma } from '../../lib/prisma.js';

// ── Helpers ──────────────────────────────────────────────────────────

function buildTestCampaignState(overrides = {}) {
  return {
    coreState: {
      campaign: { id: 'test-campaign', name: 'Test', genre: 'Fantasy', tone: 'Dramatic', language: 'pl' },
      world: { currentLocation: 'Yeralden', npcs: [], factions: {}, facts: [] },
      combat: { active: false, round: 0, turnIndex: 0, log: [], combatants: [], reason: null },
      character: {
        name: 'Hero',
        attributes: { sila: 10, inteligencja: 10, charyzma: 8, zrecznosc: 10, wytrzymalosc: 10, szczescie: 3 },
        skills: {},
        characterXp: 0,
        companions: [],
      },
      scenes: [],
      chatHistory: [],
      ai: { costs: {} },
    },
    activeCharacter: {
      name: 'Hero',
      attributes: { sila: 10, inteligencja: 10, charyzma: 8, zrecznosc: 10, wytrzymalosc: 10, szczescie: 3 },
      skills: {},
    },
    activeCharacterId: 'char-1',
    dbNpcs: [],
    dbQuests: [],
    dbCodex: [],
    livingWorldEnabled: false,
    questGraphEnabled: false,
    currentRef: null,
    pendingSlip: null,
    pendingProvidence: null,
    ...overrides,
  };
}

function buildValidSceneResult(overrides = {}) {
  return {
    narrative: 'The tavern is warm and lively. A bard plays a gentle tune in the corner.',
    suggestedActions: [
      'Podchodzę do barmana',
      'Siadam przy kominku',
      'Rozglądam się po karczmie',
    ],
    dialogueSegments: [
      { type: 'narration', text: 'The tavern is warm and lively.' },
    ],
    imagePrompt: 'A cozy medieval tavern with warm lighting',
    soundEffect: null,
    scenePacing: 'exploration',
    stateChanges: {
      timeAdvance: { hoursElapsed: 0.5 },
    },
    creativityBonus: 0,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('generateSceneStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    loadCampaignState.mockResolvedValue(buildTestCampaignState());

    classifyIntent.mockResolvedValue({
      _intent: 'explore',
      categories: ['exploration'],
    });

    prisma.$transaction.mockImplementation((fn) => fn({
      campaignScene: {
        create: vi.fn().mockResolvedValue({ id: 'scene-1', sceneIndex: 0 }),
      },
    }));
  });

  it('generates a scene with mocked LLM response and emits correct events', async () => {
    const sceneResult = buildValidSceneResult();
    runTwoStagePipelineStreaming.mockImplementation(
      async (_sys, _user, _ctx, _opts, onChunk) => {
        if (onChunk) onChunk(JSON.stringify(sceneResult));
        return sceneResult;
      },
    );

    const events = [];
    const onEvent = (ev) => events.push(ev);

    await generateSceneStream('test-campaign', 'Rozglądam się po karczmie', {}, onEvent);

    const types = events.map((e) => e.type);
    expect(types).toContain('intent');
    expect(types).toContain('context_ready');
    expect(types).toContain('chunk');
    expect(types).toContain('complete');
    expect(types).not.toContain('error');

    const intentEvent = events.find((e) => e.type === 'intent');
    expect(intentEvent.data.intent).toBe('explore');

    const completeEvent = events.find((e) => e.type === 'complete');
    expect(completeEvent.data.scene).toBeDefined();
    expect(completeEvent.data.scene.narrative).toBeTruthy();
    expect(completeEvent.data.scene.suggestedActions).toBeInstanceOf(Array);
    expect(completeEvent.data.scene.suggestedActions.length).toBeGreaterThan(0);
    expect(completeEvent.data.sceneIndex).toBe(0);
    expect(completeEvent.data.sceneId).toBe('scene-1');

    expect(runTwoStagePipelineStreaming).toHaveBeenCalledOnce();
    expect(loadCampaignState).toHaveBeenCalledWith('test-campaign');
  });

  it('handles LLM timeout gracefully and emits error with LLM_TIMEOUT code', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    runTwoStagePipelineStreaming.mockRejectedValue(abortError);

    const events = [];
    const onEvent = (ev) => events.push(ev);

    await generateSceneStream('test-campaign', 'Idę dalej', {}, onEvent);

    const types = events.map((e) => e.type);
    expect(types).toContain('intent');
    expect(types).toContain('error');
    expect(types).not.toContain('complete');

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent.code).toBe('LLM_TIMEOUT');
    expect(errorEvent.error).toMatch(/timed out/i);
  });
});
