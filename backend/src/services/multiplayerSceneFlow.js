/**
 * Multiplayer scene-generation pipeline — mirrors the SP pipeline
 * (generateSceneStream.js) step-by-step, reusing the same sub-functions
 * (shared prompts, shared AI client, intent classification, context assembly,
 * processStateChanges, postSceneWork, feature parity helpers).
 *
 * Phase 1: Shared prompts (buildLeanSystemPrompt, buildMultiplayerUserPrompt)
 * Phase 2: Shared AI client (runTwoStagePipelineStreaming) + dice_early WS
 * Phase 3: classifyIntent + assembleContext
 * Phase 4: processStateChanges + enqueuePostSceneWork
 * Phase 5: Feature parity (trade shortcut, combat fast-path, bestiary fill,
 *          rewards, rest recovery, creativity, location sanity, achievements,
 *          quest wrapup)
 * Phase 6: Quick beats deferred (solo-only V1)
 */

import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import {
  broadcast,
  getRoom,
  saveRoomToDB,
  sanitizeRoom,
  setGameState,
} from './roomManager.js';
import { needsCompression, compressOldScenes } from './multiplayerAI.js';
import { hourToPeriod, decayNeeds } from './timeUtils.js';
import { validateMultiplayerStateChanges } from './stateValidator.js';
import { applyMultiplayerSceneStateChanges } from '../../../shared/domain/multiplayerState.js';
import {
  loadCharacterSnapshot,
  persistCharacterSnapshot,
} from './characterRelations.js';
import { normalizeMultiplayerStateChanges } from '../../../shared/contracts/multiplayer.js';
import { generateStateChangeMessages } from './stateChangeMessages.js';

// Phase 1 — Shared prompt builders
import { buildLeanSystemPrompt } from './sceneGenerator/systemPrompt.js';
import { buildMultiplayerUserPrompt } from './sceneGenerator/userPrompt.js';

// Phase 2 — Shared AI client
import { runTwoStagePipelineStreaming } from './sceneGenerator/streamingClient.js';
import { requireServerApiKey, loadUserApiKeys } from './apiKeyService.js';
import { resolveModelForTask } from './serverConfig.js';

// Phase 3 — Intent + context
import { classifyIntent } from './intentClassifier.js';
import { assembleContext } from './aiContextTools.js';
import { getInlineEntityKeys } from './sceneGenerator/inlineKeys.js';

// Phase 4 — processStateChanges + postSceneWork
import { processStateChanges } from './sceneGenerator/processStateChanges.js';
import { enqueuePostSceneWork } from './cloudTasks.js';

// Phase 5 — Feature parity
import { tryTradeShortcut, tryCombatFastPath } from './sceneGenerator/shortcuts.js';
import { fillEnemiesFromBestiary } from './sceneGenerator/enemyFill.js';
import { resolveAndApplyRewards } from './rewardResolver.js';
import { detectSuspiciousLocationChange } from './sceneGenerator/locationSanityCheck.js';
import { repairSceneDialogue } from './sceneGenerator/dialogueRepairPipeline.js';
import { injectCombatFallback } from './sceneGenerator/combatFallback.js';
import { getScaleForTier } from './difficultyScalingConfig.js';
import { reconcileCloneBatch } from './livingWorld/cloneReconciliation.js';
import { detectMagicExposure } from './sceneGenerator/magicExposure.js';
import { calculateFreeformSkillXP } from './sceneGenerator/diceResolution.js';
import { pickQuestGiver } from './livingWorld/questGoalAssigner.js';
import { loadCampaignState } from './sceneGenerator/campaignLoader.js';

// Shared helpers
import { repairDialogueSegments, ensurePlayerDialogue } from '../../../shared/domain/dialogueRepair.js';
import { ensureSuggestedActions } from '../../../shared/domain/fallbackActions.js';
import { normalizeDiceRoll, recalcDiceRoll, rollD50 } from './multiplayerAI/diceNormalization.js';

const log = childLogger({ module: 'multiplayer' });

