import { FACTION_DEFINITIONS, getReputationTier } from '../data/rpgFactions';

const FACTION_DISPOSITION_FACTOR = 0.3;
const FACTION_CHANGE_THRESHOLD = 15;
const NPC_DISPOSITION_MIN = -50;
const NPC_DISPOSITION_MAX = 50;

export function checkWorldConsistency(gameState, previousFactions = null) {
  const corrections = [];
  const warnings = [];
  const statePatches = {};

  const world = gameState?.world;
  if (!world) return { corrections, warnings, statePatches };

  const npcs = world.npcs || [];
  const mapState = world.mapState || [];
  const factions = world.factions || {};
  const quests = gameState.quests || { active: [], completed: [] };
  const locationNames = new Set(mapState.map((m) => m.name?.toLowerCase()).filter(Boolean));

  // --- NPC-Faction alignment ---
  if (previousFactions) {
    const npcPatches = [];
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (!npc.factionId || !npc.alive) continue;
      const prevRep = previousFactions[npc.factionId] ?? 0;
      const curRep = factions[npc.factionId] ?? 0;
      const delta = curRep - prevRep;
      if (Math.abs(delta) >= FACTION_CHANGE_THRESHOLD) {
        const dispositionShift = Math.round(delta * FACTION_DISPOSITION_FACTOR);
        const oldDisp = npc.disposition || 0;
        const newDisp = Math.max(NPC_DISPOSITION_MIN, Math.min(NPC_DISPOSITION_MAX, oldDisp + dispositionShift));
        if (newDisp !== oldDisp) {
          npcPatches.push({ index: i, disposition: newDisp });
          corrections.push(
            `NPC "${npc.name}" disposition adjusted ${oldDisp} → ${newDisp} (faction "${npc.factionId}" rep changed by ${delta})`
          );
        }
      }
    }
    if (npcPatches.length > 0) {
      statePatches.npcDispositionUpdates = npcPatches;
    }
  }

  // --- NPC-Location validation ---
  for (const npc of npcs) {
    if (!npc.alive || !npc.lastLocation) continue;
    if (locationNames.size > 0 && !locationNames.has(npc.lastLocation.toLowerCase())) {
      warnings.push(
        `NPC "${npc.name}" is at "${npc.lastLocation}" which is not in the known map locations`
      );
    }
  }

  // --- Quest prerequisite check ---
  const completedQuestIds = new Set((quests.completed || []).map((q) => q.id));
  const blockedQuests = [];
  for (const quest of quests.active) {
    if (!quest.prerequisiteQuestIds?.length) continue;
    const unmetPrereqs = quest.prerequisiteQuestIds.filter((id) => !completedQuestIds.has(id));
    if (unmetPrereqs.length > 0) {
      blockedQuests.push({ questId: quest.id, unmetPrereqs });
      warnings.push(
        `Quest "${quest.name}" has unmet prerequisites: ${unmetPrereqs.join(', ')}`
      );
    }
  }
  if (blockedQuests.length > 0) {
    statePatches.blockedQuests = blockedQuests;
  }

  // --- Dead NPC quest giver impact ---
  const deadNpcNames = new Set(
    npcs.filter((n) => n.alive === false).map((n) => n.name?.toLowerCase())
  );
  const deadNpcIds = new Set(
    npcs.filter((n) => n.alive === false).map((n) => n.id)
  );
  for (const quest of quests.active) {
    if (!quest.questGiverId) continue;
    const giverNpc = npcs.find((n) => n.id === quest.questGiverId || n.name?.toLowerCase() === quest.questGiverId?.toLowerCase());
    if (giverNpc && giverNpc.alive === false) {
      warnings.push(
        `Quest "${quest.name}" was given by "${giverNpc.name}" who is now dead — quest may need resolution`
      );
      if (!statePatches.deadQuestGiverFacts) statePatches.deadQuestGiverFacts = [];
      statePatches.deadQuestGiverFacts.push(
        `The quest giver "${giverNpc.name}" for quest "${quest.name}" has died`
      );
    }
  }

  // --- Orphan faction IDs ---
  for (const factionId of Object.keys(factions)) {
    if (!FACTION_DEFINITIONS[factionId]) {
      warnings.push(`Unknown faction ID "${factionId}" in world.factions — not in FACTION_DEFINITIONS`);
    }
  }

  // --- NPC faction ID validation ---
  for (const npc of npcs) {
    if (npc.factionId && !FACTION_DEFINITIONS[npc.factionId]) {
      warnings.push(`NPC "${npc.name}" has unknown factionId "${npc.factionId}"`);
    }
  }

  return { corrections, warnings, statePatches };
}

export function applyConsistencyPatches(gameState, statePatches) {
  if (!statePatches || Object.keys(statePatches).length === 0) return null;

  const patches = {};

  if (statePatches.npcDispositionUpdates?.length > 0) {
    const npcs = [...(gameState.world?.npcs || [])];
    for (const { index, disposition } of statePatches.npcDispositionUpdates) {
      if (npcs[index]) {
        npcs[index] = { ...npcs[index], disposition };
      }
    }
    patches.npcs = npcs;
  }

  if (statePatches.deadQuestGiverFacts?.length > 0) {
    patches.newWorldFacts = statePatches.deadQuestGiverFacts;
  }

  return Object.keys(patches).length > 0 ? patches : null;
}

export function buildConsistencyWarningsForPrompt(warnings) {
  if (!warnings?.length) return '';
  const relevant = warnings.slice(0, 5);
  return 'WORLD CONSISTENCY WARNINGS (address these in your response if relevant):\n' +
    relevant.map((w) => `- ${w}`).join('\n') + '\n';
}
