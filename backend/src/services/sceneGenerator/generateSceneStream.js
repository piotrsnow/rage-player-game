import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { assembleContext } from '../aiContextTools.js';
import { classifyIntent } from '../intentClassifier.js';
import { requireServerApiKey } from '../apiKeyService.js';

import {
  resolveBackendDiceRollWithPreRoll,
  generatePreRolls,
  CREATIVITY_BONUS_MAX,
} from '../diceResolver.js';
import { resolveAndApplyRewards } from '../rewardResolver.js';
import {
  applyCharacterStateChanges,
  characterToPrismaUpdate,
} from '../characterMutations.js';
import { loadCampaignState } from './campaignLoader.js';
import { tryTradeShortcut, tryCombatFastPath } from './shortcuts.js';
import { getInlineEntityKeys } from './inlineKeys.js';
import { buildLeanSystemPrompt } from './systemPrompt.js';
import { buildUserPrompt } from './userPrompt.js';
import { runTwoStagePipelineStreaming } from './streamingClient.js';
import {
  applyCreativityToRoll,
  isCreativityEligible,
  resolveModelDiceRolls,
  calculateFreeformSkillXP,
} from './diceResolution.js';
import { fillEnemiesFromBestiary } from './enemyFill.js';
import { handleDungeonEntry } from '../livingWorld/dungeonEntry.js';
import { reconcileCloneBatch } from '../livingWorld/cloneReconciliation.js';
import { enqueuePostSceneWork } from '../cloudTasks.js';
import { processStateChanges as processAchievementEvents } from '../../../../shared/domain/achievementTracker.js';
import { computeCombatCharXp } from '../../../../shared/domain/combatXp.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * Generate a scene with SSE streaming. Emits events via the onEvent callback.
 * Events: { type: 'intent', data }, { type: 'context_ready' },
 * { type: 'chunk', text }, { type: 'complete', data }, { type: 'error', error }
 */