export function calcNextMomentum(sl, current) {
  const newVal = sl * 5;
  let next;
  if (sl === 0) {
    next = current > 0 ? Math.max(0, current - 5) : current < 0 ? Math.min(0, current + 5) : 0;
  } else if (sl > 0) {
    next = current < 0 ? newVal : (newVal > current ? newVal : Math.max(0, current - 5));
  } else {
    next = current > 0 ? newVal : (newVal < current ? newVal : Math.min(0, current + 5));
  }
  return Math.max(-30, Math.min(30, next));
}

export function computeNewMomentum(scene, prevMomentum, soloActionName = null) {
  const next = { ...prevMomentum };
  if (scene?.diceRolls?.length) {
    for (const dr of scene.diceRolls) {
      if (dr.character && dr.sl != null) {
        next[dr.character] = calcNextMomentum(dr.sl, prevMomentum[dr.character] || 0);
      }
    }
  } else if (soloActionName && scene?.diceRoll?.sl != null) {
    next[soloActionName] = calcNextMomentum(scene.diceRoll.sl, prevMomentum[soloActionName] || 0);
  }
  return next;
}

export function applySceneStateChanges(gameState, sceneResult, settings) {
  return applyMultiplayerSceneStateChanges(gameState, sceneResult, {
    needsEnabled: settings?.needsSystemEnabled === true,
    periodResolver: hourToPeriod,
    decayNeeds,
  });
}

export async function persistMultiplayerCharactersToDB(room, mutatedCharacters) {
  if (!room || !Array.isArray(mutatedCharacters) || mutatedCharacters.length === 0) return;

  const updates = [];
  for (const character of mutatedCharacters) {
    if (!character || !character.odId) continue;
    const player = room.players.get(character.odId);
    if (!player?.characterId) continue;
    updates.push(
      persistCharacterSnapshot(player.characterId, character).catch((err) => {
        log.warn({ err, characterId: player.characterId }, 'Failed to persist character');
      }),
    );
  }
  await Promise.all(updates);
}

export async function fetchOwnedCharacter(characterId, userId) {
  if (!characterId) return null;
  return loadCharacterSnapshot({ id: characterId, userId });
}

async function persistSceneToDb(campaignId, sceneResult, actions, gameState) {
  const sceneIndex = (gameState.scenes || []).length - 1;
  const playerAction = actions.map((a) => `${a.name}: ${a.action}`).join('\n');
  const scene = sceneResult.scene || {};
  return prisma.campaignScene.create({
    data: {
      campaignId,
      sceneIndex,
      narrative: scene.narrative || '',
      chosenAction: playerAction,
      suggestedActions: scene.suggestedActions || [],
      dialogueSegments: scene.dialogueSegments || [],
      imagePrompt: scene.imagePrompt || null,
      soundEffect: scene.soundEffect || null,
      diceRoll: scene.diceRolls ?? scene.diceRoll ?? null,
      stateChanges: sceneResult.stateChanges ?? null,
      scenePacing: scene.scenePacing || 'exploration',
    },
  });
}

export function buildArrivalNarrative(playerName, language = 'en') {
  if (typeof language === 'string' && language.toLowerCase().startsWith('pl')) {
    return `${playerName} dołącza do drużyny i zajmuje miejsce przy ognisku, gotów ruszyć dalej.`;
  }
  return `${playerName} joins the party and takes a place by the campfire, ready for the journey ahead.`;
}

/**
 * Shared scene-generation pipeline for MP. Follows the same steps as the SP
 * generateSceneStream, adapted for multiple characters and WebSocket transport.
 */
