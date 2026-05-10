import { callAIJson } from './aiJsonCall.js';
import { prisma } from '../lib/prisma.js';

const MAX_STATE_CHANGES_BYTES = 16 * 1024;

const NPC_FIX_CAP = 5;
const NPC_RENAME_CAP = 3;
const QUEST_FIX_CAP = 5;

/**
 * Cap potentially-runaway buckets in an AI-emitted incident `stateChanges`
 * blob. Scenes already cap arrays in `processStateChanges/schemas.js`; this
 * is incident-specific tightening because a corrective fix has no business
 * touching dozens of NPCs at once.
 */
function clampIncidentStateChanges(stateChanges) {
  if (!stateChanges || typeof stateChanges !== 'object') return stateChanges;
  const next = { ...stateChanges };
  if (Array.isArray(next.npcs) && next.npcs.length > NPC_FIX_CAP) {
    next.npcs = next.npcs.slice(0, NPC_FIX_CAP);
  }
  if (Array.isArray(next.npcRename) && next.npcRename.length > NPC_RENAME_CAP) {
    next.npcRename = next.npcRename.slice(0, NPC_RENAME_CAP);
  }
  if (Array.isArray(next.questUpdates) && next.questUpdates.length > QUEST_FIX_CAP) {
    next.questUpdates = next.questUpdates.slice(0, QUEST_FIX_CAP);
  }
  return next;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Layer 3 of the dedupe defense — refuse to re-apply a correction whose
 * fingerprint matches a recently resolved incident. Caller has already
 * matched on text (Layer 1) and warned the AI in-prompt (Layer 2); this
 * is the last-line guard against the model insisting on a fix it was
 * told was already applied.
 *
 * Compares structural keys that uniquely identify a corrective action:
 *   - `currentLocation` target name
 *   - `npcRename` from→to pairs
 *   - `learnSpell` name
 *   - `newItems[].name` set
 * Returns the matching previous incident if a duplicate is detected.
 */
export function detectDuplicateCorrection(stateChanges, recentResolved) {
  if (!isPlainObject(stateChanges) || !Array.isArray(recentResolved) || recentResolved.length === 0) {
    return null;
  }

  const sc = stateChanges;
  const incomingLoc = typeof sc.currentLocation === 'string' ? sc.currentLocation.trim().toLowerCase() : null;
  const incomingRename = Array.isArray(sc.npcRename)
    ? sc.npcRename.map((r) => `${String(r?.from || '').toLowerCase()}→${String(r?.to || '').toLowerCase()}`).filter(Boolean)
    : [];
  const incomingSpell = typeof sc.learnSpell === 'string' ? sc.learnSpell.trim().toLowerCase() : null;
  const incomingItems = Array.isArray(sc.newItems)
    ? sc.newItems.map((i) => String(i?.name || '').trim().toLowerCase()).filter(Boolean)
    : [];

  for (const prev of recentResolved) {
    const prevSc = prev?.corrections?.stateChanges;
    if (!isPlainObject(prevSc)) continue;

    const prevLoc = typeof prevSc.currentLocation === 'string' ? prevSc.currentLocation.trim().toLowerCase() : null;
    if (incomingLoc && prevLoc && incomingLoc === prevLoc) {
      return { incident: prev, reason: 'currentLocation', value: incomingLoc };
    }

    if (incomingRename.length > 0 && Array.isArray(prevSc.npcRename)) {
      const prevSet = new Set(prevSc.npcRename.map((r) => `${String(r?.from || '').toLowerCase()}→${String(r?.to || '').toLowerCase()}`));
      const hit = incomingRename.find((k) => prevSet.has(k));
      if (hit) return { incident: prev, reason: 'npcRename', value: hit };
    }

    const prevSpell = typeof prevSc.learnSpell === 'string' ? prevSc.learnSpell.trim().toLowerCase() : null;
    if (incomingSpell && prevSpell && incomingSpell === prevSpell) {
      return { incident: prev, reason: 'learnSpell', value: incomingSpell };
    }

    if (incomingItems.length > 0 && Array.isArray(prevSc.newItems)) {
      const prevSet = new Set(prevSc.newItems.map((i) => String(i?.name || '').trim().toLowerCase()));
      const hit = incomingItems.find((n) => prevSet.has(n));
      if (hit) return { incident: prev, reason: 'newItems', value: hit };
    }
  }

  return null;
}

/**
 * Incidents that count as "fixed in the world" for Layer-2 prompt context and
 * Layer-3 fingerprint dedupe — player-right verdict AND processStateChanges completed.
 * Legacy rows with null worldCorrectionApplied are excluded (unknown apply outcome).
 */
export function isWorldCorrectionConfirmedApplied(inc) {
  return inc?.isPlayerRight === true && inc?.worldCorrectionApplied === true;
}

/**
 * Render the "already-resolved incidents" context block for the AI. Empty
 * string when nothing to show. Each line includes scene index, age in
 * minutes, complaint snippet, and resolved correction summary so the AI can
 * decide whether the new complaint is a re-run or independent.
 */
function renderRecentResolvedBlock(recentResolved) {
  if (!Array.isArray(recentResolved) || recentResolved.length === 0) return '';
  const now = Date.now();
  const lines = recentResolved.map((inc) => {
    const ageMin = Math.max(0, Math.round((now - new Date(inc.createdAt).getTime()) / 60000));
    const summary = Array.isArray(inc.corrections?.summary) ? inc.corrections.summary.join('; ') : '';
    const snippet = String(inc.playerComplaint || '').slice(0, 200);
    return `[Scene #${inc.sceneIndex}, ${ageMin} min ago] "${snippet}" → ${summary || '(no summary)'}`;
  });
  return [
    '',
    '## Recently Resolved Incidents (already fixed — DO NOT re-apply the same correction)',
    ...lines,
  ].join('\n');
}

/**
 * Render the active-quests + objectives block for the AI judge prompt.
 * Indices are aligned with displayOrder so that emitted `questUpdates[]
 * .objectiveId` values can be resolved deterministically by the same
 * `resolveObjective(objectives, raw)` used in scene flow
 * (`processStateChanges/quests.js`).
 */
function renderActiveQuestsBlock(activeQuests) {
  if (!Array.isArray(activeQuests) || activeQuests.length === 0) {
    return '\nNo active quests.';
  }
  const lines = ['## Active Quests (with objective indices for questUpdates)'];
  for (const q of activeQuests) {
    const type = q.type ? `, type: ${q.type}` : '';
    lines.push(`- Quest "${q.name || '(unnamed)'}" (questId: ${q.questId}${type}):`);
    const objectives = Array.isArray(q.objectives) ? q.objectives : [];
    if (objectives.length === 0) {
      lines.push('    (no objectives)');
    } else {
      objectives.forEach((obj, idx) => {
        const status = obj.status || 'pending';
        const desc = (obj.description || '').replace(/\s+/g, ' ').trim();
        lines.push(`    [${idx}] (status: ${status}) "${desc}"`);
      });
    }
  }
  return lines.join('\n');
}

/**
 * Analyze a player's incident report against recent scene history.
 * Uses the premium model to make a fair judgment.
 *
 * @param {Object} params
 * @param {string} params.campaignId - required for fresh quest+objectives fetch
 * @param {Array} params.recentScenes
 * @param {string} params.playerComplaint
 * @param {Object} params.campaignState
 * @param {Array} [params.recentResolvedIncidents] - prior `isPlayerRight=true` incidents within the dedupe window.
 *   Each: { sceneIndex, playerComplaint, corrections: { stateChanges, summary }, createdAt }.
 * @param {Object} [params.userApiKeys]
 * @param {string} [params.userId]
 * @returns {Promise<{verdict, isPlayerRight, technicalDetails, stateChanges, correctionSummary, narrativeComment, dedupedAgainst?}>}
 */
export async function analyzeIncident({
  campaignId,
  recentScenes,
  playerComplaint,
  campaignState,
  recentResolvedIncidents = [],
  userApiKeys = null,
  userId = null,
}) {
  const sceneSummaries = recentScenes.map((s, i) => {
    const parts = [`Scene ${s.sceneIndex ?? i}:`];
    if (s.chosenAction) parts.push(`Player action: ${s.chosenAction}`);
    parts.push(`Narrative: ${s.narrative}`);
    if (s.stateChanges) parts.push(`State changes: ${JSON.stringify(s.stateChanges)}`);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  const currentState = campaignState ? JSON.stringify({
    currentLocation: campaignState.world?.currentLocation,
    character: campaignState.character ? {
      name: campaignState.character.name,
      hp: campaignState.character.hp,
      maxHp: campaignState.character.maxHp,
      attributes: campaignState.character.attributes,
      mana: campaignState.character.mana,
      money: campaignState.character.money,
      attributePoints: campaignState.character.attributePoints,
    } : null,
    npcs: (campaignState.world?.npcs || []).map(n => ({
      name: n.name, alive: n.alive, attitude: n.attitude,
      disposition: n.disposition, lastLocation: n.lastLocation,
    })),
  }) : 'N/A';

  // Fresh active-quests fetch with objectives — coreState.quests is stale and
  // does NOT carry per-objective rows, so the judge previously had no way to
  // emit usable questUpdates[] (objectiveId resolution always missed).
  let activeQuestsBlock = '\nNo active quests.';
  if (campaignId) {
    try {
      const activeQuests = await prisma.campaignQuest.findMany({
        where: { campaignId, status: 'active' },
        include: { objectives: { orderBy: { displayOrder: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      });
      activeQuestsBlock = renderActiveQuestsBlock(activeQuests);
    } catch {
      // Non-fatal — judge still gets the rest of the context.
      activeQuestsBlock = '\n(Active quests fetch failed — no objective indices available.)';
    }
  }

  const recentResolvedBlock = renderRecentResolvedBlock(recentResolvedIncidents);

  const systemPrompt = `You are a fair and impartial game judge for an AI-powered RPG game called RPGon.
A player has filed an incident report claiming the AI game master made an error.

Your job is to:
1. Carefully review the recent scenes (narratives, player actions, state changes)
2. Read the player's complaint
3. Check whether the issue has already been fixed in a recent incident (see "Recently Resolved Incidents" section if present)
4. Determine if the player's complaint is valid
5. Provide technical analysis of what likely went wrong in the AI pipeline
6. If valid, emit a corrective stateChanges blob — same schema scene generation uses

Be fair but strict. Common valid complaints:
- Location not changing when player clearly traveled
- NPC acting out of character or contradicting established facts
- Game state not reflecting what happened in the narrative
- Dice rolls being ignored or misapplied
- Items/gold not being properly added or removed
- Combat results being inconsistent with the mechanics
- An NPC's name was used inconsistently (rename needed)
- Stats/skills/spells/quests/codex/knowledge are wrong or missing

Common INVALID complaints:
- Player disagreeing with AI's creative choices (narrative style, NPC reactions)
- Misunderstanding game mechanics
- Wanting different outcomes for dice rolls
- Difficulty grumbles that are actually valid game design
- DUPLICATE — issue was already corrected in a recent incident. If the complaint
  matches or overlaps with a previously resolved one (see context block), set
  isPlayerRight=false and explain in the verdict (player's language) that the
  fix was already applied at scene #X. This is NOT an AI error, it's a
  duplicate report; no second correction should be issued.

In "technicalDetails", provide ENGLISH-ONLY developer-facing analysis:
- Which stateChanges bucket likely failed or was missing
- Whether the issue is in prompt construction, LLM output, or post-processing validation
- Specific fields in stateChanges that should have been present but weren't
- Possible root cause

Respond in the SAME LANGUAGE as the player's complaint for "verdict", "correctionSummary", and "narrativeComment".
Always use ENGLISH for "technicalDetails".

## Correction Schema (when isPlayerRight=true)

Emit a \`stateChanges\` object using the SAME schema you use for normal scene
generation — every field is a DELTA against current state, not an absolute
value. You can fix anything: character, NPCs, locations, quests, codex,
knowledge, money, items, mana, needs, equipment.

Available fields (omit fields you don't need):

CHARACTER (deltas):
  woundsChange, manaChange, manaMaxChange,
  attributeChanges: { sila|zrecznosc|wytrzymalosc|wiedza|charyzma|szczescie: int },
  skillProgress: { skillName: xpGain },
  xpDelta, learnSpell, addScroll, consumeScroll,
  newItems: [{name, quantity, type?:'material'}],
  removeItems: [itemId, ...], removeItemsByName: [{name, quantity}],
  moneyChange: { gold, silver, copper },
  statuses: [...], needsChanges: { hunger|thirst|bladder|hygiene|rest: delta },
  equipChange: { mainHand?, offHand?, armour? },
  forceStatus

NPCs:
  npcs: [{ action: 'introduce'|'update', name, gender?, role?, personality?,
           attitude?, disposition?, dispositionChange?, alive?, lastLocation?,
           race?, creatureKind?, level?, statsOverride?, relationships?, factionId?, keyNpc? }]
  ⚠ Use action:'update' ONLY for NPCs that already appear in the current Game
    State NPC list. For new NPCs use action:'introduce' and explain why in
    correctionSummary.

NPC RENAME (incident-only primitive — separate from npcs[]):
  npcRename: [{ from: "old name", to: "new name" }]
  Use this — NOT npcs[] — when the fix is a name change. The npcs[] update
  path keys by name and would create a duplicate row.

LOCATION:
  currentLocation: "Target POI name" (resolves against fog-visible POIs;
                                       falls back to flavor name + coords)
  currentX, currentY (continuous coords for wandering)

QUESTS:
  questUpdates: [{ questId, objectiveId, completed?, addProgress? }],
    ⚠ "objectiveId" MUST be the numeric INDEX (as string, e.g. "0", "1") shown
       in the "Active Quests" block above. Never invent ids — only use indices
       you can see there. The quest auto-completes when ALL its objectives are
       done, so you do NOT need to also add it to "completedQuests" after
       marking the last objective.
  completedQuests: [questId, ...],
  failedQuests: [questId, ...]

KNOWLEDGE / CODEX:
  knowledgeUpdates: { events?: [...], decisions?: [...] },
  codexUpdates: [{ id, name, fragment, tags? }]

NPC MEMORY:
  npcMemoryUpdates: [{ npcName, memory, importance? }]

COMBAT (FE-only — corrections to a wrong/missing combat state):
  combatUpdate: { active?, participants?, round?, ... }

TIME / NEEDS:
  timeAdvance: hours (number, e.g. 0.5),
  needsChanges: { hunger|thirst|bladder|hygiene|rest: delta },
  restRecovery: { wounds?, mana?, ... }

FACTION:
  factionChanges: [{ factionId, reputation, ... }]

STATUSES / EFFECTS:
  activeEffects: [{ name, duration, ... }]

MAP MODE:
  mapMode: 'overworld'|'sublocation'|'dungeon'

NARRATIVE STATE:
  narrativeState: { currentAct?, ... }

TRADE:
  startTrade: { npcName, ... }

LIVING WORLD (only if relevant): locationMentioned[], dungeonRoom{}, worldImpact,
  dungeonComplete{}, locationLiberated, defeatedDeadlyEncounter

INCIDENT BONUS (always set when isPlayerRight=true):
  rewardAttributePoint: 1
  This is the +1 attribute point reward for catching a real bug. Do NOT use
  attributeChanges for this purpose — use rewardAttributePoint:1 explicitly.

## Output JSON shape (strict)

{
  "verdict": "Polish/player-language explanation, 2-4 sentences",
  "isPlayerRight": true|false,
  "technicalDetails": "English-only developer analysis, 3-5 sentences",
  "stateChanges": { /* object as described above, OR null when isPlayerRight=false */ },
  "correctionSummary": [
    "Krótka linia po polsku opisująca jedną zmianę.",
    "Każda pozycja = jedna konkretna naprawa."
  ],
  "narrativeComment": "1-2 sentences in-character narrator comment, player's language"
}

Rules:
- "stateChanges", "correctionSummary", "narrativeComment" are present ONLY when isPlayerRight=true.
- When isPlayerRight=false, set all three to null.
- Every entry in correctionSummary must correspond to a real change inside stateChanges (no claims without action).
- All character fields are DELTAS — never absolute totals.
- Caps: at most 5 NPC updates, 3 npcRename pairs, 5 quest updates per incident.
- If the scene already has resolved incidents, scrutinize harder — only emit
  isPlayerRight=true for issues that are independent from previously fixed ones.`;

  const userPrompt = `## Recent Scenes

${sceneSummaries}

## Current Game State

${currentState}

${activeQuestsBlock}
${recentResolvedBlock}

## Player's Complaint

${playerComplaint}`;

  const { text } = await callAIJson({
    modelTier: 'premium',
    systemPrompt,
    userPrompt,
    maxTokens: 2000,
    temperature: 0.3,
    userApiKeys,
    userId,
    taskType: 'incident-analysis',
    taskLabel: 'Incident Report Analysis',
  });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      verdict: text || 'Unable to analyze the incident.',
      isPlayerRight: false,
      technicalDetails: null,
      stateChanges: null,
      correctionSummary: null,
      narrativeComment: null,
    };
  }

  const isPlayerRight = !!parsed.isPlayerRight;

  if (!isPlayerRight) {
    return {
      verdict: parsed.verdict || 'Unable to determine.',
      isPlayerRight: false,
      technicalDetails: parsed.technicalDetails || null,
      stateChanges: null,
      correctionSummary: null,
      narrativeComment: null,
    };
  }

  let stateChanges = isPlainObject(parsed.stateChanges) ? clampIncidentStateChanges(parsed.stateChanges) : null;
  let correctionSummary = Array.isArray(parsed.correctionSummary)
    ? parsed.correctionSummary.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : [];

  // Outer envelope cap — reject mass-rewrites.
  if (stateChanges) {
    const size = Buffer.byteLength(JSON.stringify(stateChanges), 'utf8');
    if (size > MAX_STATE_CHANGES_BYTES) {
      return {
        verdict: parsed.verdict || 'Correction blob exceeded size limit and was rejected.',
        isPlayerRight: false,
        technicalDetails: `Rejected: stateChanges blob ${size} bytes > ${MAX_STATE_CHANGES_BYTES} bytes cap.`,
        stateChanges: null,
        correctionSummary: null,
        narrativeComment: null,
      };
    }
  }

  // Layer 3 dedupe — refuse to re-apply a correction whose fingerprint
  // matches a recently resolved incident.
  if (stateChanges) {
    const dup = detectDuplicateCorrection(stateChanges, recentResolvedIncidents);
    if (dup) {
      const prev = dup.incident;
      const sceneRef = prev?.sceneIndex != null ? `#${prev.sceneIndex}` : '';
      const verdict = `Ta korekta została już zaaplikowana w incydencie ze sceny ${sceneRef}. Powtórne zgłoszenie nie skutkuje kolejną zmianą stanu świata.`;
      return {
        verdict,
        isPlayerRight: false,
        technicalDetails: `Layer-3 dedupe match — reason: ${dup.reason}, value: ${dup.value}, prev incident id: ${prev?.id || 'unknown'}.`,
        stateChanges: null,
        correctionSummary: null,
        narrativeComment: null,
        dedupedAgainst: prev?.id || null,
      };
    }
  }

  return {
    verdict: parsed.verdict || 'Naprawiono zgłoszony błąd.',
    isPlayerRight: true,
    technicalDetails: parsed.technicalDetails || null,
    stateChanges,
    correctionSummary,
    narrativeComment: typeof parsed.narrativeComment === 'string' ? parsed.narrativeComment : null,
  };
}
