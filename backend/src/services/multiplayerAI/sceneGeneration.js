import { generateStateChangeMessages } from '../stateChangeMessages.js';
import { callAI } from './aiClient.js';
import { buildMultiplayerSystemPrompt } from './systemPrompt.js';
import { buildMultiplayerScenePrompt } from './scenePrompt.js';
import { repairDialogueSegments, ensurePlayerDialogue } from '../../../../shared/domain/dialogueRepair.js';
import { ensureSuggestedActions } from '../../../../shared/domain/fallbackActions.js';
import { normalizeDiceRoll, recalcDiceRoll, rollD50 } from './diceNormalization.js';

export async function generateMultiplayerScene(gameState, settings, players, actions, _encryptedApiKeys, language = 'en', dmSettings = null, characterMomentum = null) {
  const systemPrompt = buildMultiplayerSystemPrompt(gameState, settings, players, language, dmSettings);
  const actionByName = new Map(actions.map((action) => [action.name, action]));
  const characterByName = new Map((gameState.characters || []).map((character) => [character.name, character]));

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

  const scenePrompt = buildMultiplayerScenePrompt(
    actions,
    false,
    language,
    { needsSystemEnabled: settings.needsSystemEnabled === true, characters: gameState.characters || [] },
    dmSettings,
    preRolledDice,
    characterMomentum,
    skipDiceRolls,
  );

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: scenePrompt },
  ];

  const result = await callAI(messages);

  const normalizeCtx = {
    actionByName,
    characterByName,
    fallbackActionText: actions[0]?.action || '',
  };

  if (result.diceRolls?.length) {
    result.diceRolls = result.diceRolls
      .map((dr) => normalizeDiceRoll(dr, normalizeCtx))
      .filter(Boolean);
    for (const dr of result.diceRolls) recalcDiceRoll(dr);
  }
  if (result.diceRoll) {
    result.diceRoll = normalizeDiceRoll(result.diceRoll, {
      ...normalizeCtx,
      fallbackCharacterName: actions[0]?.name,
    });
    if (result.diceRoll) recalcDiceRoll(result.diceRoll);
  }

  const worldNpcs = gameState?.world?.npcs || [];
  const stateNpcs = result.stateChanges?.npcs || [];
  const currentLocation = gameState?.world?.currentLocation || '';
  const npcsHere = worldNpcs.filter((npc) =>
    npc?.alive !== false
    && npc?.name
    && npc?.lastLocation
    && currentLocation
    && npc.lastLocation.toLowerCase() === currentLocation.toLowerCase()
  );
  const playerNames = players.map(p => p.name).filter(Boolean);
  const factionNames = Object.keys(gameState?.world?.factions || {});
  const locationNames = (gameState?.world?.mapState || []).map(l => l.name).filter(Boolean);
  const excludeFromSpeakers = [
    ...playerNames,
    ...factionNames,
    ...locationNames,
    ...(gameState?.world?.currentLocation ? [gameState.world.currentLocation] : []),
    ...(gameState?.campaign?.name ? [gameState.campaign.name] : []),
  ];
  const repairedSegments = repairDialogueSegments(
    result.narrative || '',
    result.dialogueSegments || [],
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
  const questOffers = (result.questOffers || []).map((offer) => ({
    ...offer,
    objectives: (offer.objectives || []).map((obj) => ({ ...obj, completed: false })),
    status: 'pending',
  }));
  const stateChanges = result.stateChanges || {};
  const scene = {
    id: sceneId,
    narrative: result.narrative || '',
    scenePacing: result.scenePacing || 'exploration',
    dialogueSegments: finalSegments,
    actions: ensureSuggestedActions(result, {
      language,
      currentLocation,
      npcsHere,
      previousActions: gameState?.scenes?.[gameState.scenes.length - 1]?.actions || [],
      sceneIndex: (gameState?.scenes?.length || 0) + 1,
    }),
    questOffers,
    soundEffect: result.soundEffect || null,
    musicPrompt: result.musicPrompt || null,
    imagePrompt: result.imagePrompt || null,
    atmosphere: result.atmosphere || {},
    diceRoll: result.diceRoll || null,
    diceRolls: result.diceRolls || [],
    cutscene: result.cutscene || null,
    dilemma: result.dilemma || null,
    playerActions: actions.map((a) => ({ name: a.name, action: a.action })),
    timestamp: Date.now(),
    ...(stateChanges.combatUpdate && {
      stateChanges: {
        combatUpdate: stateChanges.combatUpdate,
      },
    }),
  };

  const waitSystemText = language === 'pl' ? 'Czekam i patrzę, co wydarzy się dalej.' : 'I wait and see what happens next.';
  const continuePlayerText = language === 'pl' ? 'Dalej — kontynuujemy opowieść.' : 'Continue — moving the story forward.';

  const chatMessages = [];
  for (const a of actions) {
    if (a.action === '[WAIT]') {
      chatMessages.push({
        id: `msg_${Date.now()}_wait_${a.odId}`,
        role: 'system',
        subtype: 'wait',
        playerName: a.name,
        odId: a.odId,
        content: `${a.name}: ${waitSystemText}`,
        timestamp: Date.now(),
      });
      continue;
    }
    chatMessages.push({
      id: `msg_${Date.now()}_${a.odId}`,
      role: 'player',
      playerName: a.name,
      odId: a.odId,
      content: a.action === '[CONTINUE]' ? continuePlayerText : a.action,
      timestamp: Date.now(),
    });
  }
  if (result.diceRolls?.length) {
    for (const dr of result.diceRolls) {
      chatMessages.push({
        id: `msg_${Date.now()}_roll_${dr.character}`,
        role: 'system',
        subtype: 'dice_roll',
        content: `🎲 ${dr.character} — ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — margin ${dr.margin ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
        diceData: dr,
        timestamp: Date.now(),
      });
    }
  } else if (result.diceRoll) {
    const dr = result.diceRoll;
    chatMessages.push({
      id: `msg_${Date.now()}_roll`,
      role: 'system',
      subtype: 'dice_roll',
      content: `🎲 ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — margin ${dr.margin ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
      diceData: dr,
      timestamp: Date.now(),
    });
  }

  chatMessages.push({
    id: `msg_dm_${Date.now()}`,
    role: 'dm',
    sceneId: scene.id,
    content: scene.narrative,
    dialogueSegments: scene.dialogueSegments,
    soundEffect: scene.soundEffect,
    timestamp: Date.now(),
  });

  const scMessages = generateStateChangeMessages(
    stateChanges,
    gameState.characters || [],
    language,
    gameState.quests,
  );
  chatMessages.push(...scMessages);

  return {
    scene,
    chatMessages,
    stateChanges,
  };
}
