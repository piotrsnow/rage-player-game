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
import { generateWrapupFallback, pickWrapupSpeaker } from '../questWrapupFallback.js';
import { applyCharacterStateChanges } from '../characterMutations.js';
import { persistCharacterSnapshot } from '../characterRelations.js';
import { loadCampaignState } from './campaignLoader.js';
import { tryTradeShortcut, tryCombatFastPath } from './shortcuts.js';
import { getInlineEntityKeys } from './inlineKeys.js';
import { buildLeanSystemPrompt } from './systemPrompt.js';
import { buildUserPrompt } from './userPrompt.js';
import { runTwoStagePipelineStreaming } from './streamingClient.js';
import {
  applyCreativityToRoll,
  applyForceRollModifier,
  isCreativityEligible,
  resolveModelDiceRolls,
  calculateFreeformSkillXP,
} from './diceResolution.js';
import { fillEnemiesFromBestiary } from './enemyFill.js';
import { handleDungeonEntry } from '../livingWorld/dungeonEntry.js';
import { reconcileCloneBatch } from '../livingWorld/cloneReconciliation.js';
import { pickQuestGiver } from '../livingWorld/questGoalAssigner.js';
import { enqueuePostSceneWork } from '../cloudTasks.js';
import { processStateChanges as processAchievementEvents } from '../../../../shared/domain/achievementTracker.js';
import { computeCombatCharXp } from '../../../../shared/domain/combatXp.js';
import {
  mentionsYassato,
  isYassatoCameoOnCooldown,
  generateYassatoCameoScene,
} from './yassatoCameo.js';

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
    forceRoll = null,
    achievementState = null,
    userId = null,
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
      currentRef,
    } = await loadCampaignState(campaignId);
    let activeCurrentRef = currentRef;

    // 1b. Yassato cameo short-circuit. If the player mentions "Yassato" and
    // the 5-scene cooldown has elapsed, replace the whole pipeline with a
    // nano-generated absurd cameo scene that hands over +1 XP and a snarky
    // line. Never runs on the synthetic [FIRST_SCENE] action (regex misses).
    if (mentionsYassato(playerAction) && !(await isYassatoCameoOnCooldown(campaignId))) {
      await runYassatoCameoPath({
        campaignId,
        playerAction,
        activeCharacter,
        activeCharacterId,
        achievementState,
        provider,
        userApiKeys,
        llmNanoTimeoutMs,
        onEvent,
      });
      return;
    }

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
    onEvent({ type: 'intent', data: {
      intent: intentResult._intent || 'freeform',
      ...(intentResult._travelTarget ? { travelTarget: intentResult._travelTarget } : {}),
    } });

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

    // Snapshot scene-start currentLocation. postSceneWork compares newLoc vs
    // prevLoc to fire location-summary nano + edge discovery hooks. The AI's
    // `stateChanges.currentLocation` (handled by `processCurrentLocationChange`
    // post-scene) updates the DB row; we read back from `activeCurrentRef`
    // after persistence to compute `newLoc`.
    const preResolveLocationName = coreState.world?.currentLocation || null;

    // 2b. Pre-roll 3 dice sets + resolve nano-detected skill check
    const characterForRoll = { ...coreState.character, momentumBonus: coreState.momentumBonus || 0 };
    const preRolls = generatePreRolls(characterForRoll);
    let serverDiceRoll = null;

    if (!resolvedMechanics?.diceRoll && intentResult.roll_skill && !isFirstScene) {
      // ForceRoll bypasses the testsFrequency RNG gate — the player
      // explicitly asked for a roll this turn, so fire every time nano
      // picked a skill.
      const testsFrequency = dmSettings?.testsFrequency ?? 50;
      const forceRollActive = forceRoll?.enabled === true;
      if (forceRollActive || Math.random() * 100 < testsFrequency) {
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

    // 2b2. Apply force-roll modifier to the nano-resolved roll BEFORE
    // emitting dice_early so the FE animation shows the final number the
    // player will see in the log.
    if (forceRoll?.enabled && forceRoll.modifier && resolvedMechanics?.diceRoll) {
      applyForceRollModifier(resolvedMechanics.diceRoll, forceRoll.modifier);
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
      { provider, timeoutMs: llmNanoTimeoutMs, playerAction },
    );
    onEvent({ type: 'context_ready' });

    // 3b. Phase D — if nano flagged a quest offer AND the world is getting
    // saturated (Phase C budget < 0.5), suggest a concrete quest-giver so
    // premium reuses an existing NPC instead of inventing a new one. When
    // the budget is comfortable OR nano saw no offer cue, skip the lookup.
    let questGiverHint = null;
    if (livingWorldEnabled && intentResult.quest_offer_likely) {
      const sat = contextBlocks.livingWorld?.saturation;
      const budgetsTight =
        (typeof sat?.settlementBudget === 'number' && sat.settlementBudget < 0.5)
        || (typeof sat?.npcBudget === 'number' && sat.npcBudget < 0.5);
      if (budgetsTight) {
        try {
          questGiverHint = await pickQuestGiver(campaignId, currentLocation);
        } catch (err) {
          log.warn({ err: err?.message, campaignId }, 'pickQuestGiver failed (non-fatal)');
        }
      }
    }

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
      questGiverHint,
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
      forceRoll,
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
    // already resolved that roll in step 2b before the model call. The user
    // prompt told the model to expect this post-hoc bump, so narration should
    // be consistent with the final margin.
    if (effectiveCreativity > 0 && resolvedMechanics?.diceRoll) {
      applyCreativityToRoll(resolvedMechanics.diceRoll, effectiveCreativity);
    }

    // 6a. Resolve model-initiated dice rolls (if any). Creativity is baked in
    // at resolution time so the AI's success/fail decision and backend's
    // re-computation use the same formula.
    resolveModelDiceRolls(
      sceneResult,
      characterForRoll,
      resolvedMechanics?.diceRoll ? preRolls.slice(1) : preRolls,
      effectiveCreativity,
    );

    // 6a2. Apply force-roll modifier to any model-produced rolls too. The nano
    // roll was bumped earlier (pre dice_early); model rolls fire post-hoc so
    // their totals get updated here.
    if (forceRoll?.enabled && forceRoll.modifier && Array.isArray(sceneResult.diceRolls)) {
      for (const roll of sceneResult.diceRolls) {
        applyForceRollModifier(roll, forceRoll.modifier);
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
    resolveAndApplyRewards(sceneResult.stateChanges, {
      sceneCount: newSceneIndex,
      difficultyTier: coreState.campaign?.difficultyTier || 'medium',
    });

    // 6d2. Dungeon entry hook — if travel resolver landed on a top-level
    // dungeon (canonical), seed it (idempotent) and redirect currentLocation
    // to the entrance room so FE + next scene see the deterministic room,
    // not the dungeon stub. Best-effort, non-blocking. Updates Campaign DB
    // + activeCurrentRef in place so downstream `postResolveLoc` reflects
    // the entrance room.
    if (livingWorldEnabled && activeCurrentRef) {
      try {
        const redirected = await handleDungeonEntry({
          campaignId,
          currentRef: activeCurrentRef,
          prevLoc: preResolveLocationName,
        });
        if (redirected) {
          activeCurrentRef = redirected;
          if (!coreState.world) coreState.world = {};
          coreState.world.currentLocation = redirected.name;
          coreState.world.currentLocationType = 'dungeon_room';
        }
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

    // 6e2. "Kalejdoskop" cheat — if the player's action contains the stem
    // "kalejdoskop" (case-insensitive, any inflection), award +50 XP for each
    // "!" in the action. Purely additive on top of whatever XP the scene
    // already granted. No narrative — the standard "+X PD" toast surfaces it.
    if (typeof playerAction === 'string' && /bosko/i.test(playerAction)) {
      const exclamations = (playerAction.match(/!/g) || []).length;
      if (exclamations > 0) {
        sceneResult.stateChanges = sceneResult.stateChanges || {};
        sceneResult.stateChanges.xp = (sceneResult.stateChanges.xp || 0) + 50 * exclamations;
      }
    }

    // 6f. Quest wrap-up fallback — if premium emitted completedQuests or a
    // completed objective update but forgot dialogueIfQuestTargetCompleted,
    // synthesise one via nano so the player always gets a narrative beat
    // between objectives. Guards against the root complaint: "next goal
    // appeared in the log with zero narrative setup."
    try {
      await ensureQuestWrapup(sceneResult, {
        coreState,
        dbQuests,
        dbNpcs,
        language,
        provider,
        userApiKeys,
        llmNanoTimeoutMs,
      });
    } catch (err) {
      log.warn({ err: err?.message }, 'quest wrap-up fallback failed (non-fatal)');
    }

    // 8. Apply character state changes + achievements (pure), then persist
    // scene + character in one tx so a half-saved scene can never reference
    // a character row that doesn't reflect its stateChanges.
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
      } catch (err) {
        log.error({ err, characterId: activeCharacterId }, 'Failed to compute character state changes');
      }
    }

    const sceneCreateData = {
      campaignId,
      sceneIndex: newSceneIndex,
      narrative: sceneResult.narrative || '',
      chosenAction: playerAction,
      suggestedActions: sceneResult.suggestedActions || [],
      dialogueSegments: sceneResult.dialogueSegments || [],
      imagePrompt: sceneResult.imagePrompt || null,
      soundEffect: sceneResult.soundEffect || null,
      diceRoll: sceneResult.diceRolls ?? sceneResult.diceRoll ?? null,
      stateChanges: sceneResult.stateChanges ?? null,
      scenePacing: sceneResult.scenePacing || 'exploration',
    };

    // Scene + character must commit together. Function-form $transaction so
    // persistCharacterSnapshot can fan out to the F4 child tables inside the
    // same tx as the scene insert.
    const persistChar = activeCharacterId && updatedCharacter && updatedCharacter !== activeCharacter;
    const savedScene = await prisma.$transaction(async (tx) => {
      const scene = await tx.campaignScene.create({ data: sceneCreateData });
      if (persistChar) {
        await persistCharacterSnapshot(activeCharacterId, updatedCharacter, tx);
      }
      return scene;
    });

    // 9. Enqueue post-scene work via Cloud Tasks (prod) or inline (dev).
    // Fire-and-forget: don't block the 'complete' event on enqueue failure.
    //
    // `wrapupText` carries `dialogueIfQuestTargetCompleted` into the fact
    // extractor so the teaser ("Mireia promised to tell you about Jaskinia
    // Szeptów") lands in gameStateSummary and survives into the next scene's
    // prompt. CampaignScene schema doesn't persist the wrap-up separately,
    // so without this the continuity signal dies after the 'complete' event.
    // Post-(round-no-AI-locations): `newLoc` is no longer derived from AI's
    // `stateChanges.currentLocation` — travel resolver already wrote it. We
    // pass the post-resolve currentLocation NAME so postSceneWork can detect
    // movement (newLoc !== prevLoc) and trigger location-summary nano + edge
    // discovery hooks. `prevLoc` is the scene-start name (pre-resolve).
    const postResolveLoc = activeCurrentRef?.name || coreState.world?.currentLocation || null;
    enqueuePostSceneWork({
      sceneId: savedScene.id,
      campaignId,
      playerAction,
      provider,
      newLoc: postResolveLoc,
      prevLoc: preResolveLocationName,
      wrapupText: sceneResult.dialogueIfQuestTargetCompleted?.text || null,
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

/**
 * If premium completed an objective/quest but left dialogueIfQuestTargetCompleted
 * null, call nano to fill it so the player always gets a short narrative beat
 * before the next objective lands in their log.
 */
async function ensureQuestWrapup(sceneResult, { coreState, dbQuests, dbNpcs, language, provider, userApiKeys, llmNanoTimeoutMs }) {
  if (!sceneResult || sceneResult.dialogueIfQuestTargetCompleted?.text) return;
  const sc = sceneResult.stateChanges || {};
  const completedQuestIds = Array.isArray(sc.completedQuests) ? sc.completedQuests : [];
  const completedObjUpdates = (Array.isArray(sc.questUpdates) ? sc.questUpdates : [])
    .filter((u) => u && u.completed === true);
  if (completedQuestIds.length === 0 && completedObjUpdates.length === 0) return;

  // Identify the quest + objectives that resolved this scene.
  const activeQuests = coreState?.quests?.active || [];
  let completedObjective = null;
  let nextObjective = null;
  let questGiverId = null;

  // dbQuests rows after F4 carry `objectives` as a child-table relation
  // (rows shaped {description, status, progress, targetAmount, ...}). FE-shape
  // active quests use {description, completed, ...}. normalizeObjective folds
  // both into the FE shape so downstream lookups stay uniform.
  const normalizeObjective = (o) => o && ({
    ...o,
    completed: o.completed === true || o.status === 'done',
    id: o.id ?? o.description,
  });

  if (completedObjUpdates.length > 0) {
    const upd = completedObjUpdates[0];
    const quest = activeQuests.find((q) => q.id === upd.questId)
      || (Array.isArray(dbQuests) ? dbQuests.find((q) => q.questId === upd.questId) : null);
    const objectives = (Array.isArray(quest?.objectives) ? quest.objectives : []).map(normalizeObjective);
    const raw = upd.objectiveId == null ? '' : String(upd.objectiveId).trim();
    if (raw && /^\d+$/.test(raw)) {
      const idx = Number(raw);
      if (idx >= 0 && idx < objectives.length) completedObjective = objectives[idx];
    }
    if (!completedObjective) {
      const matchKey = raw.toLowerCase();
      completedObjective = objectives.find((o) =>
        o && (o.id === upd.objectiveId
          || (matchKey && (o.description || '').toLowerCase() === matchKey)));
    }
    if (!completedObjective) {
      completedObjective = { id: upd.objectiveId, description: upd.objectiveId };
    }
    nextObjective = objectives.find((o) => o && !o.completed && o.id !== completedObjective.id) || null;
    questGiverId = quest?.questGiverId || null;
  } else if (completedQuestIds.length > 0) {
    const id = completedQuestIds[0];
    const quest = activeQuests.find((q) => q.id === id)
      || (Array.isArray(dbQuests) ? dbQuests.find((q) => q.questId === id) : null);
    const objectives = (Array.isArray(quest?.objectives) ? quest.objectives : []).map(normalizeObjective);
    completedObjective = objectives[objectives.length - 1] || { description: quest?.name || id };
    nextObjective = null;
    questGiverId = quest?.questGiverId || null;
  }
  if (!completedObjective) return;

  const speaker = pickWrapupSpeaker({
    questGiverId,
    sceneNpcs: coreState?.world?.npcs || dbNpcs || [],
    companions: coreState?.character?.companions || [],
  });

  const wrapup = await generateWrapupFallback({
    completedObjective,
    nextObjective,
    speaker,
    narratorStyle: coreState?.campaign?.narratorStyle || null,
    language,
    provider,
    userApiKeys,
    timeoutMs: Math.min(llmNanoTimeoutMs || 3000, 5000),
  });

  if (wrapup) {
    sceneResult.dialogueIfQuestTargetCompleted = wrapup;
  }
}

/**
 * Yassato cameo short-circuit handler. Generates an absurd cameo scene via
 * nano (with deterministic fallback), applies +1 character XP, persists the
 * scene + character, and emits the standard SSE event flow. Skips
 * classifyIntent, context assembly, premium model, achievement processing,
 * and postSceneWork — cameo is pure flavor, not a tracked event.
 */
async function runYassatoCameoPath({
  campaignId,
  playerAction,
  activeCharacter,
  activeCharacterId,
  achievementState,
  provider,
  userApiKeys,
  llmNanoTimeoutMs,
  onEvent,
}) {
  onEvent({ type: 'intent', data: { intent: 'yassato_cameo' } });
  onEvent({ type: 'context_ready' });

  const sceneResult = await generateYassatoCameoScene({
    playerAction,
    currentCharacterXp: activeCharacter?.characterXp || 0,
    provider,
    userApiKeys,
    llmNanoTimeoutMs,
  });

  // Emit the full scene as one JSON chunk so the FE's partial-JSON parser
  // can populate the typewriter / streaming segments briefly before 'complete'
  // lands. Cameo is ~1s total so streaming isn't a UX win, but this keeps
  // the flow uniform with the normal pipeline.
  onEvent({ type: 'chunk', text: JSON.stringify(sceneResult) });

  const lastScene = await prisma.campaignScene.findFirst({
    where: { campaignId },
    orderBy: { sceneIndex: 'desc' },
    select: { sceneIndex: true },
  });
  const newSceneIndex = lastScene ? lastScene.sceneIndex + 1 : 0;

  let updatedCharacter = activeCharacter;
  if (activeCharacterId && activeCharacter) {
    try {
      updatedCharacter = applyCharacterStateChanges(activeCharacter, sceneResult.stateChanges);
    } catch (err) {
      log.error({ err, characterId: activeCharacterId }, 'yassato cameo: failed to apply state changes');
    }
  }

  const sceneCreateData = {
    campaignId,
    sceneIndex: newSceneIndex,
    narrative: sceneResult.narrative || '',
    chosenAction: playerAction,
    suggestedActions: sceneResult.suggestedActions || [],
    dialogueSegments: sceneResult.dialogueSegments || [],
    imagePrompt: sceneResult.imagePrompt || null,
    soundEffect: sceneResult.soundEffect || null,
    diceRoll: null,
    stateChanges: sceneResult.stateChanges ?? null,
    scenePacing: sceneResult.scenePacing || 'cutscene',
  };

  const persistChar = activeCharacterId && updatedCharacter && updatedCharacter !== activeCharacter;
  const savedScene = await prisma.$transaction(async (tx) => {
    const scene = await tx.campaignScene.create({ data: sceneCreateData });
    if (persistChar) {
      await persistCharacterSnapshot(activeCharacterId, updatedCharacter, tx);
    }
    return scene;
  });

  onEvent({
    type: 'complete',
    data: {
      scene: sceneResult,
      sceneIndex: newSceneIndex,
      sceneId: savedScene.id,
      character: updatedCharacter,
      newlyUnlockedAchievements: [],
      updatedAchievementState: achievementState,
    },
  });
}