export async function generateSceneStream(campaignId, playerAction, options = {}, onEvent) {
  const {
    provider = 'openai',
    model,
    language = 'pl',
    dmSettings = {},
    resolvedMechanics: resolvedMechanicsOpt = null,
    needsSystemEnabled = false,
    characterNeeds = null,
    isFirstScene = false,
    sceneCount = 0,
    isCustomAction = false,
    fromAutoPlayer = false,
    userApiKeys = null,
    combatResult = null,
    achievementState = null,
  } = options;
  let resolvedMechanics = resolvedMechanicsOpt;
  const creativityEligible = isCreativityEligible(playerAction, { isCustomAction, fromAutoPlayer });

  // LLM timeouts — bounds tail latency when a provider hangs. User-tunable via
  // DM Settings UI (llmPremiumTimeoutMs, llmNanoTimeoutMs). Defaults match a
  // typical scene gen (5-15s normal, 30s+ spike on Claude Sonnet with full
  // sceneGrid) plus a generous buffer. On timeout: premium emits LLM_TIMEOUT
  // SSE error; nano calls fall back silently (heuristic intent, skip summary).
  const llmPremiumTimeoutMs = Number(dmSettings?.llmPremiumTimeoutMs) || 45000;
  const llmNanoTimeoutMs = Number(dmSettings?.llmNanoTimeoutMs) || 15000;

  try {
    // 1. Load campaign data (DB → hydrated coreState)
    const {
      coreState,
      activeCharacter,
      activeCharacterId,
      dbNpcs,
      dbQuests,
      dbCodex,
      livingWorldEnabled,
    } = await loadCampaignState(campaignId);

    // 2. Intent classification. Fetch the most recent scene (narrative +
    // chosenAction + index) so the classifier sees continuity. Fast query —
    // same row will be reused by buildLeanSystemPrompt below, but we keep
    // the separate fetch here to avoid plumbing a shared ref through.
    const prevSceneRow = await prisma.campaignScene.findFirst({
      where: { campaignId },
      orderBy: { sceneIndex: 'desc' },
      select: { sceneIndex: true, narrative: true, chosenAction: true },
    });
    const intentResult = await classifyIntent(
      playerAction,
      coreState,
      { dbNpcs, dbQuests, dbCodex, prevScene: prevSceneRow || null },
      {
        isFirstScene,
        provider,
        timeoutMs: llmNanoTimeoutMs,
      },
    );
    onEvent({ type: 'intent', data: { intent: intentResult._intent || 'freeform' } });

    // 2a. Trade shortcut
    const trade = tryTradeShortcut(intentResult, coreState, dbNpcs);
    if (trade.handled) {
      onEvent({ type: 'complete', data: { scene: trade.result, sceneIndex: -1 } });
      return;
    }

    // 2a2. Combat fast-path
    const combat = await tryCombatFastPath(intentResult, playerAction, dbNpcs, provider, {
      campaignDifficultyTier: coreState.campaign?.difficultyTier || null,
    });
    if (combat.handled) {
      if (combat.intent) onEvent({ type: 'intent', data: { intent: combat.intent } });
      onEvent({ type: 'complete', data: { scene: combat.result, sceneIndex: -1 } });
      return;
    }

    // 2b. Pre-roll 3 dice sets + resolve nano-detected skill check
    const characterForRoll = { ...coreState.character, momentumBonus: coreState.momentumBonus || 0 };
    const preRolls = generatePreRolls(characterForRoll);
    let serverDiceRoll = null;

    if (!resolvedMechanics?.diceRoll && intentResult.roll_skill && !isFirstScene) {
      const testsFrequency = dmSettings?.testsFrequency ?? 50;
      if (Math.random() * 100 < testsFrequency) {
        serverDiceRoll = resolveBackendDiceRollWithPreRoll(
          characterForRoll,
          intentResult.roll_skill,
          intentResult.roll_difficulty || 'medium',
          preRolls[0].d50,
          preRolls[0].luckySuccess,
        );
        if (serverDiceRoll) {
          resolvedMechanics = { diceRoll: serverDiceRoll };
        }
      }
    }

    // 2c. Emit nano-resolved dice roll EARLY so the frontend can start the
    // animation in parallel with narrative streaming.
    if (resolvedMechanics?.diceRoll) {
      onEvent({ type: 'dice_early', data: { diceRoll: resolvedMechanics.diceRoll } });
    }

    // 2d. Clone reconciliation — catch divergence from other campaigns
    // before assembleContext surfaces the NPC roster. Best-effort; any
    // failure drops through with legacy clone state (non-blocking).
    if (livingWorldEnabled) {
      try {
        await reconcileCloneBatch({ campaignId });
      } catch (err) {
        log.warn({ err, campaignId }, 'reconcileCloneBatch failed (non-fatal)');
      }
    }

    // 3. Context assembly — skip entities already emitted inline in system prompt
    const currentLocation = coreState.world?.currentLocation || '';
    const inlineKeys = getInlineEntityKeys(coreState);
    const contextBlocks = await assembleContext(
      campaignId, intentResult, currentLocation, inlineKeys,
      { provider, timeoutMs: llmNanoTimeoutMs },
    );
    onEvent({ type: 'context_ready' });

    // 4. Build prompts
    // Only the immediate previous scene goes into the prompt in full. Earlier
    // scenes are represented by compressed gameStateSummary facts. Fetching 1
    // scene (not 5) because we also use lastScene.sceneIndex to compute the
    // next scene index below — the full narrative + action are injected by
    // buildLeanSystemPrompt and nothing else reads this list.
    const recentScenes = await prisma.campaignScene.findMany({
      where: { campaignId },
      orderBy: { sceneIndex: 'desc' },
      take: 1,
    });
    recentScenes.reverse();

    const systemPromptParts = buildLeanSystemPrompt(coreState, recentScenes, language, {
      dmSettings,
      needsSystemEnabled,
      characterNeeds,
      sceneCount,
      intentResult,
      livingWorldEnabled,
    });

    const userPrompt = buildUserPrompt(playerAction, {
      resolvedMechanics,
      isFirstScene,
      needsSystemEnabled,
      characterNeeds,
      language,
      sceneCount,
      preRolls,
      creativityEligible,
    });

    // 5. Streaming AI call
    const providerApiKey = requireServerApiKey(
      provider === 'anthropic' ? 'anthropic' : 'openai',
      userApiKeys,
      provider === 'anthropic' ? 'Anthropic' : 'OpenAI',
    );
    const premiumController = new AbortController();
    const premiumTimeoutHandle = setTimeout(() => premiumController.abort(), llmPremiumTimeoutMs);
    premiumTimeoutHandle.unref?.();
    let sceneResult;
    try {
      sceneResult = await runTwoStagePipelineStreaming(
        systemPromptParts, userPrompt, contextBlocks,
        { provider, model, apiKey: providerApiKey, signal: premiumController.signal },
        (text) => onEvent({ type: 'chunk', text }),
      );
    } finally {
      clearTimeout(premiumTimeoutHandle);
    }

    // 5b. Validate creativity bonus awarded by the model.
    // Anti-cheat: only hand-typed player actions get a bonus; suggestedActions /
    // autoplayer / system actions are forced to 0.
    const modelCreativityRaw = Number(sceneResult.creativityBonus) || 0;
    const effectiveCreativity = creativityEligible
      ? Math.max(0, Math.min(CREATIVITY_BONUS_MAX, Math.floor(modelCreativityRaw)))
      : 0;
    sceneResult.creativityBonus = effectiveCreativity;

    // 5c. Apply creativity to the nano roll (if any) post-hoc — the backend
    // already resolved that roll in step 2b before the model call.
    if (effectiveCreativity > 0 && resolvedMechanics?.diceRoll) {
      applyCreativityToRoll(resolvedMechanics.diceRoll, effectiveCreativity);
    }

    // 6a. Resolve model-initiated dice rolls (if any)
    resolveModelDiceRolls(sceneResult, characterForRoll, resolvedMechanics?.diceRoll ? preRolls.slice(1) : preRolls);

    // 6a2. Apply creativity also to self-resolved model rolls — all dice in
    // one scene share the same top-level creativity bonus.
    if (effectiveCreativity > 0 && Array.isArray(sceneResult.diceRolls)) {
      for (const roll of sceneResult.diceRolls) {
        applyCreativityToRoll(roll, effectiveCreativity);
      }
    }

    // 6b. Unify dice rolls: nano roll + model rolls → single diceRolls array.
    // Dedupe by skill name: if nano already resolved a skill, drop any model
    // roll on the same skill. Nano takes priority because it already fired
    // the dice_early animation on the frontend.
    const allDiceRolls = [];
    const usedSkills = new Set();
    const skillKey = (s) => (s ? String(s).toLowerCase().trim() : null);
    if (resolvedMechanics?.diceRoll) {
      allDiceRolls.push(resolvedMechanics.diceRoll);
      const k = skillKey(resolvedMechanics.diceRoll.skill);
      if (k) usedSkills.add(k);
    }
    if (sceneResult.diceRolls) {
      for (const r of sceneResult.diceRolls) {
        const k = skillKey(r?.skill);
        if (k && usedSkills.has(k)) {
          log.debug({ skill: r.skill }, 'Dropped duplicate model dice roll');
          continue;
        }
        if (k) usedSkills.add(k);
        allDiceRolls.push(r);
      }
    }
    sceneResult.diceRolls = allDiceRolls.length > 0 ? allDiceRolls : undefined;

    // 6c. Calculate deterministic skill XP from freeform actions
    const hasAnyDiceRoll = !!resolvedMechanics?.diceRoll || (sceneResult.diceRolls?.length > 0);
    calculateFreeformSkillXP(sceneResult.stateChanges, hasAnyDiceRoll, sceneResult.diceRolls);

    // 6. Fill enemy stats from bestiary (with G1 difficulty-tier cap)
    fillEnemiesFromBestiary(sceneResult.stateChanges, {
      campaignDifficultyTier: coreState.campaign?.difficultyTier || null,
    });

    // 7. Save scene
    const lastScene = recentScenes[recentScenes.length - 1];
    const newSceneIndex = lastScene ? lastScene.sceneIndex + 1 : 0;

    // 6d. Resolve abstract rewards into concrete items/materials/money
    resolveAndApplyRewards(sceneResult.stateChanges, { sceneCount: newSceneIndex });

    // 6d2. Dungeon entry hook — if premium emitted a currentLocation that
    // points to a top-level dungeon, seed it (idempotent) and redirect
    // currentLocation to the entrance room so FE + next scene see the
    // deterministic room, not the dungeon stub. Best-effort, non-blocking.
    if (livingWorldEnabled && sceneResult.stateChanges) {
      try {
        await handleDungeonEntry({
          stateChanges: sceneResult.stateChanges,
          prevLoc: coreState.world?.currentLocation || null,
        });
      } catch (err) {
        log.warn({ err: err?.message }, 'handleDungeonEntry failed (non-fatal)');
      }
    }

    // 6e. Merge combat result into stateChanges (if provided). Combat is resolved
    // deterministically on FE; BE is responsible for applying its XP + wounds.
    if (combatResult) {
      sceneResult.stateChanges = sceneResult.stateChanges || {};
      // Combat engine is the authoritative source for wounds. Overwrite any
      // model-emitted value — the model often mirrors the action text
      // ("Took 7 wounds") back as woundsChange, which would double-count.
      if (typeof combatResult.woundsChange === 'number') {
        sceneResult.stateChanges.woundsChange = combatResult.woundsChange;
      }
      if (combatResult.skillProgress && typeof combatResult.skillProgress === 'object') {
        sceneResult.stateChanges.skillProgress = {
          ...(sceneResult.stateChanges.skillProgress || {}),
        };
        for (const [skill, xp] of Object.entries(combatResult.skillProgress)) {
          sceneResult.stateChanges.skillProgress[skill] =
            (sceneResult.stateChanges.skillProgress[skill] || 0) + (xp || 0);
        }
      }
      const bonusXp = computeCombatCharXp(combatResult);
      if (bonusXp > 0) {
        sceneResult.stateChanges.xp = (sceneResult.stateChanges.xp || 0) + bonusXp;
      }
      // Derive combatVictory marker for achievement tracker (combat_victory / flawless_victory)
      if (combatResult.outcome === 'victory') {
        sceneResult.stateChanges.combatVictory = {
          enemiesDefeated: combatResult.enemiesDefeated || 0,
          damageTaken: combatResult.combatStats?.damageTaken || 0,
          flawless: combatResult.flawless === true,
        };
      }
    }

    const savedScene = await prisma.campaignScene.create({
      data: {
        campaignId,
        sceneIndex: newSceneIndex,
        narrative: sceneResult.narrative || '',
        chosenAction: playerAction,
        suggestedActions: JSON.stringify(sceneResult.suggestedActions || []),
        dialogueSegments: JSON.stringify(sceneResult.dialogueSegments || []),
        imagePrompt: sceneResult.imagePrompt || null,
        soundEffect: sceneResult.soundEffect || null,
        diceRoll: sceneResult.diceRolls ? JSON.stringify(sceneResult.diceRolls) : (sceneResult.diceRoll ? JSON.stringify(sceneResult.diceRoll) : null),
        stateChanges: sceneResult.stateChanges ? JSON.stringify(sceneResult.stateChanges) : null,
        scenePacing: sceneResult.scenePacing || 'exploration',
      },
    });

    // 8. Apply character state changes + persist
    let updatedCharacter = activeCharacter;
    let newlyUnlockedAchievements = [];
    let updatedAchievementState = achievementState;
    if (activeCharacterId && activeCharacter && sceneResult.stateChanges) {
      try {
        updatedCharacter = applyCharacterStateChanges(activeCharacter, sceneResult.stateChanges);

        // 8b. Process achievement unlocks — authoritative on BE.
        // Runs against the post-change character so wounds/skills/etc. reflect the scene.
        if (achievementState && typeof achievementState === 'object') {
          const gameStateForAchievements = {
            ...coreState,
            character: updatedCharacter,
            scenes: Array.from({ length: newSceneIndex + 1 }, () => ({})),
          };
          const achResult = processAchievementEvents(
            achievementState,
            sceneResult.stateChanges,
            gameStateForAchievements,
          );
          newlyUnlockedAchievements = achResult.newlyUnlocked || [];
          updatedAchievementState = achResult.updatedAchievementState;

          // Apply xpReward from newly unlocked achievements as additional char XP
          const totalAchievementXp = newlyUnlockedAchievements.reduce(
            (sum, a) => sum + (a.xpReward || 0),
            0,
          );
          if (totalAchievementXp > 0) {
            updatedCharacter = applyCharacterStateChanges(updatedCharacter, { xp: totalAchievementXp });
          }
        }

        await prisma.character.update({
          where: { id: activeCharacterId },
          data: characterToPrismaUpdate(updatedCharacter),
        });
      } catch (err) {
        log.error({ err, characterId: activeCharacterId }, 'Failed to persist character state changes');
      }
    }

    // 9. Enqueue post-scene work via Cloud Tasks (prod) or inline (dev).
    // Fire-and-forget: don't block the 'complete' event on enqueue failure.
    enqueuePostSceneWork({
      sceneId: savedScene.id,
      campaignId,
      playerAction,
      provider,
      newLoc: sceneResult.stateChanges?.currentLocation || null,
      prevLoc: coreState.world?.currentLocation || null,
      llmNanoTimeoutMs,
    }).catch((err) =>
      log.error({ err, sceneId: savedScene.id }, 'Failed to enqueue post-scene work')
    );

    // 10. Complete — emit immediately so frontend can render the scene
    onEvent({
      type: 'complete',
      data: {
        scene: sceneResult,
        sceneIndex: newSceneIndex,
        sceneId: savedScene.id,
        character: updatedCharacter,
        newlyUnlockedAchievements,
        updatedAchievementState,
      },
    });

  } catch (err) {
    const isAbort = err?.name === 'AbortError';
    onEvent({
      type: 'error',
      error: isAbort ? 'Scene generation timed out' : (err.message || 'Stream generation failed'),
      code: isAbort ? 'LLM_TIMEOUT' : (err.code || 'STREAM_ERROR'),
      ...(isAbort ? { phase: 'scene_generation' } : {}),
    });
  }
}