export async function runMultiplayerSceneFlow({
  fastify,
  room,
  roomCode,
  actions,
  msg,
  soloActionName = null,
}) {
  const players = [];
  for (const [, p] of room.players) {
    players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
  }

  const prevMomentum = room.gameState.characterMomentum || {};
  const language = msg.language || 'en';
  const dmSettings = msg.dmSettings || null;
  const provider = 'openai';

  const llmPremiumTimeoutMs = Number(dmSettings?.llmPremiumTimeoutMs) || 45000;
  const llmNanoTimeoutMs = Number(dmSettings?.llmNanoTimeoutMs) || 15000;

  // ─── Phase 2: Resolve API key + model ───
  const hostPlayer = [...room.players.values()].find(p => p.isHost);
  let userApiKeys = null;
  if (hostPlayer?.userId) {
    try {
      userApiKeys = await loadUserApiKeys(prisma, hostPlayer.userId);
    } catch { /* use server keys */ }
  }
  const providerApiKey = requireServerApiKey(
    provider === 'anthropic' ? 'anthropic' : 'openai',
    userApiKeys,
    provider === 'anthropic' ? 'Anthropic' : 'OpenAI',
  );
  const effectiveModel = await resolveModelForTask('multiplayerScene', provider) || null;

  // ─── Phase 3: Load campaign state from DB when available ───
  let coreState = null;
  let dbNpcs = [];
  let dbQuests = [];
  let dbCodex = [];
  let livingWorldEnabled = false;
  let questGraphEnabled = false;
  let currentRef = null;
  let sceneCount = (room.gameState.scenes || []).length;

  if (room.campaignId) {
    try {
      const loaded = await loadCampaignState(room.campaignId);
      coreState = loaded.coreState;
      dbNpcs = loaded.dbNpcs || [];
      dbQuests = loaded.dbQuests || [];
      dbCodex = loaded.dbCodex || [];
      livingWorldEnabled = loaded.livingWorldEnabled;
      questGraphEnabled = loaded.questGraphEnabled;
      currentRef = loaded.currentRef;

      // Merge MP-specific game state into coreState
      if (!coreState.world) coreState.world = {};
      coreState.world.currentLocation = coreState.world.currentLocation || room.gameState?.world?.currentLocation;
      coreState.campaign = coreState.campaign || room.gameState?.campaign || {};
      coreState.quests = coreState.quests || room.gameState?.quests || {};
    } catch (err) {
      log.warn({ err: err?.message }, 'loadCampaignState for MP failed (non-fatal, falling back to room state)');
    }
  }

  // Fallback to room.gameState-derived coreState when DB load failed or no campaign
  if (!coreState) {
    coreState = {
      campaign: room.gameState.campaign || {},
      world: room.gameState.world || {},
      quests: room.gameState.quests || {},
      character: room.gameState.characters?.[0] || {},
    };
  }
  // Inject all characters into coreState for MP prompt
  const characters = room.gameState.characters || [];

  // ─── Phase 3: Intent classification ───
  const combinedAction = actions.map(a => `${a.name}: ${a.action}`).join('\n');
  const prevSceneRow = room.campaignId
    ? await prisma.campaignScene.findFirst({
        where: { campaignId: room.campaignId },
        orderBy: { sceneIndex: 'desc' },
        select: { sceneIndex: true, narrative: true, chosenAction: true },
      }).catch(() => null)
    : null;

  let intentResult = {};
  try {
    intentResult = await classifyIntent(
      combinedAction,
      coreState,
      { dbNpcs, dbQuests, dbCodex, prevScene: prevSceneRow },
      { isFirstScene: sceneCount === 0, provider, timeoutMs: llmNanoTimeoutMs },
    );
  } catch (err) {
    log.warn({ err: err?.message }, 'MP classifyIntent failed (non-fatal)');
  }

  // Emit intent via WS
  broadcast(room, {
    type: 'SCENE_INTENT',
    intent: intentResult._intent || 'freeform',
    ...(intentResult._travelTarget ? { travelTarget: intentResult._travelTarget } : {}),
  });

  // ─── Phase 5: Trade shortcut ───
  if (intentResult._tradeOnly) {
    const trade = tryTradeShortcut(intentResult, coreState, dbNpcs);
    if (trade.handled) {
      broadcast(room, {
        type: 'SCENE_UPDATE',
        scene: trade.result,
        chatMessages: [],
        stateChanges: trade.result.stateChanges,
        room: sanitizeRoom(room),
      });
      return { sceneResult: trade.result, updatedRoom: room };
    }
  }

  // ─── Phase 5: Combat fast-path ───
  const tierScale = await getScaleForTier(coreState.campaign?.difficultyTier || 'low');
  if (intentResult.clear_combat && intentResult.combat_enemies) {
    const combat = await tryCombatFastPath(intentResult, combinedAction, dbNpcs, provider, {
      campaignDifficultyTier: coreState.campaign?.difficultyTier || null,
      tierScale,
    });
    if (combat.handled) {
      broadcast(room, {
        type: 'SCENE_UPDATE',
        scene: combat.result,
        chatMessages: [],
        stateChanges: combat.result.stateChanges,
        room: sanitizeRoom(room),
      });
      return { sceneResult: combat.result, updatedRoom: room };
    }
  }

  // ─── Phase 5: Clone reconciliation ───
  if (livingWorldEnabled && room.campaignId) {
    try {
      await reconcileCloneBatch({ campaignId: room.campaignId, emitRevealEvent: () => {} });
    } catch (err) {
      log.warn({ err: err?.message }, 'MP reconcileCloneBatch failed (non-fatal)');
    }
  }

  // ─── Phase 3: Context assembly ───
  const currentLocation = coreState.world?.currentLocation || '';
  const inlineKeys = getInlineEntityKeys(coreState);
  let contextBlocks = {};
  if (room.campaignId) {
    try {
      contextBlocks = await assembleContext(
        room.campaignId, intentResult, currentLocation, inlineKeys,
        { provider, timeoutMs: llmNanoTimeoutMs, playerAction: combinedAction, currentRef },
      );
    } catch (err) {
      log.warn({ err: err?.message }, 'MP assembleContext failed (non-fatal)');
    }
  }

  // Phase D — quest giver hint
  let questGiverHint = null;
  if (livingWorldEnabled && intentResult.quest_offer_likely) {
    const sat = contextBlocks.livingWorld?.saturation;
    const budgetsTight =
      (typeof sat?.settlementBudget === 'number' && sat.settlementBudget < 0.5)
      || (typeof sat?.npcBudget === 'number' && sat.npcBudget < 0.5);
    if (budgetsTight) {
      try {
        questGiverHint = await pickQuestGiver(room.campaignId, currentLocation);
      } catch { /* non-fatal */ }
    }
  }

  // ─── Phase 1: Build prompts using shared builders ───
  const recentScenes = room.campaignId
    ? await prisma.campaignScene.findMany({
        where: { campaignId: room.campaignId },
        orderBy: { sceneIndex: 'desc' },
        take: 5,
      }).then(rows => { rows.reverse(); return rows; }).catch(() => [])
    : [];

  const magicExposure = detectMagicExposure(recentScenes, characters[0] || {});

  const systemPromptParts = buildLeanSystemPrompt(coreState, recentScenes, language, {
    dmSettings: dmSettings || {},
    sceneCount,
    intentResult,
    livingWorldEnabled,
    questGraphEnabled,
    questGiverHint,
    magicExposure,
    playerAction: combinedAction,
    provider,
    isMultiplayer: true,
    players,
    characters,
  });

  // Pre-rolled dice per character
  const testsFrequency = dmSettings?.testsFrequency ?? 50;
  const preRolledDice = {};
  const skipDiceRolls = {};
  for (const a of actions) {
    if (a.action === '[WAIT]') {
      skipDiceRolls[a.name] = true;
    } else if (Math.random() * 100 < testsFrequency) {
      preRolledDice[a.name] = rollD50();
    } else {
      skipDiceRolls[a.name] = true;
    }
  }

  // Emit dice_early for pre-rolled values (Phase 2)
  if (Object.keys(preRolledDice).length > 0) {
    broadcast(room, {
      type: 'DICE_EARLY',
      preRolledDice,
    });
  }

  const userPrompt = buildMultiplayerUserPrompt(actions, {
    isFirstScene: sceneCount === 0,
    language,
    preRolledDice,
    skipDiceRolls,
    characterMomentum: prevMomentum,
    dmSettings,
    needsSystemEnabled: room.settings?.needsSystemEnabled === true,
    characters,
  });

  // ─── Phase 2: Streaming AI call via shared client ───
  let chunkAccumulated = '';
  let lastBroadcastLen = 0;
  const CHUNK_MIN_CHARS = 60;

  const premiumController = new AbortController();
  const premiumTimeoutHandle = setTimeout(() => premiumController.abort(), llmPremiumTimeoutMs);
  premiumTimeoutHandle.unref?.();

  let sceneResult;
  try {
    sceneResult = await runTwoStagePipelineStreaming(
      systemPromptParts, userPrompt, contextBlocks,
      { provider, model: effectiveModel, apiKey: providerApiKey, signal: premiumController.signal },
      (text) => {
        chunkAccumulated += text;
        if (chunkAccumulated.length - lastBroadcastLen >= CHUNK_MIN_CHARS) {
          const delta = chunkAccumulated.slice(lastBroadcastLen);
          lastBroadcastLen = chunkAccumulated.length;
          broadcast(room, { type: 'SCENE_CHUNK', text: delta });
        }
      },
    );
  } finally {
    clearTimeout(premiumTimeoutHandle);
  }

  // ─── Phase 5: Location sanity check ───
  const preResolveLocationName = coreState.world?.currentLocation || null;
  const trail = recentScenes.map(s => ({
    idx: s.sceneIndex,
    loc: s.stateChanges?._locationSnapshot?.name || null,
  }));
  const sanity = detectSuspiciousLocationChange({
    playerAction: combinedAction,
    sceneResult,
    prevLocName: preResolveLocationName,
    recentTrail: trail,
    intentResult,
  });
  if (sanity.score >= 3 && sceneResult?.stateChanges) {
    log.warn({ score: sanity.score, signals: sanity.signals }, 'MP location sanity strip');
    delete sceneResult.stateChanges.currentLocation;
    delete sceneResult.stateChanges.currentX;
    delete sceneResult.stateChanges.currentY;
  }

  // ─── Phase 5: Dice normalization ───
  const actionByName = new Map(actions.map(a => [a.name, a]));
  const characterByName = new Map(characters.map(c => [c.name, c]));
  const normalizeCtx = { actionByName, characterByName, fallbackActionText: actions[0]?.action || '' };

  if (sceneResult.diceRolls?.length) {
    sceneResult.diceRolls = sceneResult.diceRolls
      .map(dr => normalizeDiceRoll(dr, normalizeCtx))
      .filter(Boolean);
    for (const dr of sceneResult.diceRolls) recalcDiceRoll(dr);
  }
  if (sceneResult.diceRoll) {
    sceneResult.diceRoll = normalizeDiceRoll(sceneResult.diceRoll, {
      ...normalizeCtx,
      fallbackCharacterName: actions[0]?.name,
    });
    if (sceneResult.diceRoll) recalcDiceRoll(sceneResult.diceRoll);
  }

  // ─── Phase 5: Bestiary fill + reward resolution ───
  fillEnemiesFromBestiary(sceneResult.stateChanges, {
    campaignDifficultyTier: coreState.campaign?.difficultyTier || null,
    tierScale,
  });

  const nextSceneIndex = prevSceneRow ? prevSceneRow.sceneIndex + 1 : sceneCount;
  resolveAndApplyRewards(sceneResult.stateChanges, {
    sceneCount: nextSceneIndex,
    difficultyTier: coreState.campaign?.difficultyTier || 'medium',
  });

  // ─── Phase 5: Freeform skill XP ───
  calculateFreeformSkillXP(sceneResult.stateChanges, !!sceneResult.diceRolls?.length, sceneResult.diceRolls, tierScale.xpMultiplier || 1);

  // ─── Phase 5: Dialogue repair ───
  const worldNpcs = coreState.world?.npcs || [];
  const playerNames = players.map(p => p.name).filter(Boolean);
  repairSceneDialogue(sceneResult, {
    worldNpcs,
    playerName: playerNames[0] || '',
    playerGender: players[0]?.gender || null,
    playerAction: combinedAction,
    isFirstScene: sceneCount === 0,
    isPassiveSceneAction: false,
    currentLocation,
    campaignName: coreState.campaign?.name || '',
    factionNames: Object.keys(coreState.world?.factions || {}),
    locationNames: (coreState.world?.mapState || []).map(l => l.name).filter(Boolean),
  });

  // ─── Phase 5: Combat fallback ───
  injectCombatFallback(sceneResult, {
    playerAction: combinedAction,
    isFirstScene: sceneCount === 0,
    dbNpcs: worldNpcs,
    currentRef,
    currentLocationName: currentLocation,
  });

  // ─── Validate + normalize stateChanges (existing MP validation) ───
  const { validated } = validateMultiplayerStateChanges(
    sceneResult.stateChanges, room.gameState,
  );
  sceneResult.stateChanges = normalizeMultiplayerStateChanges(validated);

  // ─── Build scene + chat messages ───
  const stateNpcs = sceneResult.stateChanges?.npcs || [];
  const npcsHere = worldNpcs.filter(npc =>
    npc?.alive !== false && npc?.name && npc?.lastLocation
    && currentLocation && npc.lastLocation.toLowerCase() === currentLocation.toLowerCase(),
  );

  const factionNames = Object.keys(coreState.world?.factions || {});
  const locationNames = (coreState.world?.mapState || []).map(l => l.name).filter(Boolean);
  const excludeFromSpeakers = [
    ...playerNames, ...factionNames, ...locationNames,
    ...(currentLocation ? [currentLocation] : []),
    ...(coreState.campaign?.name ? [coreState.campaign.name] : []),
  ];
  const repairedSegments = repairDialogueSegments(
    sceneResult.narrative || '',
    sceneResult.dialogueSegments || [],
    [...worldNpcs, ...stateNpcs],
    excludeFromSpeakers,
  );

  let finalSegments = repairedSegments;
  for (const a of actions) {
    if (a.action === '[WAIT]') continue;
    const player = players.find(p => p.name === a.name);
    finalSegments = ensurePlayerDialogue(finalSegments, a.action, a.name, player?.gender);
  }

  const sceneId = `scene_mp_${Date.now()}`;
  const questOffers = (sceneResult.questOffers || []).map(offer => ({
    ...offer,
    objectives: (offer.objectives || []).map(obj => ({ ...obj, completed: false })),
    status: 'pending',
  }));
  const stateChanges = sceneResult.stateChanges || {};
  const scene = {
    id: sceneId,
    narrative: sceneResult.narrative || '',
    scenePacing: sceneResult.scenePacing || 'exploration',
    dialogueSegments: finalSegments,
    actions: ensureSuggestedActions(sceneResult, {
      language,
      currentLocation,
      npcsHere,
      previousActions: room.gameState?.scenes?.[room.gameState.scenes.length - 1]?.actions || [],
      sceneIndex: sceneCount + 1,
    }),
    questOffers,
    soundEffect: sceneResult.soundEffect || null,
    musicPrompt: sceneResult.musicPrompt || null,
    imagePrompt: sceneResult.imagePrompt || null,
    atmosphere: sceneResult.atmosphere || {},
    diceRoll: sceneResult.diceRoll || null,
    diceRolls: sceneResult.diceRolls || [],
    cutscene: sceneResult.cutscene || null,
    dilemma: sceneResult.dilemma || null,
    playerActions: actions.map(a => ({ name: a.name, action: a.action })),
    timestamp: Date.now(),
    ...(stateChanges.combatUpdate && {
      stateChanges: { combatUpdate: stateChanges.combatUpdate },
    }),
  };

  // Build chat messages
  const waitSystemText = language === 'pl' ? 'Czekam i patrzę, co wydarzy się dalej.' : 'I wait and see what happens next.';
  const continuePlayerText = language === 'pl' ? 'Dalej — kontynuujemy opowieść.' : 'Continue — moving the story forward.';

  const chatMessages = [];
  for (const a of actions) {
    if (a.action === '[WAIT]') {
      chatMessages.push({
        id: `msg_${Date.now()}_wait_${a.odId}`,
        role: 'system', subtype: 'wait',
        playerName: a.name, odId: a.odId,
        content: `${a.name}: ${waitSystemText}`,
        timestamp: Date.now(),
      });
      continue;
    }
    chatMessages.push({
      id: `msg_${Date.now()}_${a.odId}`,
      role: 'player', playerName: a.name, odId: a.odId,
      content: a.action === '[CONTINUE]' ? continuePlayerText : a.action,
      timestamp: Date.now(),
    });
  }
  if (sceneResult.diceRolls?.length) {
    for (const dr of sceneResult.diceRolls) {
      chatMessages.push({
        id: `msg_${Date.now()}_roll_${dr.character}`,
        role: 'system', subtype: 'dice_roll',
        content: `🎲 ${dr.character} — ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — margin ${dr.margin ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
        diceData: dr, timestamp: Date.now(),
      });
    }
  } else if (sceneResult.diceRoll) {
    const dr = sceneResult.diceRoll;
    chatMessages.push({
      id: `msg_${Date.now()}_roll`,
      role: 'system', subtype: 'dice_roll',
      content: `🎲 ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — margin ${dr.margin ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
      diceData: dr, timestamp: Date.now(),
    });
  }

  chatMessages.push({
    id: `msg_dm_${Date.now()}`,
    role: 'dm', sceneId: scene.id,
    content: scene.narrative,
    dialogueSegments: scene.dialogueSegments,
    soundEffect: scene.soundEffect,
    timestamp: Date.now(),
  });

  const scMessages = generateStateChangeMessages(
    stateChanges, characters, language, coreState.quests,
  );
  chatMessages.push(...scMessages);

  const fullSceneResult = { scene, chatMessages, stateChanges };

  // ─── Apply state changes to in-memory game state ───
  const newMomentum = computeNewMomentum(scene, prevMomentum, soloActionName);
  const applied = applySceneStateChanges(room.gameState, fullSceneResult, room.settings);
  const updatedGameState = {
    ...room.gameState,
    characters: applied.characters,
    world: applied.world,
    quests: applied.quests,
    ...(applied.campaign && { campaign: applied.campaign }),
    scenes: [...(room.gameState.scenes || []), scene],
    chatHistory: [...(room.gameState.chatHistory || []), ...chatMessages],
    characterMomentum: newMomentum,
  };
  setGameState(roomCode, updatedGameState);

  // Persist characters
  persistMultiplayerCharactersToDB(room, applied.characters)
    .catch(err => fastify.log.warn(err, 'MP character persist failed'));

  // Broadcast to all players
  const updatedRoom = getRoom(roomCode);
  broadcast(updatedRoom, {
    type: 'SCENE_UPDATE',
    scene,
    chatMessages,
    stateChanges,
    room: sanitizeRoom(updatedRoom),
  });

  saveRoomToDB(roomCode).catch(err => fastify.log.warn(err, 'MP room save failed'));

  // ─── Phase 4: processStateChanges + postSceneWork ───
  if (room.campaignId) {
    const savedScene = await persistSceneToDb(room.campaignId, fullSceneResult, actions, updatedGameState)
      .catch(err => {
        fastify.log.warn(err, 'MP CampaignScene persist failed');
        return null;
      });

    // Phase 4 — full processStateChanges pipeline replaces old syncNpcStateToCampaign
    if (stateChanges && Object.keys(stateChanges).length > 0) {
      processStateChanges(room.campaignId, stateChanges, {
        prevLoc: preResolveLocationName,
        sceneIndex: savedScene?.sceneIndex ?? nextSceneIndex,
        currentRef,
      }).catch(err => fastify.log.warn(err, 'MP processStateChanges failed (non-fatal)'));
    }

    // Phase 4 — enqueue post-scene work (embedding, NPC sync, nano extraction, memory compression)
    if (savedScene?.id) {
      const postResolveLoc = coreState.world?.currentLocation || null;
      enqueuePostSceneWork({
        sceneId: savedScene.id,
        campaignId: room.campaignId,
        playerAction: combinedAction,
        provider,
        newLoc: stateChanges.currentLocation || postResolveLoc,
        prevLoc: preResolveLocationName,
        wrapupText: null,
        llmNanoTimeoutMs,
      }).catch(err => log.error({ err, sceneId: savedScene.id }, 'MP enqueuePostSceneWork failed'));
    }
  }

  // Compression
  if (needsCompression(updatedGameState)) {
    compressOldScenes(updatedGameState, null, language)
      .then(summary => {
        if (summary) {
          const currentRoom = getRoom(roomCode);
          if (currentRoom?.gameState) {
            currentRoom.gameState.world = {
              ...(currentRoom.gameState.world || {}),
              compressedHistory: summary,
            };
            setGameState(roomCode, currentRoom.gameState);
            saveRoomToDB(roomCode).catch(err => fastify.log.warn(err, 'MP room save after compression failed'));
          }
        }
      })
      .catch(err => fastify.log.warn(err, 'MP scene compression failed'));
  }

  return { sceneResult: fullSceneResult, updatedRoom };
}
