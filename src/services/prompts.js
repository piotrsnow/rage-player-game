import { getBonus, formatMoney } from './gameState';
import { formatResolvedCheck } from './mechanics/index';
import { gameData } from './gameDataService';
import { FACTION_DEFINITIONS, getReputationTier } from '../data/wfrpFactions';
import { formatCriticalWoundsForPrompt } from '../data/wfrpCriticals';
import { formatMagicForPrompt } from '../data/wfrpMagic';
import { formatWeatherForPrompt } from './weatherEngine';
import { formatEquipmentForPrompt } from '../data/wfrpEquipment';
import { extractActionParts, extractDialogueParts, hasDialogue } from './actionParser';
import { formatTalentsForPrompt } from '../data/wfrpTalents';
import { calculateTensionScore, getTensionGuidance } from './tensionTracker';
import {
  checkSeedResolution, formatSeedsForPrompt,
  formatCallbacksForPrompt,
  formatAgendasForPrompt,
  formatDeadlinesForPrompt,
  pickIdleEventType,
  shouldGenerateDilemma,
} from './narrativeEngine';

export const COMBAT_INTENT_REGEX = /\b(atak|atakuj[eę]?|walcz[eęy]?|walk[eęiąa]|rozpoczynam|rzucam\s+si[eę]|wyzywam|bij[eę]|uderz(?:am|e)|zabij|zaatakuj|dobywam|wyci[aą]gam\s+(?:miecz|bro[nń]|topor|n[oó][zż]|sztylet)|attack|fight|strike|hit|punch|stab|slash|shoot|kill|combat|draw\s*(?:my\s+)?(?:sword|weapon|blade|axe|knife|dagger))\b/i;

export function detectCombatIntent(playerAction) {
  if (!playerAction) return false;
  if (playerAction.startsWith('[Combat resolved:')) return false;
  if (playerAction.startsWith('[INITIATE COMBAT]') || playerAction.startsWith('[ATTACK:')) return true;
  return COMBAT_INTENT_REGEX.test(playerAction);
}

export const DIALOGUE_INTENT_REGEX = /\b(rozmawiam|porozmawia[jm]|zagaduj[eę]?|negocjuj[eę]?|przekonuj[eę]?|perswaduj[eę]?|dyskutuj[eę]?|targu[jJeę]|pytam|zagaj|rozmawiaj|talk|speak|negotiate|persuade|discuss|converse|haggle|parley|chat\s+with|bargain|ask\s+about)\b/i;

export function detectDialogueIntent(playerAction) {
  if (!playerAction) return false;
  if (playerAction.startsWith('[Dialogue ended:')) return false;
  if (playerAction.startsWith('[INITIATE DIALOGUE')) return true;
  if (playerAction.startsWith('[TALK:')) return true;
  return DIALOGUE_INTENT_REGEX.test(playerAction);
}

function normalizeActionForComparison(action) {
  return String(action || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ');
}

function collectRecentSuggestedActions(scenes = [], sceneWindow = 3) {
  return (scenes || [])
    .slice(-Math.max(1, sceneWindow))
    .flatMap((scene) => (Array.isArray(scene?.actions) ? scene.actions : []))
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean)
    .filter((action, index, list) => {
      const normalized = normalizeActionForComparison(action);
      return normalized && list.findIndex((item) => normalizeActionForComparison(item) === normalized) === index;
    });
}

function formatCombatantForCommentary(combatant) {
  const status = combatant.isDefeated
    ? 'defeated'
    : `${combatant.wounds}/${combatant.maxWounds} wounds`;
  return `- ${combatant.name} [${combatant.type}]${combatant.side ? ` side=${combatant.side}` : ''} — ${status}`;
}

export function buildCombatCommentaryPrompts(gameState, combatSnapshot, language = 'en') {
  const campaignName = gameState?.campaign?.name || 'Unnamed Campaign';
  const currentLocation = gameState?.world?.currentLocation || 'Unknown';
  const activeCombatants = combatSnapshot?.activeCombatants || [];
  const defeatedCombatants = combatSnapshot?.defeatedCombatants || [];
  const recentResults = combatSnapshot?.recentResults || [];
  const recentLogEntries = combatSnapshot?.recentLogEntries || [];
  const langNote = language === 'pl'
    ? 'Write both the narration and battle cries in Polish.'
    : 'Write both the narration and battle cries in English.';

  const activeBlock = activeCombatants.length > 0
    ? activeCombatants.map(formatCombatantForCommentary).join('\n')
    : '- No active combatants remain.';
  const defeatedBlock = defeatedCombatants.length > 0
    ? defeatedCombatants.map(formatCombatantForCommentary).join('\n')
    : '- Nobody has been defeated yet.';
  const recentResultsBlock = recentResults.length > 0
    ? recentResults.map((entry) => `- ${entry}`).join('\n')
    : '- No recent exchanges recorded.';
  const recentLogBlock = recentLogEntries.length > 0
    ? recentLogEntries.map((entry) => `- ${entry}`).join('\n')
    : '- No recent combat log lines.';

  return {
    system: `You are a battle commentator for the tabletop RPG campaign "${campaignName}" using Warhammer Fantasy Roleplay 4th Edition tone and texture.

Your job is to add a short mid-combat narration to an already active fight.

MANDATORY RULES:
- This is NOT a full scene. Do not continue the adventure outside the current fight.
- Do NOT invent or request any state changes, combat resolution, new enemies, victory, surrender, or an end to combat.
- Write exactly ONE narrator paragraph summarizing the current state and momentum of the battle.
- Then provide exactly ONE short, vicious battle cry for EACH active combatant listed in the input.
- Battle cries must be direct speech only, with no narration around them.
- Use only the listed combatants and recent combat context. Do not introduce new speakers.
- Keep the output tight and vivid. The commentary should feel fast and reactive, not like a full prose scene.
- ${langNote}
- Respond with ONLY valid JSON in this exact format:
{
  "narration": "One paragraph of battle narration...",
  "battleCries": [
    { "speaker": "Combatant Name", "text": "Short battle cry!" }
  ]
}`,
    user: `Generate a mid-combat commentary for an already active fight.

ROUND: ${combatSnapshot?.round ?? 0}
LOCATION: ${currentLocation}
REASON FOR THE FIGHT: ${combatSnapshot?.reason || 'Unknown'}
ACTIVE COMBATANT COUNT: ${activeCombatants.length}

ACTIVE COMBATANTS:
${activeBlock}

DEFEATED COMBATANTS:
${defeatedBlock}

RECENT RESOLUTION SNAPSHOT:
${recentResultsBlock}

RECENT COMBAT LOG:
${recentLogBlock}

REMINDERS:
- Narration must stay in the present battle and reflect visible momentum, wounds, pressure, positioning, fear, fury, or desperation.
- Battle cries must cover every active combatant exactly once.
- Do not duplicate the same cry wording for everyone.
- Do not mention JSON, rules, or mechanics in the narration unless it is natural diegetic language.`,
  };
}

const NEEDS_LABELS = {
  hunger: { moderate: 'starting to feel hungry, thoughts drifting to food', low: 'hungry, distracted', critical: 'weak, dizzy, stomach pains' },
  thirst: { moderate: 'mouth getting dry, craving a drink', low: 'thirsty, dry mouth', critical: 'parched, cracked lips, fading' },
  bladder: { moderate: 'mild pressure, aware of need', low: 'uncomfortable, fidgeting', critical: 'desperate, about to lose control', zero: 'lost control!' },
  hygiene: { moderate: 'starting to feel grimy, faint odor', low: 'smelly, NPCs wrinkle noses', critical: 'terrible stench, NPCs recoil' },
  rest: { moderate: 'slightly fatigued, occasional yawn', low: 'tired, yawning, slower reactions', critical: 'can barely keep eyes open, stumbling', zero: 'collapses from exhaustion' },
};

export function buildUnmetNeedsBlock(needs) {
  if (!needs) return '';
  const lines = [];
  for (const [key, labels] of Object.entries(NEEDS_LABELS)) {
    const val = needs[key] ?? 100;
    if (val >= 10) continue;
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    if (val <= 0 && labels.zero) {
      lines.push(`- ${name}: ${val}/100 [ZERO — ${key === 'bladder' ? 'ACCIDENT' : 'COLLAPSE'} — ${labels.zero}]`);
    } else {
      lines.push(`- ${name}: ${val}/100 [CRITICAL — ${labels.critical}]`);
    }
  }
  if (lines.length === 0) return '';
  return `CHARACTER NEEDS STATUS (always factor these into narration, NPC reactions, and outcomes):\n${lines.join('\n')}\n\n`;
}

export function buildNeedsEnforcementReminder(needs) {
  if (!needs) return '';
  const urgent = [];
  for (const [key] of Object.entries(NEEDS_LABELS)) {
    const val = needs[key] ?? 100;
    if (val >= 10) continue;
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    if (val <= 0) urgent.push(`${name}: ${val}/100 — ZERO`);
    else urgent.push(`${name}: ${val}/100 — CRITICAL`);
  }
  if (urgent.length === 0) return '';
  return `\nNEEDS ENFORCEMENT (MANDATORY — do NOT skip):
Unmet needs: ${urgent.join('; ')}.
YOU MUST:
1. Weave these need effects into the narrative — describe physical symptoms, character thoughts, NPC reactions to the character's state.
2. Include stateChanges.needsChanges with non-zero deltas if the character eats, drinks, rests, bathes, or uses a toilet during this scene.
3. At least ONE of the three suggestedActions MUST address the most urgent unmet need (e.g. "I look for food", "I search for water", "I find somewhere to rest").
4. The game engine automatically applies a -10 penalty to related skill checks when needs are critical. Reflect this in the narrative — the character struggles with focus, coordination, or social grace.\n`;
}

const LOW_ACTION_PACING = new Set(['exploration', 'travel_montage', 'rest']);
const LOW_ACTION_ACTIONS = /\b(id[eę]|iść|wędruj|podróżuj|kontynuuj|rozglądaj|spaceruj|walk|go|travel|continue|explore|move on|head to|proceed|wander|look around)\b/i;

export function buildPacingPressure(scenes) {
  if (!scenes || scenes.length < 2) return '';
  const recent = scenes.slice(-5);
  let consecutive = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const s = recent[i];
    const pacing = s.scenePacing || 'exploration';
    const hadCombat = s.diceRoll?.type === 'combat' || s.stateChanges?.combatUpdate?.active;
    const hadNewNpcs = (s.stateChanges?.npcs || []).some(n => n.action === 'introduce');
    const hadQuestOffer = (s.questOffers || []).length > 0;
    const actionIsLow = !s.chosenAction || LOW_ACTION_ACTIONS.test(s.chosenAction || '');

    if (LOW_ACTION_PACING.has(pacing) && !hadCombat && !hadNewNpcs && !hadQuestOffer && actionIsLow) {
      consecutive++;
    } else {
      break;
    }
  }
  if (consecutive >= 3) {
    return `\nCRITICAL PACING ALERT — the story has stalled for ${consecutive} consecutive low-action scenes. You MUST introduce a significant plot event, ambush, NPC encounter, or environmental hazard NOW. Use "travel_montage" to skip boring travel and arrive at something interesting. Set scenePacing to something other than exploration/rest/travel_montage.\n`;
  }
  if (consecutive >= 2) {
    return `\nPACING ALERT — the last ${consecutive} scenes have been low-action (no combat, no new NPCs, no quest offers). You MUST inject a meaningful event, complication, encounter, or discovery in this scene. Use "travel_montage" to skip boring travel and arrive at something interesting.\n`;
  }
  return '';
}

function buildRelationshipGraphBlock(npcs, quests, factions) {
  const lines = [];
  const aliveNpcs = (npcs || []).filter((n) => n.alive !== false);

  for (const npc of aliveNpcs) {
    const parts = [npc.name];
    if (npc.factionId) parts.push(`(${npc.factionId})`);
    const relParts = [];
    if (npc.relationships?.length > 0) {
      for (const r of npc.relationships) {
        relParts.push(`${r.type} of ${r.npcName}`);
      }
    }
    const questLinks = [];
    for (const q of [...(quests?.active || []), ...(quests?.completed || [])]) {
      if (q.questGiverId && (q.questGiverId === npc.id || q.questGiverId.toLowerCase() === npc.name?.toLowerCase())) {
        questLinks.push(`quest giver for "${q.name}"`);
      }
    }
    if (npc.relatedQuestIds?.length > 0) {
      for (const qid of npc.relatedQuestIds) {
        const q = (quests?.active || []).find((qq) => qq.id === qid);
        if (q && !questLinks.some((l) => l.includes(q.name))) {
          questLinks.push(`involved in "${q.name}"`);
        }
      }
    }
    const allRels = [...relParts, ...questLinks];
    if (allRels.length > 0 || npc.factionId) {
      lines.push(`${parts.join(' ')}${allRels.length > 0 ? ' — ' + allRels.join(', ') : ''}`);
    }
  }

  if (lines.length === 0) return '';
  return `\nRELATIONSHIP GRAPH (use to maintain consistent NPC behavior, alliances, and rivalries):\n${lines.map((l) => `- ${l}`).join('\n')}\n\n`;
}

function buildConsistencyWarningsBlock(warnings) {
  if (!warnings?.length) return '';
  const relevant = warnings.slice(0, 5);
  return `WORLD CONSISTENCY WARNINGS (address these in your narrative if relevant):\n${relevant.map((w) => `- ${w}`).join('\n')}\n\n`;
}

export function buildSystemPrompt(gameState, dmSettings, language = 'en', enhancedContext = null, {
  needsSystemEnabled = false,
  consistencyWarnings = [],
  promptProfile = 'balanced',
  sceneTokenBudget = null,
  promptTokenBudget = null,
  fullSceneHistory = false,
} = {}) {
  const { campaign, character, world, quests } = gameState;

  const ctxDepthForQuests = dmSettings.contextDepth ?? 100;
  const activeQuests = quests.active.map((q) => {
    if (ctxDepthForQuests < 50) {
      return `- ${q.name} [${q.type || 'side'}]`;
    }
    let line = `- ${q.name} [${q.type || 'side'}]: ${q.description}`;
    if (q.reward) {
      const parts = [];
      if (q.reward.xp) parts.push(`${q.reward.xp} XP`);
      if (q.reward.money) {
        const m = q.reward.money;
        if (m.gold) parts.push(`${m.gold} GC`);
        if (m.silver) parts.push(`${m.silver} SS`);
        if (m.copper) parts.push(`${m.copper} CP`);
      }
      if (q.reward.items?.length > 0) parts.push(q.reward.items.map((i) => i.name || i).join(', '));
      if (parts.length > 0) line += `\n  Reward: ${parts.join(', ')}`;
      else if (q.reward.description) line += `\n  Reward: ${q.reward.description}`;
    }
    if (q.completionCondition) line += `\n  Goal: ${q.completionCondition}`;
    if (q.questGiverId) line += `\n  Quest giver: ${q.questGiverId}`;
    const turnIn = q.turnInNpcId || q.questGiverId;
    if (turnIn && turnIn !== q.questGiverId) line += `\n  Turn in to: ${turnIn}`;
    if (q.locationId) line += `\n  Location: ${q.locationId}`;
    if (q.prerequisiteQuestIds?.length > 0) line += `\n  Requires: ${q.prerequisiteQuestIds.join(', ')}`;
    const allDone = q.objectives?.length > 0 && q.objectives.every((o) => o.completed);
    if (q.objectives?.length > 0) {
      line += `\n  Objectives${allDone ? ' (ALL DONE — ready to turn in)' : ''}:`;
      for (const obj of q.objectives) {
        line += `\n    [${obj.completed ? 'X' : ' '}] ${obj.description}`;
      }
    }
    if (q.questItems?.length > 0) {
      line += `\n  Quest items:`;
      for (const item of q.questItems) {
        line += `\n    - ${item.name}: ${item.description || 'No description'}`;
        if (item.location) line += ` (at: ${item.location})`;
      }
    }
    return line;
  }).join('\n') || 'None';
  const worldFactsCount = ctxDepthForQuests >= 75 ? 20 : ctxDepthForQuests >= 50 ? 10 : 0;
  const worldFacts = worldFactsCount > 0
    ? ((world?.facts || []).slice(-worldFactsCount).join('\n') || 'No known facts yet.')
    : 'No known facts yet.';
  const journal = (world?.eventHistory || []).length > 0
    ? world.eventHistory.map((e, i) => `${i + 1}. ${e}`).join('\n')
    : 'No entries yet.';
  const inventory = character?.inventory?.map((i) => `${i.name} (${i.type})`).join(', ') || 'Empty';
  const moneyDisplay = character?.money ? formatMoney(character.money) : '0 CP';
  const statuses = character?.statuses?.join(', ') || 'None';
  const contextDepth = dmSettings.contextDepth ?? 100;

  const difficultyLabel = dmSettings.difficulty < 25 ? 'Easy' : dmSettings.difficulty < 50 ? 'Normal' : dmSettings.difficulty < 75 ? 'Hard' : 'Expert';
  const narrativeLabel = dmSettings.narrativeStyle < 25 ? 'Predictable' : dmSettings.narrativeStyle < 50 ? 'Balanced' : dmSettings.narrativeStyle < 75 ? 'Chaotic' : 'Wild';
  const responseSentenceCount = Math.min(10, Math.floor((dmSettings.responseLength ?? 0) / 10) + 1);
  const responseLabel = `${responseSentenceCount} ${responseSentenceCount === 1 ? 'sentence' : 'sentences'}`;

  const testsFrequency = dmSettings.testsFrequency ?? 50;
  const testsLabel = testsFrequency < 20
    ? 'rarely (only critical moments)'
    : testsFrequency < 40
    ? 'occasionally (important actions only)'
    : testsFrequency < 60
    ? 'regularly (most meaningful actions)'
    : testsFrequency < 80
    ? 'frequently (most actions, including minor ones)'
    : 'almost always (even trivial actions like stepping over a threshold)';

  const poeticismLabel = (dmSettings.narratorPoeticism ?? 50) < 25 ? 'dry and prosaic' : (dmSettings.narratorPoeticism ?? 50) < 50 ? 'moderately literary' : (dmSettings.narratorPoeticism ?? 50) < 75 ? 'poetic and evocative' : 'lushly lyrical, rich in metaphor and imagery';
  const grittinessLabel = (dmSettings.narratorGrittiness ?? 30) < 25 ? 'lighthearted and clean' : (dmSettings.narratorGrittiness ?? 30) < 50 ? 'moderately grounded' : (dmSettings.narratorGrittiness ?? 30) < 75 ? 'gritty and raw' : 'brutally dark, visceral and unflinching';
  const detailLabel = (dmSettings.narratorDetail ?? 50) < 25 ? 'minimal, only essential details' : (dmSettings.narratorDetail ?? 50) < 50 ? 'balanced descriptions' : (dmSettings.narratorDetail ?? 50) < 75 ? 'rich environmental detail' : 'lavishly detailed, painting every sensory element';
  const humorLabel = (dmSettings.narratorHumor ?? 20) < 25 ? 'completely serious' : (dmSettings.narratorHumor ?? 20) < 50 ? 'occasional dry wit' : (dmSettings.narratorHumor ?? 20) < 75 ? 'frequent situational humor woven into narration without breaking immersion' : 'heavily comedic and irreverent, but still rooted in character-driven situations and world logic';
  const dramaLabel = (dmSettings.narratorDrama ?? 50) < 25 ? 'understated and subtle' : (dmSettings.narratorDrama ?? 50) < 50 ? 'measured dramatic pacing' : (dmSettings.narratorDrama ?? 50) < 75 ? 'heightened drama and tension' : 'maximally theatrical, grandiose and operatic';
  const narratorCustomInstructions = (dmSettings?.narratorCustomInstructions || '').trim();

  const npcs = world?.npcs || [];
  const npcSection = npcs.length > 0
    ? npcs.map((n) => {
        let line = `- ${n.name} (${n.role || 'unknown role'}, ${n.gender || '?'}): personality="${n.personality || '?'}", attitude=${n.attitude || 'neutral'}, disposition=${n.disposition || 0}, location="${n.lastLocation || 'unknown'}"`;
        if (n.factionId) line += `, faction=${n.factionId}`;
        if (n.alive === false) line += ' [DEAD]';
        if (n.relationships?.length > 0) {
          line += ` | relations: ${n.relationships.map((r) => `${r.type} of ${r.npcName}`).join(', ')}`;
        }
        if (n.notes) line += ` — ${n.notes}`;
        return line;
      }).join('\n')
    : 'No NPCs encountered yet.';

  const currentLoc = world?.currentLocation || 'Unknown';

  const npcsHere = npcs.filter((n) => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  const npcsHereSection = npcsHere.length > 0
    ? npcsHere.map((n) => `- ${n.name} (${n.role || 'unknown role'})`).join('\n')
    : 'No known NPCs at this location.';
  const mapState = world?.mapState || [];
  const mapSection = mapState.length > 0
    ? mapState.map((loc) => {
        const isCurrent = loc.name?.toLowerCase() === currentLoc?.toLowerCase();
        const mods = (loc.modifications || []).map((m) => `  · [${m.type}] ${m.description}`).join('\n');
        return `- ${loc.name}${isCurrent ? ' ← CURRENT' : ''}${loc.description ? `: ${loc.description}` : ''}${mods ? '\n' + mods : ''}`;
      }).join('\n')
    : 'No locations mapped yet.';

  const timeState = world?.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
  const hour = timeState.hour ?? 6;
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const displayHour = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  const timeSection = `Day ${timeState.day}, ${displayHour} (${timeState.timeOfDay}), Season: ${timeState.season}`;

  const activeEffects = (world?.activeEffects || []).filter((e) => e.active !== false);
  const effectsSection = activeEffects.length > 0
    ? activeEffects.map((e) => `- [${e.type}] ${e.description} (at ${e.location || 'unknown location'}${e.placedBy ? `, by ${e.placedBy}` : ''})`).join('\n')
    : 'No active effects.';

  // WFRP character state
  const chars = character?.characteristics || {};
  const adv = character?.advances || {};
  const charLines = ['WS', 'BS', 'S', 'T', 'I', 'Ag', 'Dex', 'Int', 'WP', 'Fel'].map((label, idx) => {
    const key = ['ws', 'bs', 's', 't', 'i', 'ag', 'dex', 'int', 'wp', 'fel'][idx];
    const val = chars[key] || 0;
    const bonus = getBonus(val);
    const advances = adv[key] || 0;
    return `${label}: ${val} (Bonus ${bonus}${advances > 0 ? `, +${advances} advances` : ''})`;
  }).join(', ');

  const skillList = character?.skills && Object.keys(character.skills).length > 0
    ? Object.entries(character.skills).map(([name, advances]) => `${name} +${advances}`).join(', ')
    : 'None';

  const talentList = formatTalentsForPrompt(character?.talents);

  const careerInfo = character?.career
    ? `${character.career.name} (${character.career.class}), Tier ${character.career.tier}: ${character.career.tierName}, Status: ${character.career.status}`
    : 'Unknown';

  const allScenes = gameState.scenes || [];
  const previousSuggestedActions = collectRecentSuggestedActions(allScenes, 3);

  let sceneHistory;
  if (enhancedContext) {
    const parts = [];
    if (enhancedContext.compressedHistory) {
      parts.push(`ARCHIVED HISTORY (AI summary of earliest scenes):\n${enhancedContext.compressedHistory}`);
    }
    if (enhancedContext.mediumScenes?.length > 0) {
      const medium = enhancedContext.mediumScenes
        .map((s) => `Scene ${s.index}${s.action ? ` [Player: ${s.action}]` : ''}: ${s.summary}...`)
        .join('\n');
      parts.push(`EARLIER SCENES (summaries):\n${medium}`);
    }
    if (enhancedContext.fullScenes?.length > 0) {
      const full = enhancedContext.fullScenes
        .map((s) => {
          const actionTag = s.action ? ` [Player: ${s.action}]` : '';
          const actionsTag = s.suggestedActions?.length ? `\n  Suggested actions: ${s.suggestedActions.join(' | ')}` : '';
          return `Scene ${s.index}${actionTag}:\n${s.narrative}${actionsTag}`;
        })
        .join('\n\n');
      parts.push(`RECENT SCENES (full):\n${full}`);
    }
    if (enhancedContext.relevantCodex) {
      parts.unshift(enhancedContext.relevantCodex);
    }
    if (enhancedContext.relevantMemories) {
      parts.unshift(enhancedContext.relevantMemories);
    }
    sceneHistory = parts.join('\n\n') || 'No scenes yet - this is the beginning of the story.';
  } else {
    const historySource = fullSceneHistory ? allScenes : allScenes.slice(-10);
    sceneHistory = historySource
      .map((s, i) => `Scene ${i + 1}: ${s.narrative?.substring(0, 200)}...`)
      .join('\n') || 'No scenes yet - this is the beginning of the story.';
  }

  return `You are the Game Master AI for "${campaign?.name || 'Unnamed Campaign'}", running under the Warhammer Fantasy Roleplay 4th Edition (WFRP 4e) rules system.

CAMPAIGN SETTINGS:
- Genre: ${campaign?.genre || 'Fantasy'}
- Tone: ${campaign?.tone || 'Epic'}
- Play Style: ${campaign?.style || 'Hybrid'} (narrative + d100 skill tests)
- Difficulty: ${difficultyLabel}
- Narrative chaos: ${narrativeLabel}
- Response length: ${responseLabel}
- Dice rolls: Handled by the game engine (not AI). The user prompt provides resolved outcomes.
- Prompt profile: ${promptProfile}
- Target output budget: ~${sceneTokenBudget ?? 'default'} tokens for this scene
- Prompt input budget: ~${promptTokenBudget ?? 'default'} tokens max

NARRATOR VOICE & STYLE:
- Poeticism: ${poeticismLabel}
- Grittiness: ${grittinessLabel}
- Environmental detail: ${detailLabel}
- Humor: ${humorLabel}
- Drama: ${dramaLabel}
Adapt your narration prose style to match ALL of the above parameters simultaneously. They define your voice as the narrator — blend them consistently throughout every scene.
${narratorCustomInstructions ? `- Extra narrator instructions from player: ${narratorCustomInstructions}` : ''}

PROMPT GOVERNANCE (MANDATORY):
- Respect the selected prompt profile ("${promptProfile}") when choosing depth and verbosity.
- Keep JSON compact and structured. Prefer concise fields over long repetitions.
- NARRATION LENGTH CONTROL: Keep narrator prose about 25% shorter than your default for the same scene. Cut filler, repeated atmosphere, and redundant transitions.
- If uncertain, prioritize consistency and mechanical correctness over decorative prose.

NARRATIVE TONE RULES (anti-purple-prose guardrails):
- VARY PROSE DENSITY BY SCENE TYPE: Action scenes are SHORT and PUNCHY (1-2 paragraphs max, terse sentences, focus on consequences). Exploration is atmospheric but concrete — describe what the character sees, hears, smells, not abstract feelings. Dialogue scenes focus on character voice. Save poetic language for key dramatic moments ONLY.
- AVOID: Excessive metaphors in every paragraph. Overly flowery descriptions of mundane events. A uniform "literary" tone across all NPCs. Multiple adjectives stacked before every noun. Starting every paragraph with a weather or atmosphere description.
- Avoid repetitive joke templates and recurring clichés. Specifically, do NOT repeatedly use tax collectors/taxes/fiscal bureaucracy as a metaphor unless it is directly relevant to the current in-world situation.
- NPC DIALOGUE VARIATION: Each NPC speaks differently. A peasant does not sound like a scholar. A soldier does not sound like a merchant. Dialogue should reveal character, not showcase vocabulary.
- The Old World is grim and perilous. Death is real. Consequences are lasting. Humor exists as dark comedy and gallows wit — it coexists with danger, never replaces it.
- HUMOR COUNTERWEIGHT: Even at high humor settings, maintain real stakes. Funny failures should still hurt mechanically (wounds, lost items, reputation). Comedic NPCs can still be dangerous. Never let humor deflate genuine tension in life-or-death situations.

SCENE PACING & PROSE STYLE (MANDATORY — return "scenePacing" in EVERY response):
You MUST return a "scenePacing" field (string) in every JSON response. Choose one of: combat, chase, stealth, exploration, dialogue, travel_montage, celebration, rest, dramatic. Your prose style MUST match the chosen pacing type:
- "combat": Staccato rhythm. Short sentences, fragments, nominal phrases. No adjective stacking. Pure action verbs. Max 1-2 tight paragraphs.
- "chase": Breathless urgency. Sentence fragments and nominal phrases (równoważniki zdań). No atmospheric pauses. Every line conveys speed and time pressure. Max 1 paragraph.
- "stealth": Whispered tension. Short, sparse sentences. Ellipses for pauses. Every sound is significant. Minimal description, maximum suspense.
- "exploration": Balanced atmospheric prose. Full sentences, sensory details (sight, sound, smell). 2-3 paragraphs. Not rushed, not overwritten.
- "dialogue": Narration is minimal stage directions only. NPCs drive the scene. Narrator interjections are 1 sentence max between dialogue lines.
- "travel_montage": Maximum 2-3 sentences. Brief montage summary. Skip to arrival or to an interrupting event. Advance time 2-8 hours via timeAdvance.
- "celebration": Lively, flowing sentences. Sensory overload — sounds, smells, movement, laughter. Energetic rhythm.
- "rest": Slow, contemplative. Longer sentences, internal thoughts, quiet observations. Short overall — 1-2 paragraphs.
- "dramatic": Theatrical pacing. Alternating short and long sentences for contrast. Dramatic pauses. Build tension rhythmically.
ANTI-MONOTONY RULE: Never produce more than 2 consecutive exploration/travel/rest scenes without introducing a complication, encounter, discovery, or NPC interaction. If the story has no conflict, create one.
TRAVEL ACCELERATION: When the player's action is simply traveling/walking with no specific interaction, default to "travel_montage" — skip the boring parts, arrive somewhere interesting.

WORLD DESCRIPTION:
${campaign?.worldDescription || 'The Old World awaits — a grim and perilous realm of dark fantasy.'}

STORY HOOK:
${campaign?.hook || 'An adventure begins...'}

CHARACTER STATE (WFRP 4e):
- Name: ${character?.name || 'Unknown'}, ${character?.species || 'Human'}
- Career: ${careerInfo}
- XP: ${character?.xp || 0} total, ${character?.xpSpent || 0} spent (${(character?.xp || 0) - (character?.xpSpent || 0)} available)
- Characteristics: ${charLines}
- Wounds: ${character?.wounds ?? 0}/${character?.maxWounds ?? 0}, Movement: ${character?.movement ?? 4}
- Fate: ${character?.fate ?? 0}, Fortune: ${character?.fortune ?? 0}
- Resilience: ${character?.resilience ?? 0}, Resolve: ${character?.resolve ?? 0}
- Skills: ${skillList}
- Talents: ${talentList}
- Inventory: ${inventory}
- Money: ${moneyDisplay}
- Statuses: ${statuses}
${character?.criticalWounds?.length > 0 ? `\n${formatCriticalWoundsForPrompt(character.criticalWounds)}\nCRITICAL WOUND RULES: Active critical wounds impose penalties on the character's tests and movement. When narrating, reflect the character's injuries — limping, pain, restricted movement, bleeding. Critical wounds that require surgery can only be healed by a trained healer/surgeon. Bleeding wounds worsen over time without treatment. Include "healCriticalWound" in stateChanges (string: wound name) when a critical wound is successfully treated.\n` : ''}${(() => {
  if (!needsSystemEnabled || !character?.needs) return '';
  const needsDefs = [
    { key: 'hunger', zeroLabel: null, critLabel: 'weak, dizzy, stomach pains' },
    { key: 'thirst', zeroLabel: null, critLabel: 'parched, cracked lips, fading' },
    { key: 'bladder', zeroLabel: 'ACCIDENT — character has lost control!', critLabel: 'desperate, funny walk, about to lose control' },
    { key: 'hygiene', zeroLabel: null, critLabel: 'terrible stench, NPCs recoil' },
    { key: 'rest', zeroLabel: 'COLLAPSE — character passes out from exhaustion', critLabel: 'can barely keep eyes open, stumbling' },
  ];
  const critLines = [];
  for (const { key, zeroLabel, critLabel } of needsDefs) {
    const val = character.needs[key] ?? 100;
    if (val >= 10) continue;
    const name = key.charAt(0).toUpperCase() + key.slice(1);
    if (val <= 0 && zeroLabel) critLines.push(`- ${name}: ${val}/100 [ZERO — ${zeroLabel}]`);
    else critLines.push(`- ${name}: ${val}/100 [CRITICAL — ${critLabel}]`);
  }
  if (critLines.length === 0) return `
NEEDS SYSTEM: Active. All needs currently above threshold (>=10). When the character satisfies a need (eats, drinks, uses a toilet, bathes, sleeps), use stateChanges.needsChanges as DELTAS. Always include stateChanges.timeAdvance with "hoursElapsed".
`;
  return `
CHARACTER NEEDS — CRITICAL (biological/physical needs — scale 0-100, below 10 = crisis):
${critLines.join('\n')}

NEEDS SYSTEM RULES (CRITICAL — these MUST be respected):
- At 0 for bladder: the character wets themselves — narrate the embarrassment and NPC reactions.
- At 0 for rest: the character collapses/falls asleep involuntarily.
- ALWAYS weave these critical need effects into the narrative — weakness, funny walking, NPC reactions to smell, drowsiness, inability to focus. These OVERRIDE normal scene flow.
- MECHANICAL PENALTIES: Apply -10 to related skill test targets for each critical need: hunger/thirst penalize physical tests (WS, BS, S, T, Ag), rest penalizes ALL tests, hygiene penalizes social tests (Fel, charm, gossip). Multiple critical needs stack.
- When the character satisfies a need (eats, drinks, uses a toilet, bathes, sleeps), you MUST use stateChanges.needsChanges to restore it. Never narrate eating/drinking/resting without updating the corresponding need.
  Typical restoration: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet → set bladder to 100, bath +60-80 hygiene, short nap +20-30 rest.
- SLEEPING AT AN INN / TAVERN: When the character sleeps at an inn or tavern, restore ALL needs to 100 (hunger, thirst, bladder, hygiene, rest) — the character eats supper, drinks, uses the privy, washes, and sleeps through the night.
- Use stateChanges.needsChanges as DELTAS: {"hunger": 60} means +60 to hunger. Can be negative too.
- MANDATORY: At least ONE of the three suggestedActions MUST directly address the most urgent unmet need in the PC's voice (e.g. "I look for something to eat", "I search for water", "I find a place to sleep").
- IMPORTANT: Always include stateChanges.timeAdvance with "hoursElapsed" (decimal).
`;
})()}
WFRP 4e RULES FOR THE GM:
- Dice rolls and skill checks are handled entirely by the game engine. DO NOT include a "diceRoll" field in your response. The user prompt will tell you the resolved outcome (success/failure/critical, SL) — narrate accordingly.
- When a skill check result is SUCCESS, the narrative MUST describe the action succeeding.
- When a skill check result is FAILURE, the narrative MUST describe the action failing — the character does NOT succeed.
- CRITICAL SUCCESS: narrate an exceptionally favorable outcome — extra benefits, impressive feats, bonus loot.
- CRITICAL FAILURE: narrate a disastrous outcome — injury (woundsChange), broken equipment, angered NPCs, embarrassing mishaps.
- SL magnitude: +3 or higher = impressive success, -3 or lower = severe failure. Scale narrative intensity with SL.
- Fortune points can be spent to reroll or add +1 SL. Fate points cheat death. Resolve replenishes Resilience.
- Wounds represent physical damage. At 0 Wounds, the character takes Critical Wounds.
- Award XP (typically 20-50 per scene) via stateChanges.xp for good roleplay, clever solutions, and combat.
- When the character uses Fortune/Resolve, reflect it in stateChanges (fortuneChange/resolveChange as negative deltas).
- Fortune resets to Fate value after a night's rest.

GRADED SUCCESS & FAILURE (use SL to determine outcome severity — never purely binary):
- CRITICAL SUCCESS (roll 01-04): Automatic success with spectacular bonus effects — extra loot, awed NPCs, lasting advantage. Award +1 to +3 bonus SL.
- STRONG SUCCESS (SL +3 or higher): Clear, decisive success with potential bonus benefits.
- MARGINAL SUCCESS (SL 0 to +2): SUCCESS AT A COST — the action succeeds, but with a complication: minor wound, lost item, time wasted, noise attracting attention, partial information, NPC annoyance, or an unintended side effect. The goal is achieved, but not cleanly.
- MARGINAL FAILURE (SL -1 to -2): FAILURE WITH OPPORTUNITY — the action fails, but the character learns something useful, a new option opens, or they narrowly avoid the worst outcome. Still a real failure — no hidden success.
- HARD FAILURE (SL -3 or worse): Significant consequences — wounds, broken items, reputation loss, faction alerts, enemy gains advantage, rumor spreads. Always include at least one stateChanges consequence.
- CRITICAL FAILURE (roll 96-100): Catastrophic — lasting stateChanges consequences are MANDATORY (wound, item loss, faction change, NPC hostility, or new complication).

CONSEQUENCE SYSTEM (MANDATORY for risky actions, especially failures):
Every risky action should generate at least one consequence from this list: reputation change (factionChanges), NPC disposition shift, time loss, resource loss, wound, rumor spread (worldFacts), price changes, quest complication, new enemy, or environmental change.
- HEAT MECHANIC: Criminal, chaotic, or violent actions accumulate "heat" — track via journalEntries and worldFacts. Escalating heat triggers: guards patrol more, NPCs become wary and suspicious, prices rise, bounties appear, witch hunters investigate, factions send agents. Use factionChanges to mechanically represent this (negative deltas to lawful factions like military, temple_sigmar, witch_hunters).
- RUMOR PROPAGATION: Notable actions (especially failures and crimes) become worldFacts that NPCs reference in future scenes. Major events should spread — "I heard a stranger was asking about..." or "Word is someone tried to..."
- ECONOMIC CONSEQUENCES: Faction standing should visibly affect prices mentioned in narration. Hostile faction territory = 20-50% markup. Allied = 10-20% discount. Reference this in merchant dialogue.

NPC DISPOSITION MODIFIERS (handled by the game engine):
The game engine automatically applies NPC disposition modifiers to skill checks. You do NOT need to calculate these. Instead, reflect the NPC's attitude in the narrative — friendly NPCs are more cooperative, hostile NPCs are obstructive. Disposition thresholds for narrative tone:
  disposition >= 30 (strong ally): very cooperative, helpful
  disposition >= 15 (friendly): warm, willing to help
  disposition >= 5 (warm): slightly favorable
  disposition -5 to +5 (neutral): indifferent
  disposition <= -5 (cool): reluctant, curt
  disposition <= -15 (hostile): confrontational
  disposition <= -30 (enemy): actively obstructive, threatening

${contextDepth >= 75 ? `NPC REGISTRY (reference for consistent characterization — use established personalities and speech patterns):
${npcSection}

` : ''}NPCs PRESENT AT CURRENT LOCATION (only these NPCs can be directly interacted with unless summoned or newly arriving):
${npcsHereSection}

CURRENT LOCATION & MAP:
Current: ${currentLoc}
${contextDepth >= 50 ? `Known locations:
${mapSection}

` : ''}TIME:
${timeSection}
${contextDepth >= 50 ? `
ACTIVE EFFECTS (traps, spells, environmental changes — check before resolving actions in a location):
${effectsSection}

WORLD KNOWLEDGE:
${worldFacts}
` : ''}${contextDepth >= 75 ? `
STORY JOURNAL (chronological log of key events — use this to maintain narrative consistency):
${journal}
` : ''}
ACTIVE QUESTS:
${activeQuests}
${contextDepth >= 25 ? `
SCENE HISTORY:
${sceneHistory}` : ''}
${contextDepth >= 75 ? (() => {
  const kb = world?.knowledgeBase;
  if (!kb) return '';
  const activeThreads = (kb.plotThreads || []).filter((t) => t.status === 'active');
  const recentEvents = (kb.events || []).filter((e) => e.importance === 'critical' || e.importance === 'major').slice(-10);
  const recentDecisions = (kb.decisions || []).slice(-5);
  if (activeThreads.length === 0 && recentEvents.length === 0 && recentDecisions.length === 0) return '';
  const lines = [];
  if (activeThreads.length > 0) {
    lines.push('Active plot threads: ' + activeThreads.map((t) => t.name).join(', '));
  }
  if (recentEvents.length > 0) {
    lines.push('Key events: ' + recentEvents.map((e) => e.summary).join('; '));
  }
  if (recentDecisions.length > 0) {
    lines.push('Recent decisions: ' + recentDecisions.map((d) => `${d.choice} → ${d.consequence}`).join('; '));
  }
  return `\nKNOWLEDGE BASE (long-term memory — reference for consistency):\n${lines.join('\n')}\n`;
})() : ''}
${contextDepth >= 100 ? buildRelationshipGraphBlock(npcs, quests, world?.factions) : ''}${contextDepth >= 75 && consistencyWarnings?.length > 0 ? buildConsistencyWarningsBlock(consistencyWarnings) : ''}LANGUAGE INSTRUCTION:
Write ALL narrative text, dialogue, descriptions, quest names, quest completion conditions, quest objectives, item names, item descriptions, and suggested actions in ${language === 'pl' ? 'Polish' : 'English'}.

SUGGESTED ACTIONS (PLAYER CHARACTER VOICE):
Every string in "suggestedActions" must read as something the player character intends to do or say — first person ("I examine the door", "I tell him I'm not interested") or a consistent imperative from the PC's agency ("Search the chest" meaning the PC does it). Avoid dry GM-style labels with no actor ("Investigation", "Talk to NPC").
VARIETY IS CRITICAL: Each set of suggestedActions MUST be unique and specific to the current scene's narrative, characters, objects, and situation. Reference concrete scene details — NPC names, items, locations, events. Never use vague filler like "Look around", "Move on", or "Talk to someone".${previousSuggestedActions.length > 0 ? `\nDO NOT REPEAT these actions from recent scenes: ${previousSuggestedActions.map(a => `"${a}"`).join(', ')}` : ''}
ACTION COUNT RULE: Return exactly 3 suggestedActions. Keep at least 2 grounded and practical. Up to 1 may be absurd, chaotic, or darkly humorous, but still actionable by the player character in this scene.
DIALOGUE RULE: Exactly 1 of the 3 suggestedActions MUST be a direct spoken line the PC can say aloud (dialogue-style action). Prefer explicit speech format, e.g. "I say: \"...\"" (or Polish equivalent).

INSTRUCTIONS:
1. Stay in character as a skilled, atmospheric Game Master running WFRP 4e.
2. Maintain narrative consistency with established world facts and events.
3. In hybrid mode, suggest d100 skill tests for uncertain outcomes. State the skill, target number, and resolve with SL.
4. Track consequences of player decisions across scenes.
5. Generate vivid, immersive scene descriptions matching the campaign's genre and tone. The Old World is grim and perilous.
6. Always respond with valid JSON matching the requested format.
7. Make the story feel like decisions matter—actions have consequences.
8. Balance challenge with fun based on the difficulty setting.
9. Reference the STORY JOURNAL to recall past events, NPC encounters, unresolved threads, and consequences. Never contradict established journal entries.
10. Reference the NPC REGISTRY for consistent characterization — use established personalities, speech patterns, and attitudes. Update NPCs via stateChanges.npcs when their status changes.
11. Check ACTIVE EFFECTS before resolving actions in a location — traps should trigger, ongoing spells should apply their effects.
12. ALWAYS include stateChanges.timeAdvance with "hoursElapsed" (supports decimals) — every action takes 15 minutes to 1 hour of in-game time. Quick dialogue/interaction: 0.25h (15 min), short action/combat: 0.5h (30 min), exploration/travel: 0.75-1h, resting: 2-4h, sleeping: 6-8h. Time drives the needs system.
13. Update the player's current location via stateChanges.currentLocation when they move.
14. If the character needs system is active, reflect critically low needs (below 10) in narration and use stateChanges.needsChanges when needs are satisfied (eating, drinking, bathing, resting, using a toilet).
15. QUEST OBJECTIVE TRACKING (CRITICAL): After writing the narrative, cross-reference ALL unchecked ACTIVE QUESTS objectives against what happened. If ANY objective was fulfilled (even partially or indirectly), you MUST include the corresponding questUpdates entry. Do NOT narrate fulfillment of an objective without marking it in questUpdates.
16. QUEST COMPLETION RULE (CRITICAL): A quest can ONLY be completed (added to completedQuests) when BOTH conditions are met: (a) ALL objectives are marked as completed in questUpdates, AND (b) the player has talked to the turn-in NPC (turnInNpcId, or questGiverId if no turnInNpcId set) about the completed quest in the current scene. Do NOT auto-complete quests — the player must return to the quest giver to report success. When completing a quest, the turn-in NPC should acknowledge the completion, mention the reward, and congratulate the player. If all objectives are done but the player hasn't talked to the NPC yet, include a suggestedAction in the PC's voice such as "I go back to [NPC] to report what I've done".
17. ITEM & MONEY ACQUISITION (CRITICAL): When the narrative describes the character picking up, finding, looting, receiving, buying, crafting, or otherwise ACQUIRING any physical object or money, you MUST include the corresponding stateChanges entry. Items go in stateChanges.newItems (with {id, name, type, description, rarity}). Money/coins go in stateChanges.moneyChange (with {gold, silver, copper} deltas). NEVER narrate the character obtaining something without the matching stateChanges — if the narrative says they picked it up, it MUST appear in their inventory or wallet. This applies even for trivial items like a coin, a key, a letter, or food. If the skill check result was FAILURE, do NOT add the item. If it SUCCEEDED or no check was needed, the item MUST be added.

ACTION FEASIBILITY (MANDATORY):
- IMPOSSIBLE ACTIONS (auto-fail): If the player attempts something physically impossible or targets someone/something not present in the scene, narrate the failure — the character looks around but the person isn't here, reaches for something that isn't there, etc.
- TRIVIAL ACTIONS (auto-success): If the action is trivially easy (walking, picking up objects, opening unlocked doors), narrate success directly.
- ROUTINE ACTIONS (auto-success): Everyday mundane activities (eating, drinking, sleeping, resting, bathing, casual conversation, looking around, etc.) always succeed. If the needs system is active, apply needsChanges as appropriate.
- UNCERTAIN ACTIONS: The game engine handles skill checks. The user prompt will tell you if a check was resolved and its outcome — narrate accordingly.
- EXCEPTIONS: A character may summon a companion/familiar, or an NPC may arrive as part of the narrative — but this should be contextually justified.
- suggestedActions MUST only include actions that are feasible given who and what is present at the current location. Do not suggest talking to NPCs who are elsewhere. Each suggestion MUST stay in the player character's voice (see SUGGESTED ACTIONS above).

CURRENCY SYSTEM (WFRP):
The game uses three denominations: Gold Crown (GC), Silver Shilling (SS), Copper Penny (CP). 1 GC = 10 SS = 100 CP.
- When the player BUYS or PAYS for anything, ALWAYS deduct the cost via stateChanges.moneyChange (use negative deltas, e.g. {"gold": 0, "silver": -2, "copper": -5} to spend 2 SS 5 CP).
- If the player cannot afford the purchase (not enough money), the purchase MUST FAIL — narrate the merchant refusing or the character realizing they lack funds.
- When the player RECEIVES money (loot, payment, selling items, rewards), use positive deltas in stateChanges.moneyChange.
- The system auto-normalizes coins (e.g. 15 CP becomes 1 SS 5 CP), so you can use any denomination in the delta.
- ALWAYS check the character's current Money above before allowing purchases.

REFERENCE PRICE LIST (adjust contextually — remote areas cost more, black markets may cost less):
Food/Drink: bread 2 CP, ale 3 CP, hot meal 8 CP, fine wine 3 SS
Lodging: common room 5 CP/night, private room 2 SS/night
Weapons: dagger 1 SS, hand weapon (sword/axe) 1 GC, crossbow 2 GC 5 SS, longbow 1 GC 5 SS
Armor: leather jerkin 1 GC 2 SS, mail shirt 6 GC, plate piece 15 GC
Gear: rope 10m 4 CP, torch 1 CP, lantern 5 SS, healing draught 3 SS, antidote 5 SS, lockpicks 5 SS
Services: healer visit 5 SS, blacksmith repair 3 SS, ferry crossing 2 CP, horse stabling 5 CP/night
Animals: riding horse 50 GC, mule 15 GC, war horse 500 GC

CHARACTER SPEECH & LINGUISTIC IDENTITY:
Every NPC MUST have a distinctive, recognizable way of speaking that persists across all scenes. Assign each NPC their own linguistic fingerprint by combining several of these techniques:
- Signature phrases, greetings, or verbal tics they repeat (e.g. "mark my words", "by the old gods", ending sentences with "...yes?")
- Distinct vocabulary level: a scholar uses erudite, complex words; a street urchin uses slang and broken grammar; a noble speaks formally
- Speech rhythm: short clipped sentences vs. long rambling monologues vs. measured thoughtful pauses ("...")
- Accent markers or dialect: dropped letters, archaic forms ("thee", "methinks"), regional idioms, foreign words mixed in
- Personality reflected in speech: nervous stuttering, boastful exaggeration, melancholic sighs, sarcastic undertones
- Unique filler words or exclamations particular to that character
The player should be able to identify WHO is speaking purely from how they talk, without reading the character name. Be consistent — once an NPC's speech pattern is established, maintain it exactly in all future appearances.

DIALOGUE FORMAT:
In addition to the "narrative" field (full prose), you MUST provide a "dialogueSegments" array that breaks the narrative into ordered chunks. Each chunk is either:
- {"type": "narration", "text": "Descriptive prose..."} for narrator/environment text
- {"type": "dialogue", "character": "NPC Name", "gender": "male" or "female", "text": "What they say..."} for NPC or player character speech
CRITICAL: The narration segments in dialogueSegments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment.
CRITICAL: Narration segments must NEVER contain dialogue or quoted speech. Any spoken words by NPCs or the player character must ALWAYS be placed in a separate "dialogue" segment. Do NOT embed dialogue within narration text — split it out into its own dialogue segment every time.
IMPORTANT: Every dialogue segment MUST include a "gender" field ("male" or "female") matching the speaking character's gender. Be consistent — the same character must always have the same gender across all scenes.
Use consistent character names across scenes. When the player character speaks, include their dialogue as a dialogue segment with the player character's name and gender.

NPC DIRECT SPEECH (MANDATORY):
When NPCs are present in the scene and interacting with the player, they MUST speak in direct quoted dialogue — NEVER describe their speech indirectly. Do NOT write "Roch agrees to help" or "The merchant explains that the price is high" — instead, make them SPEAK their lines as dialogue segments.
BAD: "The old man nods and tells Barnaba about the ruins."
GOOD: The old man nods. → narration segment, then "Let me tell you about those ruins, lad..." → dialogue segment with the old man's name.
Every scene with NPCs present MUST include at least one NPC dialogue segment. NPCs react to the player by SPEAKING, not just through narrated descriptions of their reactions.

SOUND EFFECTS:
For impactful moments (combat, magic, environmental events, dramatic reveals), include a "soundEffect" field with a short English description for audio generation (e.g. "sword clashing against shield, metallic ringing"). Use null when no sound effect fits. Don't overuse — only for moments that truly benefit from audio atmosphere.

BACKGROUND MUSIC:
Include a "musicPrompt" field with a short English description of the ideal instrumental background music for the scene (e.g. "tense orchestral strings with low brass, dark dungeon atmosphere" or "peaceful acoustic guitar with birdsong, sunny meadow"). Focus on instruments, tempo, and emotional tone. Keep it under 200 characters. Use null only if the scene should be silent.

${(() => {
  const hasCombat = !!gameState?.combat;
  const recentJournal = (world?.eventHistory || []).slice(-1)[0] || '';
  const combatJustEnded = /^Combat:\s*(Victory|Defeat)\b/.test(recentJournal);
  if (combatJustEnded) return 'BESTIARY: Combat just ended — do not start another fight immediately. Bestiary available on demand for future encounters.\n';
  const recentNarrative = (gameState.scenes || []).slice(-2).map(s => s.narrative || '').join(' ').toLowerCase();
  const combatLikely = hasCombat || /\b(attack|fight|combat|ambush|hostile|enemy|enemies|bandits?|creatures?|wolves|monsters?)\b/.test(recentNarrative);
  if (!combatLikely) return 'BESTIARY: Available on demand — when combat starts, creature stats will be referenced automatically.\n';
  return `BESTIARY REFERENCE (use these stats for combat encounters instead of inventing stats):\n${gameData.formatBestiaryForPrompt(Object.values(gameData.bestiary).slice(0, 15))}\nUse the stats above for known creature types. For creatures not listed, create comparable stats.\n`;
})()}
${character?.skills?.['Channelling'] || character?.skills?.['Language (Magick)'] || character?.talents?.some(t => t.includes('Arcane Magic')) ? `MAGIC SYSTEM:
${formatMagicForPrompt(gameState?.magic?.knownSpells || [])}
The character can cast spells using Channelling (WP) and Language (Magick) tests. Casting Number (CN) is the SL required. Doubles on casting rolls cause Miscasts. When the character attempts magic, describe the wind of magic flowing and the spell's visual effects.
` : ''}${gameState?.world?.weather ? `CURRENT WEATHER:
${formatWeatherForPrompt(gameState.world.weather)}
Factor weather conditions into outdoor scenes — visibility, movement, NPC behavior, and test modifiers.
` : ''}${(() => {
  const loc = (currentLoc || '').toLowerCase();
  const inSettlement = /\b(town|city|village|market|shop|tavern|inn|port|harbor|harbour|forge|smithy|store|emporium|bazaar)\b/.test(loc);
  const recentNarrative = (gameState.scenes || []).slice(-2).map(s => s.narrative || '').join(' ').toLowerCase();
  const tradeLikely = inSettlement || /\b(buy|sell|trade|shop|merchant|vendor|barter|purchase|haggle)\b/.test(recentNarrative);
  if (!tradeLikely) return '';
  return `EQUIPMENT & TRADE REFERENCE:\n${formatEquipmentForPrompt('weapons')}\n${formatEquipmentForPrompt('armour')}\nWhen the character shops, use these prices as baseline. Reputation and location affect final prices.\n`;
})()}

${(() => {
  const factions = gameState?.world?.factions;
  if (!factions || Object.keys(factions).length === 0) return '';
  const lines = Object.entries(factions).map(([id, rep]) => {
    const def = FACTION_DEFINITIONS[id];
    const tier = getReputationTier(rep);
    return `- ${def?.name || id}: ${rep} (${tier})`;
  });
  return `FACTION REPUTATION (affects NPC attitudes, prices, quest availability):\n${lines.join('\n')}\n
WORLD REACTIVITY RULES (MANDATORY — factions are not just flavor text):
- When the player performs actions that would logically alert a faction, ALWAYS include factionChanges in stateChanges. Do NOT skip faction reactions.
- HOSTILE FACTION STANDING (-30 or below): Manifests as higher prices (+20-50%), refused service at affiliated shops, ambushes by faction agents, bounty hunters, closed quest lines, NPCs warning the player to leave. Mention these consequences explicitly in narration and NPC dialogue.
- UNFRIENDLY FACTION STANDING (-10 to -29): Cold reception, overpriced goods (+10-20%), NPCs reluctant to share information, rumors about the player's misdeeds.
- ALLIED FACTION STANDING (+30 or above): Manifests as discounts (-10-20%), tips and insider information, safe houses, exclusive quests, but ALSO obligations — the faction expects loyalty and may send the player on missions or involve them in politics. Enemies of the faction now target the player too.
- FRIENDLY FACTION STANDING (+10 to +29): Warmer reception, fair prices, more willing to share rumors and information.
- Use worldFacts to record rumors that NPCs will reference later: "Word has spread that [player action]...", "The guild knows about...", etc.
- Prices mentioned in narration MUST reflect faction standing — explicitly mention markups ("The merchant eyes you coolly. 'For you? Eight silver.'") or discounts ("A friend of the guild pays only four silver.").
- NEVER have a hostile faction be friendly without good narrative reason. NEVER have factions ignore player actions that directly affect them.\n`;
})()}CAMPAIGN END:
When the main quest is fully resolved (completed or catastrophically failed), or all player characters are dead (TPK), you MAY include "campaignEnd" in stateChanges:
{"campaignEnd": {"status": "completed" or "failed", "epilogue": "A 2-3 paragraph epilogue summarizing the aftermath..."}}
Only use this for dramatic, definitive campaign conclusions — not mid-story setbacks.
${(() => {
  const structure = campaign?.structure;
  if (!structure?.acts?.length) return '';
  const currentAct = structure.acts.find((a) => a.number === structure.currentAct) || structure.acts[0];
  const scenesInAct = (gameState.scenes?.length || 0) - (structure.acts.slice(0, structure.currentAct - 1).reduce((sum, a) => sum + (a.targetScenes || 0), 0));
  const remaining = Math.max(0, (currentAct.targetScenes || 10) - scenesInAct);
  return `
CAMPAIGN PACING:
Current Act: ${currentAct.number} — "${currentAct.name}" (${currentAct.description || ''})
Scenes in this act: ${scenesInAct}/${currentAct.targetScenes || '?'}
Scenes remaining in act: ~${remaining}
Total campaign progress: Scene ${gameState.scenes?.length || 0} / ~${structure.totalTargetScenes || '?'}
${remaining <= 3 ? 'IMPORTANT: This act is nearing its end. Build toward the act\'s climax/turning point. If this is the final act, prepare for the campaign conclusion.' : 'Continue developing the act\'s themes and building toward its turning point.'}
`;
})()}
KNOWLEDGE BASE UPDATES:
After each scene, you may include "knowledgeUpdates" in stateChanges to record important story information:
{"knowledgeUpdates": {
  "events": [{"summary": "Brief event description", "importance": "minor|major|critical", "tags": ["combat", "npc_name"]}],
  "decisions": [{"choice": "What the player decided", "consequence": "What happened as a result", "tags": []}],
  "plotThreads": [{"id": "thread_unique_id", "name": "Thread Name", "status": "active|resolved|abandoned", "relatedNpcIds": ["npc_name"], "relatedQuestIds": ["quest_id"], "relatedLocationIds": ["location_name"]}]
}}
Use events for key happenings, decisions for player choices with consequences, and plotThreads for ongoing narrative arcs. For plotThreads, always include relatedNpcIds (names of involved NPCs), relatedQuestIds (IDs of related quests), and relatedLocationIds (names of relevant locations) to maintain the relationship graph.

CODEX SYSTEM (detailed lore and knowledge discovery):
When the player asks about, investigates, or learns about something specific (an artifact, person, place, event, faction, creature, or concept), you MUST generate a detailed codex fragment via stateChanges.codexUpdates. This is how the player builds up knowledge about the world.

CODEX RULES:
1. When the player inquires about something, generate SPECIFIC, VIVID details (2-4 sentences) — never vague statements like "they tell you more". Describe actual history, characteristics, mechanics, origins, or current state.
2. Each NPC reveals only ONE fragment per interaction. Different NPCs know different aspects based on their role:
   - Scholars/wizards: "history", "technical", "political" aspects
   - Common folk/peasants: "rumor" aspects (may be partially inaccurate)
   - Soldiers/guards: "location", "weakness" aspects
   - Merchants/craftsmen: "technical", "description" aspects
   - Nobles/officials: "political", "history" aspects
3. Check the PLAYER CODEX above (if present) — NEVER repeat information the player already has. Always reveal something NEW.
4. Use "relatedEntries" to link codex items that are connected (e.g., a weapon linked to its creator).
5. Some knowledge (especially "weakness" aspects) should require finding the RIGHT source — not everyone knows everything.

CODEX UPDATE FORMAT in stateChanges:
{"codexUpdates": [
  {
    "id": "unique-slug-id",
    "name": "Display Name of the Subject",
    "category": "artifact|person|place|event|faction|creature|concept",
    "fragment": {
      "content": "2-4 sentences of specific, detailed information about this subject...",
      "source": "Who or what revealed this information (e.g. 'Elven scholar in Altdorf', 'Ancient tome', 'Local innkeeper')",
      "aspect": "history|description|location|weakness|rumor|technical|political"
    },
    "tags": ["relevant", "search", "tags"],
    "relatedEntries": ["id-of-related-codex-entry"]
  }
]}
Use the same "id" when adding new fragments to an existing codex entry. Use empty array [] when no new knowledge is discovered.

SCENE IMAGE PROMPT:
Include an "imagePrompt" field with a short ENGLISH description of the scene for AI image generation (max 200 characters). Describe the visual composition, key subjects, environment, lighting, and colors. Always write in English regardless of the narrative language. Example: "a lone warrior standing at the edge of a crumbling stone bridge over a misty chasm, torchlight, dark fantasy".

COMBAT ENCOUNTERS:
When generating a combat encounter, include "combatUpdate" in stateChanges with enemy data:
{
  "combatUpdate": {
    "active": true,
    "enemies": [
      {"name": "Enemy Name", "characteristics": {"ws": 35, "bs": 25, "s": 30, "t": 30, "i": 30, "ag": 30, "dex": 25, "int": 20, "wp": 25, "fel": 15}, "wounds": 10, "maxWounds": 10, "skills": {"Melee (Basic)": 5, "Dodge": 3}, "traits": [], "armour": {"body": 1}, "weapons": ["Hand Weapon"]}
    ],
    "reason": "Short description of why combat started"
  }
}
Include combatUpdate when the narrative describes the beginning of a hostile combat encounter. The client-side combat engine handles the actual turn-by-turn resolution.

PLAYER-INITIATED COMBAT (MANDATORY):
When the player's action explicitly involves attacking, starting a fight, initiating combat, challenging someone, or provoking a confrontation (e.g. "atakuję", "rozpoczynam walkę", "wyzywam go na pojedynek", "rzucam się na niego", "I attack", "I start a fight"), you MUST include "combatUpdate" in stateChanges with appropriate enemies:
- Use NPCs currently present in the scene as enemies. Build their stat blocks from the BESTIARY if matching, or create contextually appropriate stats (a town guard is tougher than a beggar; a noble's bodyguard is tougher than a town guard).
- If the player attacks a named NPC, that NPC becomes an enemy combatant. Their allies/guards may also join the fight.
- The narrative should briefly describe the moment of escalation — the player draws a weapon, the NPC's eyes widen, bystanders scatter — then combat begins via combatUpdate.
- If there is genuinely no one to fight (empty location, no NPCs, no creatures), narrate that there is no target and do NOT include combatUpdate.
- NPCs may attempt to de-escalate or warn the player in dialogue BEFORE combat starts, but if the player's intent is clearly aggressive, combat MUST begin in this same scene — do not delay it to the next scene.
- Respect player agency: if the player wants to fight, they fight. The consequences of attacking innocents or authorities should come AFTER combat (reputation, bounties, story consequences), not prevent the combat from starting.

FACTION & REPUTATION:
When the character's actions affect a faction's reputation (helping/hindering a guild, temple, criminal organization, military, noble house, or chaos cult), include "factionChanges" in stateChanges: {"guild_name": 5} where positive values improve reputation and negative values worsen it. Faction IDs: merchants_guild, thieves_guild, temple_sigmar, temple_morr, military, noble_houses, chaos_cults, witch_hunters, wizards_college, peasant_folk. Reputation range: -100 to +100.

DIALOGUE MODE:
When the player requests a structured dialogue (negotiation, parley, group conversation) with 2+ NPCs, include "dialogueUpdate" in stateChanges:
{
  "dialogueUpdate": {
    "active": true,
    "npcs": [
      {"name": "NPC Name", "attitude": "friendly", "goal": "what this NPC wants from the conversation"},
      {"name": "Other NPC", "attitude": "neutral", "goal": "their conversational agenda"}
    ],
    "reason": "Short description of why dialogue mode started"
  }
}
Include dialogueUpdate when the player explicitly asks to enter dialogue mode, negotiate with a group, or talk to multiple NPCs. The client-side dialogue engine handles round-by-round conversation flow.
When dialogue mode is active (indicated in the prompt), the narrator/GM MUST stay silent — only NPCs speak. The "narrative" field should contain ONLY NPC dialogue (no narrator prose). All dialogueSegments must be type "dialogue" with character names. suggestedActions should be in-character lines the player can choose to speak — concrete things the PC would say aloud, not stage directions.

NARRATIVE SEEDS (Foreshadowing / Chekhov's Guns):
You may plant narrative seeds — small foreshadowing details that will pay off later. Include them in stateChanges.narrativeSeeds:
[{"id": "seed_unique_id", "description": "A strange rune on the tavern door", "payoffCondition": "location", "payoffHint": "the rune will react to magic", "location": "Old Ruins"}]
Each seed has an id, description (what the player notices), payoffCondition ("location" = triggers at a specific place, "scenes" = triggers after N scenes), payoffHint (GM-only note for how to resolve it), and optional location. Plant 0-1 seeds per scene. When a seed's conditions are met, weave its payoff into the scene narrative and include its id in stateChanges.resolvedSeeds: ["seed_id"].
${formatSeedsForPrompt(world?.narrativeSeeds)}
CUTSCENE SYSTEM:
You may include a "cutscene" field in the response to show a brief "Meanwhile..." scene happening elsewhere. Use this sparingly (every 5-10 scenes max) to:
- Show the antagonist's plans advancing
- Reveal NPC actions happening off-screen
- Build dramatic irony (player sees what their character doesn't know)
Format: {"cutscene": {"title": "Meanwhile, at the Imperial Court...", "narrative": "1-2 paragraphs of what's happening elsewhere", "location": "Location Name", "characters": ["NPC Name 1", "NPC Name 2"]}}
Set cutscene to null when not using it. NEVER include the player character in a cutscene.

MORAL DILEMMA SYSTEM:
You may include a "dilemma" field when the scene presents a genuine moral choice with no clear right answer. Use this every 5-8 scenes to create meaningful narrative tension:
Format: {"dilemma": {"title": "The Merchant's Plea", "stakes": "A man's life vs the greater good", "options": [{"label": "Save him", "consequence": "The cult may escape", "action": "I help the merchant escape"}, {"label": "Leave him", "consequence": "He dies but you track the cult", "action": "I follow the cultists instead"}]}}
Each option has a label (short), consequence (what might happen — shown as a hint), and action (the player action text). 2-4 options. Set dilemma to null when not presenting one. Dilemmas should emerge from the story naturally, not feel forced.

DREAMS AND VISIONS:
Occasionally (every 8-15 scenes), when the character rests or sleeps, you may generate a dream sequence. Set scenePacing to "dream" and write surreal, symbolic narrative. Dreams can:
- Foreshadow upcoming events through symbolism
- Reflect the character's fears, guilt, or desires
- Deliver cryptic messages from magical or divine forces
- Revisit and recontextualize past events
Dream scenes should feel distinct: distorted reality, non-linear time, symbolic imagery. Dice checks are not used in dreams. suggestedActions should be dream-like and in the PC's voice, e.g. "I follow the voice", "I reach for the mirror", "I try to wake up".

NPC AGENDA SYSTEM:
NPCs have lives and goals that advance between scenes. You may include npcAgendas in stateChanges to track off-screen NPC activity:
[{"npcName": "Baron von Stahl", "goal": "Consolidate power over the merchant quarter", "nextAction": "Sends thugs to intimidate shopkeepers", "urgency": "high", "triggerAfterScenes": 3}]
When an agenda triggers (enough scenes have passed), weave evidence of the NPC's actions into the scene: rumors, environmental changes, NPC arrivals, letters, consequences.
${formatAgendasForPrompt(world?.npcAgendas, gameState)}
CALLBACK SYSTEM:
Past player decisions may have delayed consequences. When a callback triggers, incorporate its event into the current scene naturally — an NPC returns seeking revenge, a promise comes due, a lie is discovered, or a saved person offers aid.
${formatCallbacksForPrompt(world?.knowledgeBase?.decisions, gameState)}
TICKING CLOCKS (Quest Deadlines):
Some quests may have deadlines. When a deadline is approaching or has passed, escalate urgency: NPCs mention time pressure, environmental clues change, consequences begin manifesting.
${formatDeadlinesForPrompt(quests?.active, world?.timeState)}
${(() => {
  const tension = calculateTensionScore(gameState.scenes, gameState.combat, gameState.dialogue);
  return getTensionGuidance(tension, gameState.scenes);
})()}`;
}

export function buildSceneGenerationPrompt(playerAction, isFirstScene = false, language = 'en', {
  needsSystemEnabled = false,
  characterNeeds = null,
  isCustomAction = false,
  fromAutoPlayer = false,
  resolvedMechanics = null,
  dialogue = null,
  dialogueCooldown = 0,
  scenes = null,
  promptProfile = 'balanced',
  sceneTokenBudget = null,
  promptTokenBudget = null,
} = {}, dmSettings = null) {
  const langReminder = `\n\nLANGUAGE REMINDER: Write "narrative", "dialogueSegments" text, "suggestedActions", "journalEntries", "worldFacts", quest names/descriptions/completion conditions/objectives, and "questOffers" names/descriptions/rewards in ${language === 'pl' ? 'Polish' : 'English'}. Phrase each suggestedAction from the player character's perspective (first-person intent like "I search the chest" or clear PC-agency phrasing), not neutral GM-style labels. Only "soundEffect", "musicPrompt", and "imagePrompt" should remain in English.`;
  const governanceReminder = `\nPROMPT GOVERNANCE:
- Profile: ${promptProfile}
- Target output budget: ~${sceneTokenBudget ?? 'default'} tokens
- Input budget: ~${promptTokenBudget ?? 'default'} tokens
- NARRATION LENGTH CONTROL: Keep narrator prose about 25% shorter than your normal style for this kind of scene.
- Be concise, avoid repeated exposition, keep JSON fields dense and actionable.\n`;

  if (isFirstScene) {
    return `Generate the opening scene of this campaign. Set the stage with an atmospheric description that draws the player in.

PROMPT GOVERNANCE:
- Profile: ${promptProfile}
- Target output budget: ~${sceneTokenBudget ?? 'default'} tokens
- Input budget: ~${promptTokenBudget ?? 'default'} tokens
- OPENING SCENE LENGTH: Make the first scene extra concise (about half to three-quarters of your normal opening length).
- NARRATION LENGTH CONTROL: Keep narrator prose about 25% shorter than your normal style.
- Keep the response focused, structured, and free from repetitive filler.

Respond with ONLY valid JSON in this exact format:
{
  "narrative": "A vivid but concise 1-2 short paragraph opening scene...",
  "scenePacing": "exploration",
  "dialogueSegments": [
    {"type": "narration", "text": "Descriptive prose..."},
    {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."},
    {"type": "narration", "text": "More prose..."}
  ],
  "soundEffect": "Short English description of ambient/atmospheric sound for this scene, or null",
  "musicPrompt": "Short English description of ideal instrumental background music for this scene, or null",
  "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
  "sceneGrid": {
    "width": 12,
    "height": 12,
    "tiles": [["W","W","W","W"],["W","P","F","E"],["W","F","I","W"],["W","W","W","W"]],
    "entities": [
      {"name": "Player Name", "type": "player", "x": 1, "y": 1, "marker": "@"},
      {"name": "NPC Name", "type": "npc", "x": 2, "y": 2, "marker": "N"}
    ]
  },
  "atmosphere": {
    "weather": "rain | snow | storm | clear | fog | fire",
    "particles": "magic_dust | sparks | embers | arcane | none",
    "mood": "mystical | dark | peaceful | tense | chaotic",
    "lighting": "natural | night | dawn | bright | rays | candlelight | moonlight",
    "transition": "dissolve | fade | arcane_wipe"
  },
  "suggestedActions": ["(EXACTLY 3 UNIQUE actions specific to THIS scene — reference NPCs, objects, locations by name; EXACTLY 1 should be a direct PC dialogue line like I say: \"...\")"],
  "stateChanges": {
    "journalEntries": ["Concise 1-2 sentence summary of a key event from this scene"],
    "npcs": [{"action": "introduce", "name": "NPC Name", "gender": "male", "role": "innkeeper", "personality": "jovial, loud", "attitude": "friendly", "location": "The Rusty Anchor", "notes": "", "factionId": "merchants_guild", "relationships": []}],
    "mapChanges": [{"location": "Location Name", "modification": "Description of change", "type": "discovery"}],
    "timeAdvance": {"hoursElapsed": 0.5, "newDay": false},
    "activeEffects": [],
    "moneyChange": null,
    "currentLocation": "Location Name",
    "mapMode": "pola",
    "roadVariant": null,
    "codexUpdates": []${needsSystemEnabled ? ',\n    "needsChanges": {"hunger": 0, "thirst": 0, "bladder": 0, "hygiene": 0, "rest": 0}' : ''}
  }
}
${needsSystemEnabled ? '\nFor stateChanges.needsChanges: use when the character satisfies a biological need (eating, drinking, toilet, bathing, resting). Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger and +40 thirst. Use null if no needs changed.\n' : ''}
For stateChanges.mapMode (MANDATORY): Set the procedural field-map mode matching the current scene environment. Exactly one of: "trakt" (road/path between locations), "pola" (open fields, plains, farmland), "wnetrze" (interior — tavern, dungeon room, house, cave), "las" (forest, dense woods). Choose based on WHERE the scene takes place, not the overall biome.
For stateChanges.roadVariant: ONLY set when mapMode is "trakt". Describes the road surroundings. One of: "pola" (road through fields/plains), "las" (road through forest), "miasto" (road through town/city). Use null when mapMode is not "trakt".

For stateChanges.timeAdvance: ALWAYS include "hoursElapsed" (decimal). Each action typically takes 15 min to 1 hour: quick interaction=0.25, short action/combat=0.5, exploration=0.75-1. Only resting (2-4) and sleeping (6-8) should exceed 1 hour.

For stateChanges.journalEntries: provide 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant player decisions, discoveries, or combat outcomes. Each entry should be a self-contained 1-2 sentence summary. Do NOT log trivial details.

For atmosphere: choose weather, particles, mood, lighting, and transition that match the scene's environment and tone. weather describes the environmental condition, particles adds visual flair (magic_dust for mystical places, sparks for forges/tech, embers for fire/destruction, arcane for magical events), mood sets the overall feel, lighting describes the scene's light source and quality (natural for daylight outdoors, night for darkness/starlight, dawn for sunrise/sunset, bright for strong direct light, rays for god-rays through trees/windows, candlelight for indoor dim light, moonlight for moon-lit nights), and transition is the visual transition into this scene (use "fade" for the opening scene).

For musicPrompt: describe the ideal instrumental background music — mention instruments, tempo, and emotional tone. Keep under 200 characters. Example: "slow strings with harp arpeggios, mysterious and enchanting". Use null only if the scene should be silent.

For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.

For sceneGrid: ALWAYS include a playable 2D tactical grid centered on the current scene. Use width/height 8-16. tiles must be a 2D array with exactly height rows and width columns. Tile symbols: W=wall (blocked), F=floor (walkable), P=player start, E=exit/path, D=door, I=interactive point. Include entities with exact x/y coordinates for the player and visible NPCs. Ensure every entity stands on a walkable tile.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names. Every dialogue segment MUST have a "gender" field.
NPCs present in the scene MUST speak in direct dialogue (as dialogue segments), not just be described in narration. Never summarize what an NPC says — let them speak.${langReminder}`;
  }

  const needsReminder = needsSystemEnabled ? buildUnmetNeedsBlock(characterNeeds) : '';

  const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
  const isFieldMove = playerAction && playerAction.startsWith('[FIELD_MOVE]');
  const isContinue = playerAction === '[CONTINUE]';
  const isWait = playerAction === '[WAIT]';
  const isPostCombat = playerAction && playerAction.startsWith('[Combat resolved:');
  const isSurrender = isPostCombat && playerAction.includes('surrendered');
  const isTruce = isPostCombat && playerAction.includes('forced a truce');
  const isPostCombatDefeat = isPostCombat && (
    playerAction.includes('LOST the fight')
    || playerAction.includes('did NOT win')
    || playerAction.includes('party LOST the fight')
  );

  const actionPart = extractActionParts(playerAction);
  const dialoguePart = extractDialogueParts(playerAction);
  const playerHasDialogue = hasDialogue(playerAction);

  const idleEventType = isIdleWorldEvent ? pickIdleEventType() : null;
  const actionBlock = isIdleWorldEvent
    ? `IDLE WORLD EVENT — NO PLAYER ACTION OCCURRED.
EVENT TYPE: ${idleEventType}
${idleEventType === 'atmospheric' ? 'Generate a small, atmospheric ambient event — something mundane, slice-of-life that happens TO or AROUND the character without their initiative.' : ''}${idleEventType === 'npc_activity' ? 'An NPC does something noticeable nearby — starts an argument, makes a trade, reacts to something, arrives or departs. This can introduce a new minor NPC or show an existing one acting autonomously.' : ''}${idleEventType === 'rumor' ? 'The character overhears a rumor, snippet of conversation, or piece of gossip. This can hint at quest opportunities, world events, or NPC activities.' : ''}${idleEventType === 'foreshadowing' ? 'Something subtly ominous or portentous happens — a symbol appears, an animal behaves strangely, a chill wind blows, distant thunder rumbles. Plant a narrative seed if appropriate.' : ''}${idleEventType === 'consequence_echo' ? 'A past player decision ripples back — someone recognizes the character, a consequence of an earlier choice manifests, or news of the character\'s past actions spreads.' : ''}

RULES FOR THIS SCENE (MANDATORY):
- The character did NOT take any action. Do not narrate the character doing something deliberate.
- Something happens in the world spontaneously: a passerby, an animal, weather, a sound, a small incident nearby.
- Keep the narrative SHORT (1-2 paragraphs). This is a minor world beat, not a major plot event.
- The event CAN optionally plant a subtle quest hook or introduce a character, but it does NOT have to. Most of the time, keep it purely atmospheric.
- No skill test is needed for this scene.
- Do NOT start combat. Do NOT include combatUpdate.
- suggestedActions should include reactions to what just happened in the PC's voice (e.g. "I kneel to pet the cat", "I go over to the vendor", "I brush off the mess and act casual", "I ignore it and walk on") plus normal exploration options.
- stateChanges should be minimal or empty. A small timeAdvance (5-15 minutes) is appropriate.`
    : isWait
    ? `PLAYER CHOSE "WAIT" — PASSIVE OBSERVATION.

The player deliberately waits and does NOT take initiative. They are watching, listening, or letting events unfold without acting.

RULES FOR THIS SCENE (MANDATORY):
- Do NOT narrate the player doing something goal-directed (no walking off, no starting conversations, no attacking). They remain passive unless reacting to something that happens TO them.
- Something meaningful should develop: NPCs act, time passes, tension shifts, news arrives, an opportunity or threat emerges — this should feel more substantial than a tiny idle ambient beat, because the player chose to wait.
- Advance the situation or plot thread; do not stall the story.
- No skill test for this scene.
- Do NOT start combat in this scene unless an external force attacks without the player provoking it; if combat starts, it is because the world came to them.
- suggestedActions should offer ways to re-engage in first person or clear PC intent: "I speak up", "I step in", "I slip away", "I take a closer look", etc.
- Include a modest timeAdvance (15 minutes to a few hours) if appropriate.`
    : isContinue
    ? `PLAYER CHOSE "CONTINUE" — KEEP THE STORY MOVING.

The player wants the narrative to advance without specifying a concrete action. They are still engaged and present, but defer to the GM to push the scene forward.

RULES FOR THIS SCENE (MANDATORY):
- Advance the plot, deepen the current situation, or introduce the next beat — do not merely repeat the previous scene.
- The character may participate naturally in what unfolds (walking with the flow, reacting to events), but do not invent a specific detailed player plan they did not state.
- The game engine may or may not have resolved a skill check — narrate based on the user prompt outcome.
- suggestedActions should be concrete, varied, and in the PC's voice (not generic "continue" only).
- This is NOT the same as passive waiting — the player is active in the fiction, just not specifying how.`
    : isPostCombat
    ? `COMBAT JUST ENDED — ${playerAction}

POST-COMBAT RULES (MANDATORY):
- Do NOT include "combatUpdate" in this scene's stateChanges — combat has JUST ended, do not start another fight.
- Narrate the aftermath: describe the battlefield, fallen enemies, the character's condition and wounds, loot found, NPC reactions if any witnesses are present.
- The character may be wounded — reflect their physical state in the narration (heavy breathing, bleeding, pain from critical wounds).
- No skill test is needed for this post-combat transition scene.
- Suggest post-combat actions in the PC's voice: "I search the bodies for anything useful", "I bandage my wounds", "I catch my breath and rest a moment", "I push on down the road", "I try to work out why they attacked", etc.
- If the character was defeated, narrate the consequences (capture, rescue, waking up elsewhere, losing items, etc.).${isPostCombatDefeat ? `

DEFEAT RULES (MANDATORY — the player LOST this fight):
- This scene is a DEFEAT aftermath, not a victory lap.
- NEVER describe the player as the winner, never imply all enemies were beaten, and never frame the outcome as a triumphant continuation.
- The surviving enemies, hostile environment, or immediate consequences are IN CONTROL of the scene.
- Focus on defeat consequences such as capture, rescue, humiliation, being stripped of gear, waking later in pain, or barely surviving under enemy pressure.
- Suggested actions must fit the losing position: plead, recover, escape captivity, search for help, crawl to safety, bargain, or treat wounds.` : ''}${isSurrender ? `

SURRENDER RULES (MANDATORY — the player SURRENDERED, they did not win):
- The player character dropped their weapon and yielded. The remaining enemies are NOW IN CONTROL of the situation.
- Narrate the enemies' reaction to the surrender. Their response depends on WHO they are:
  * Town guards / authorities → arrest, imprisonment, trial, confiscation of weapons. Use stateChanges to remove weapons/contraband via "itemsRemoved".
  * Bandits / criminals → rob the player, take valuables and money. Use "itemsRemoved" and "moneyChange" (negative) to reflect theft.
  * Intelligent enemies (NPCs, rival adventurers) → may capture, bind, interrogate, demand ransom, or force servitude. Consider their personality and goals.
  * Monsters / beasts → if unintelligent, they may not accept surrender (narrate the player being dragged away, left for dead, or barely escaping).
  * Faction enemies → use "factionChanges" to reflect reputation consequences (humiliation, submission).
- The consequences MUST be meaningful: the player chose to surrender to avoid death, so they pay a price. Include at least one of: imprisonment, item confiscation, money loss, forced relocation, reputation damage, or a new quest/obligation imposed by the captors.
- Suggest actions that reflect the surrendered state: negotiating with captors, attempting escape, accepting imprisonment, pleading for mercy, offering information/services in exchange for freedom.
- Do NOT let the surrender have zero consequences — the enemies won and should act like victors.` : ''}${isTruce ? `

TRUCE RULES (MANDATORY — the player FORCED A TRUCE from a position of strength):
- The player had the upper hand — enemies were wounded, outnumbered, or losing badly — and demanded the remaining enemies stand down.
- The enemies CONCEDE, not the player. Narrate the enemies backing off, dropping weapons, raising hands, fleeing, or grudgingly agreeing to cease hostilities.
- The player KEEPS all their belongings. Do NOT use "itemsRemoved" or "moneyChange" (negative) — the player is the victor here.
- Possible aftermath depending on WHO the enemies are:
  * Town guards / authorities → they retreat and regroup, possibly calling for reinforcements later. Use "factionChanges" if the player's dominance affects local reputation.
  * Bandits / criminals → they scatter, beg for mercy, or offer information to save themselves. The player may loot the fallen.
  * Intelligent enemies (NPCs, rival adventurers) → grudging respect, temporary ceasefire, information exchange, or negotiated terms. They may become reluctant allies or sworn enemies later.
  * Monsters / beasts → unintelligent creatures slink away wounded; intelligent ones may bargain or submit.
  * Faction enemies → use "factionChanges" to reflect the power shift (fear, grudging respect, or escalation).
- The player is in a DOMINANT position. Suggest actions that reflect this: demand information, interrogate survivors, loot fallen enemies, let them go with a warning, take prisoners, tend to wounds, press the advantage.
- The truce may have future consequences — enemies may return with reinforcements, spread word of the player's prowess, or honor/betray the ceasefire.` : ''}`
    : isFieldMove
    ? `FIELD MAP MOVEMENT — ${playerAction}

The player has been traveling on the overworld field map. The technical payload above describes their movement — distance covered, starting/ending position, biome, and any points of interest discovered.

RULES FOR THIS SCENE (MANDATORY):
- This is a TRAVEL scene. The character has been walking through the ${playerAction.match(/biome=(\w+)/)?.[1] || 'unknown'} biome on the field map.
- Narrate what happens during the journey: encounters, observations, weather, discoveries, atmosphere.
- If the player discovered POIs (buildings, shrines, portals, etc.), describe them in detail and offer interaction opportunities.
- If the player moved very little or stayed idle (high idleSteps), narrate local ambiance or small events instead of travel.
- Keep the narrative moderate in length (2-3 paragraphs) unless something significant occurs.
- Include timeAdvance proportional to steps taken (15 steps ≈ 0.5 to 1 hour depending on terrain).
- suggestedActions should reflect what the player can do at their current location: explore nearby structures, set up camp, forage, investigate, or continue moving.
- You may introduce random encounters, NPC travelers, environmental hazards, or quest hooks based on the biome and distance covered.
- Do NOT start combat unless the narrative strongly calls for it (random bandit ambush, wild beast encounter, etc.).`
    : playerHasDialogue
      ? `The player's ACTION: ${actionPart}
The player's DIALOGUE (exact words the character speaks aloud): ${dialoguePart}`
      : `The player's action: ${playerAction}`;

  const combatIntentDetected = !isPostCombat && detectCombatIntent(playerAction);
  const isGeneralCombatInitiation = playerAction?.startsWith('[INITIATE COMBAT]');
  const attackNpcMatch = playerAction?.match(/^\[ATTACK:\s*(.+?)\]$/);
  const attackedNpcName = attackNpcMatch?.[1];

  let combatReminder = '';
  if (isGeneralCombatInitiation) {
    combatReminder = `\n\nPLAYER INITIATED COMBAT — MANDATORY RESPONSE REQUIREMENT:
The player pressed the "Initiate Combat" button. You MUST analyze ALL NPCs present in this scene and determine who is hostile based on their attitude, disposition, and relationships:
- NPCs with attitude "hostile" or negative disposition MUST become enemies.
- NPCs with attitude "neutral" or "friendly" should generally NOT become enemies unless the narrative context demands it (e.g. they are secretly working with the hostile NPCs, or story logic dictates they would join the fight).
- If there are no hostile NPCs present, introduce contextually appropriate enemies (bandits ambush, creatures emerge, etc.) or narrate that there is no immediate threat and do NOT include combatUpdate.
- You MUST include "combatUpdate" in stateChanges with "active": true and an "enemies" array with full stat blocks.
- For any NPC that becomes an enemy, also include them in stateChanges.npcs with action "update" and attitude "hostile".
Do NOT narrate combat without including combatUpdate — the client combat engine needs it. Do NOT set combatUpdate to null.
Example: "combatUpdate": {"active": true, "enemies": [{"name": "Enemy Name", "characteristics": {"ws": 35, "bs": 25, "s": 30, "t": 30, "i": 30, "ag": 30, "dex": 25, "int": 20, "wp": 25, "fel": 15}, "wounds": 10, "maxWounds": 10, "skills": {"Melee (Basic)": 5}, "traits": [], "armour": {"body": 0}, "weapons": ["Hand Weapon"]}], "reason": "why combat started"}\n`;
  } else if (attackedNpcName) {
    combatReminder = `\n\nPLAYER ATTACKS SPECIFIC NPC — MANDATORY RESPONSE REQUIREMENT:
The player is deliberately attacking "${attackedNpcName}". This NPC MUST be included in combatUpdate.enemies with appropriate stat blocks, regardless of their current attitude (even if friendly or neutral).
- "${attackedNpcName}" becomes hostile. Include them in stateChanges.npcs with action "update" and attitude "hostile".
- Check if "${attackedNpcName}" has allies, guards, or companions present in the scene. If so, those allies should also join as enemies in combatUpdate (and also be set to hostile in stateChanges.npcs).
- Other NPCs who are NOT allied with the target should react appropriately: bystanders flee, authorities may intervene later, witnesses remember.
- The narrative should describe the moment of aggression — the player strikes first, the target's shock or readiness, the chaos that ensues.
- You MUST include "combatUpdate" in stateChanges with "active": true and the enemies array.
Do NOT narrate combat without including combatUpdate — the client combat engine needs it. Do NOT set combatUpdate to null.
Example: "combatUpdate": {"active": true, "enemies": [{"name": "${attackedNpcName}", "characteristics": {"ws": 35, "bs": 25, "s": 30, "t": 30, "i": 30, "ag": 30, "dex": 25, "int": 20, "wp": 25, "fel": 15}, "wounds": 12, "maxWounds": 12, "skills": {}, "traits": [], "armour": {"body": 0}, "weapons": ["Hand Weapon"]}], "reason": "Player attacked ${attackedNpcName}"}\n`;
  } else if (combatIntentDetected) {
    combatReminder = `\n\nCOMBAT INTENT DETECTED — MANDATORY RESPONSE REQUIREMENT:
The player is explicitly initiating combat. You MUST include "combatUpdate" in stateChanges with "active": true and an "enemies" array containing stat blocks for the opponents.
Use NPCs present in the scene as enemies. If no specific NPCs are present, use contextually appropriate opponents (tavern patrons, guards, etc.).
Do NOT narrate combat without including combatUpdate — the client combat engine needs it. Do NOT set combatUpdate to null.
Example: "combatUpdate": {"active": true, "enemies": [{"name": "Tavern Thug", "characteristics": {"ws": 35, "bs": 25, "s": 30, "t": 30, "i": 30, "ag": 30, "dex": 25, "int": 20, "wp": 25, "fel": 15}, "wounds": 10, "maxWounds": 10, "skills": {"Melee (Basic)": 5}, "traits": [], "armour": {"body": 0}, "weapons": ["Hand Weapon"]}], "reason": "why combat started"}\n`;
  }

  const isPostDialogue = playerAction && playerAction.startsWith('[Dialogue ended:');
  const isDialogueActive = dialogue?.active;
  const isDialogueInitiation = playerAction?.startsWith('[INITIATE DIALOGUE');
  const talkNpcMatch = playerAction?.match(/^\[TALK:\s*(.+?)\]$/);
  const dialogueIntentDetected = !isPostCombat && !isPostDialogue && detectDialogueIntent(playerAction);

  let dialogueReminder = '';
  if (isDialogueActive) {
    const npcNames = (dialogue.npcs || []).map((n) => n.name).join(', ');
    const npcGoals = (dialogue.npcs || []).map((n) => `${n.name} (${n.attitude}): ${n.goal || 'engaging in conversation'}`).join('\n');
    dialogueReminder = `\n\nDIALOGUE MODE ACTIVE — Round ${dialogue.round}/${dialogue.maxRounds}
NPCs in conversation: ${npcNames}
NPC goals:
${npcGoals}

MANDATORY DIALOGUE MODE RULES:
- The narrator/GM MUST stay completely silent — NO narrator prose or description.
- ONLY NPCs speak. The "narrative" must contain ONLY the NPCs' spoken dialogue lines.
- ALL dialogueSegments must be type "dialogue" with an NPC character name and gender. Do NOT include any "narration" segments.
- Each NPC should respond in character based on their personality, attitude, and conversational goal.
- suggestedActions must be concrete in-character lines the PC can say (direct speech the player selects) — NOT physical stage directions or narrator summaries.
- Do NOT include combatUpdate.
- The game engine handles any skill checks. Focus on the narrative celebration.
- ${dialogue.round >= dialogue.maxRounds ? 'This is the LAST round. NPCs should wrap up the conversation naturally. Include "dialogueUpdate": {"active": false} in stateChanges to end dialogue mode.' : `${dialogue.maxRounds - dialogue.round} round(s) remaining.`}\n`;
  } else if (isPostDialogue) {
    dialogueReminder = `\n\nDIALOGUE JUST ENDED — ${playerAction}

POST-DIALOGUE RULES (MANDATORY):
- Do NOT include "dialogueUpdate" in stateChanges — dialogue has JUST ended.
- Return to normal narration: narrator describes the aftermath and consequences of the conversation.
- Reflect the outcome of the dialogue: agreements reached, information gained, NPC disposition changes, rejected proposals, etc.
- suggestedActions should be normal exploration/action options based on the dialogue outcome, phrased from the player character's perspective.
- No skill test for this transition scene.\n`;
  } else if (isDialogueInitiation) {
    const npcListMatch = playerAction.match(/\[INITIATE DIALOGUE:\s*(.+?)\]/);
    const requestedNpcs = npcListMatch ? npcListMatch[1] : 'nearby NPCs';
    dialogueReminder = `\n\nPLAYER INITIATED DIALOGUE MODE — MANDATORY RESPONSE REQUIREMENT:
The player wants to enter a structured dialogue with: ${requestedNpcs}.
You MUST include "dialogueUpdate" in stateChanges with "active": true and an "npcs" array listing the conversation participants (at least 2 NPCs).
Each NPC entry needs: {"name": "NPC Name", "attitude": "friendly|neutral|hostile", "goal": "what this NPC wants from the conversation"}.
The narrative should set up the conversation — NPCs notice the player approaching and begin to engage.
Example: "dialogueUpdate": {"active": true, "npcs": [{"name": "Merchant Hans", "attitude": "friendly", "goal": "sell wares at a premium"}, {"name": "Guard Captain", "attitude": "neutral", "goal": "maintain order"}], "reason": "Player initiated group dialogue"}\n`;
  } else if (talkNpcMatch) {
    dialogueReminder = `\n\nPLAYER WANTS TO TALK TO "${talkNpcMatch[1]}" — consider including "dialogueUpdate" in stateChanges if there are 2+ NPCs available for a structured conversation. Otherwise proceed with normal narrative dialogue.\n`;
  } else if (dialogueIntentDetected && dialogueCooldown <= 0) {
    dialogueReminder = `\n\nDIALOGUE INTENT DETECTED: The player wants to talk/negotiate. If 2+ NPCs are present, consider including "dialogueUpdate" in stateChanges to start dialogue mode. Otherwise, narrate the conversation normally.\n`;
  } else if (dialogueCooldown > 0 && dialogueIntentDetected) {
    dialogueReminder = `\n\nDIALOGUE MODE ON COOLDOWN (${dialogueCooldown} scenes remaining). The character needs time to recover their social energy. Narrate the conversation normally without entering dialogue mode — do NOT include dialogueUpdate.\n`;
  }

  return `${needsReminder}${governanceReminder}${actionBlock}${combatReminder}${dialogueReminder}
${isPostCombat ? '' : `
ACTION VS SPEECH (CRITICAL — read both rules carefully):
RULE 1 — ACTION PARTS: The ACTION line describes what the character DOES — narrate it as action in prose. Never turn action text into spoken dialogue (the character must NOT announce their own action aloud).
RULE 2 — SPEECH PARTS (MANDATORY): The DIALOGUE line (if present) contains the character's exact in-character speech. You MUST include each quoted phrase as a "dialogue" segment in dialogueSegments with the player character's name and gender. Do NOT skip, paraphrase, or fold quoted speech into narration — present it as actual spoken dialogue.
SEGMENT ORDER: When the player spoke in this beat, list their "dialogue" segment(s) first in dialogueSegments, then narration and other speakers — chronological order for the reader.
If there is no DIALOGUE line, the character does not speak (unless you as GM decide they would naturally say something brief and contextually fitting — but never the player's action text verbatim).
`}
Resolve this action and advance the story. Determine outcomes, describe the consequences, and set up the next decision point.

NPC DIRECT SPEECH REMINDER: If any NPC is present in the scene and reacts to the player, that NPC MUST speak in direct dialogue (a "dialogue" segment with their name). Do NOT just describe their reaction in narration — let them talk. Every scene where the player interacts with an NPC must produce at least one NPC dialogue segment.

SKILL CHECK (resolved by game engine — DO NOT calculate dice rolls):
${formatResolvedCheck(resolvedMechanics?.diceRoll)}

${resolvedMechanics?.diceRoll ? `IMPORTANT: The skill check above was resolved by the game engine. Your narrative MUST be consistent with the outcome:
- If the result is SUCCESS, the character succeeds at the action.
- If the result is FAILURE, the character fails — do NOT narrate success.
- If CRITICAL SUCCESS, describe an exceptional success with bonus effects.
- If CRITICAL FAILURE, describe a spectacular failure with extra consequences.
- The SL magnitude indicates how well/poorly: SL +3 or higher = impressive, SL -3 or lower = very bad.
DO NOT include a "diceRoll" field in your JSON response — the game engine handles all mechanics.` : 'No skill check for this action. DO NOT include a "diceRoll" field in your JSON response.'}

Respond with ONLY valid JSON in this exact format:
{
  "narrative": "1-2 concise paragraphs describing what happens as a result of the player's action and setting up the next beat...",
  "scenePacing": "exploration | combat | chase | stealth | dialogue | travel_montage | celebration | rest | dramatic | dream | cutscene",
  "cutscene": null,
  "dilemma": null,
  "dialogueSegments": [
    {"type": "narration", "text": "Descriptive prose..."},
    {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."},
    {"type": "narration", "text": "More prose..."}
  ],
  "soundEffect": "Short English description of a sound effect for impactful moments, or null",
  "musicPrompt": "Short English description of ideal instrumental background music for this scene, or null",
  "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
  "sceneGrid": {
    "width": 12,
    "height": 12,
    "tiles": [["W","W","W","W"],["W","P","F","E"],["W","F","I","W"],["W","W","W","W"]],
    "entities": [
      {"name": "Player Name", "type": "player", "x": 1, "y": 1, "marker": "@"},
      {"name": "NPC Name", "type": "npc", "x": 2, "y": 2, "marker": "N"}
    ]
  },
  "atmosphere": {
    "weather": "rain | snow | storm | clear | fog | fire",
    "particles": "magic_dust | sparks | embers | arcane | none",
    "mood": "mystical | dark | peaceful | tense | chaotic",
    "lighting": "natural | night | dawn | bright | rays | candlelight | moonlight",
    "transition": "dissolve | fade | arcane_wipe"
  },
  "suggestedActions": ["(EXACTLY 3 UNIQUE actions specific to THIS scene — reference NPCs, objects, locations by name. NEVER repeat previous suggestions. EXACTLY 1 should be a direct PC dialogue line)"],
  "questOffers": [],
  "stateChanges": {
    "woundsChange": 0,
    "xp": 0,
    "fortuneChange": 0,
    "resolveChange": 0,
    "newItems": [],
    "removeItems": [],
    "newQuests": [],
    "completedQuests": [],
    "questUpdates": [],
    "worldFacts": [],
    "journalEntries": ["Concise 1-2 sentence summary of a key event from this scene"],
    "statuses": null,
    "skillAdvances": null,
    "newTalents": null,
    "careerAdvance": null,
    "npcs": [{"action": "introduce|update", "name": "NPC Name", "gender": "male|female", "role": "their role", "personality": "traits", "attitude": "friendly|neutral|hostile|fearful|etc", "location": "where they are", "notes": "optional notes", "dispositionChange": 5, "factionId": "faction_id_or_null", "relationships": [{"npcName": "Other NPC", "type": "ally|enemy|family|employer|rival|friend|mentor|subordinate"}]}],
    "mapChanges": [{"location": "Location Name", "modification": "what changed", "type": "trap|obstacle|discovery|destruction|other"}],
    "timeAdvance": {"hoursElapsed": 0.5, "newDay": false},
    "activeEffects": [{"action": "add|remove|trigger", "id": "unique_id", "type": "trap|spell|environmental", "location": "where", "description": "what it does", "placedBy": "who placed it"}],
    "moneyChange": {"gold": 0, "silver": 0, "copper": 0},
    "currentLocation": "Current Location Name",
    "factionChanges": null,
    "combatUpdate": "INCLUDE combatUpdate OBJECT WITH active:true AND enemies ARRAY WHEN COMBAT STARTS — omit or set null when no combat",
    "dialogueUpdate": "INCLUDE dialogueUpdate OBJECT WITH active:true AND npcs ARRAY WHEN DIALOGUE MODE STARTS — omit or set null when no dialogue mode",
    "knowledgeUpdates": null,
    "codexUpdates": [],
    "mapMode": "pola",
    "roadVariant": null,
    "campaignEnd": null${needsSystemEnabled ? ',\n    "needsChanges": {"hunger": 0, "thirst": 0, "bladder": 0, "hygiene": 0, "rest": 0}' : ''}
  }
}

For atmosphere: choose weather, particles, mood, lighting, and transition that best match the current scene's environment. Pick ONE value for each field. weather = environmental condition (clear/rain/snow/storm/fog/fire). particles = visual flair (magic_dust/sparks/embers/arcane/none). mood = overall feel (mystical/dark/peaceful/tense/chaotic). lighting = light source and quality (natural for daylight, night for darkness/starlight, dawn for sunrise/sunset, bright for strong light, rays for god-rays through trees/windows, candlelight for dim indoor light, moonlight for moon-lit nights). transition = how the scene visually transitions in (dissolve/fade/arcane_wipe — use arcane_wipe for magical events, dissolve for abrupt changes, fade for calm transitions).

For stateChanges: woundsChange is a DELTA (negative = damage, positive = healing). xp is a DELTA (typically +20 to +50 per scene). fortuneChange/resolveChange are DELTAS (usually negative when spent). newItems should be objects with {id, name, type, description, rarity}. newQuests should be objects with {id, name, description, completionCondition, objectives: [{id, description}], questGiverId, turnInNpcId, locationId, prerequisiteQuestIds, reward: {xp, money: {gold, silver, copper}, items: [{id, name, type, description, rarity}], description}, type: "main|side|personal"}. "completionCondition" is the main goal to finish the quest. "objectives" are 2-5 optional milestones guiding the player through the story. "questGiverId" is the NPC name who assigned the quest. "turnInNpcId" is the NPC name to report quest completion to (defaults to questGiverId if omitted). "locationId" is the main location where the quest takes place. "prerequisiteQuestIds" is an array of quest IDs that must be completed before this quest can progress. "reward" MUST be included on every quest — use xp (side: 25-75, main: 100-200), optionally money and items. "type" is "main" for central plot, "side" for independent, "personal" for character-specific. worldFacts are strings of new information. journalEntries are 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant decisions, discoveries, or combat outcomes. Each entry: 1-2 sentences, self-contained. Do NOT log trivial details. Set any field to null/empty to skip it.
QUEST TRACKING (MANDATORY): For stateChanges.questUpdates: array of objective completions, e.g. [{"questId": "quest_123", "objectiveId": "obj_1", "completed": true}]. AFTER writing the narrative, you MUST cross-check ALL active quest objectives against the scene events. If the narrative describes events that fulfill any objective (even partially or indirectly), you MUST include the corresponding questUpdates entry. NEVER write a journal entry or narrative that fulfills an objective without marking it here. This is separate from completedQuests which finishes the entire quest.
QUEST DISCOVERY: When the player explicitly asks about available work, tasks, quests, jobs, or missions (e.g. "I look for quests", "I ask about available work", "I check the notice board"), populate the top-level "questOffers" array with 1-3 quest proposals. Each offer: {"id": "quest_<unique>", "name": "Quest Name", "description": "What the quest entails", "completionCondition": "What must be done to complete it", "objectives": [{"id": "obj_1", "description": "First milestone"}, ...], "locationId": "Primary quest location name", "offeredBy": "NPC name or source", "reward": {"xp": 50, "money": {"gold": 1, "silver": 0, "copper": 0}, "items": [], "description": "50 XP and 1 Gold Crown"}, "type": "main|side|personal"}. "locationId" is MANDATORY for every quest offer and must point to a concrete place in the current world (existing location or a newly introduced one). Narrate the quest sources naturally — NPCs offering jobs, notice boards, tavern rumors, guild contacts, merchant requests, desperate villagers, etc. Quest offers should: (a) mix story-related and independent hooks, (b) fit the current location, NPCs, and world state, (c) have 2-5 trackable objectives, (d) vary in scope — some quick side jobs, some longer arcs. The "type" field: "main" for quests tied to the campaign's central plot, "side" for independent adventures, "personal" for character-specific goals. Use "questOffers" for quests the player discovers and can choose to accept or decline. Use "stateChanges.newQuests" ONLY for quests forced by story events (unavoidable plot developments). When NOT asked about quests, leave "questOffers" as an empty array [].
ITEM VALIDATION: The character can ONLY use items currently listed in their Inventory above. If the player's action references using an item they do not possess, the action MUST fail or the narrative should reflect they don't have it. Only include items in removeItems that exist in the character's inventory.
ITEM/MONEY ACQUISITION (CRITICAL — NEVER FORGET): If the narrative describes the character OBTAINING anything (picking up, finding, looting, receiving, buying, stealing, crafting), you MUST mechanically add it: physical items → stateChanges.newItems, money/coins → stateChanges.moneyChange. A narrated acquisition without the matching stateChanges entry is a BUG. After writing the narrative, cross-check: did the character gain any object or money? If yes, verify the corresponding stateChanges field is populated.
LOOT RARITY GATING (enforced by campaign progression):
- Scenes 1-15 (Act 1): Only "common" and "uncommon" items as loot or purchases. "rare" items only as major quest rewards.
- Scenes 16-30 (Act 2): "rare" items available through merchants, loot, and quests. "exotic" items only through major quest lines with narrative buildup.
- Scenes 31+ (Act 3+): "exotic" items possible but ALWAYS with narrative cost — they attract thieves, faction interest, rumors, political consequences, or obligations. Powerful items are never free.
- COST OF OWNERSHIP: Rare and exotic items draw attention. NPCs comment on them, thieves target the character, factions want them, and rumors spread about whoever carries them. Include these consequences in worldFacts and NPC reactions.
- Always set the "rarity" field on new items: "common", "uncommon", "rare", or "exotic".
For stateChanges.moneyChange: an object with {gold, silver, copper} DELTAS. Use negative values when the character spends money (buying, paying, bribing) and positive values when receiving money (loot, rewards, selling). The system auto-normalizes denominations. ALWAYS check the character's Money before allowing a purchase — if they cannot afford it, the purchase must fail narratively. Use null if no money changed.
For stateChanges.skillAdvances: an object mapping skill names to advance amounts, e.g. {"Melee (Basic)": 1, "Dodge": 1}. Use only when the GM narratively teaches or the character practices a skill. Use null if no skills improved.
For stateChanges.newTalents: an array of talent names gained, e.g. ["Strike Mighty Blow"]. Use null if none.
For stateChanges.careerAdvance: use when the character advances career tier or changes career. Object with fields: {tier, tierName, name, class, status}. Use null if no career change.

For stateChanges.npcs: use "introduce" for new NPCs and "update" for existing ones. Always include name and gender. Provide personality, role, attitude toward player, and current location.
CRITICAL NPC NAME RULE: Do NOT create NPC entries for anonymous/descriptive speakers such as "głos zza kamienia", "voice from behind the door", "someone", or "unknown". These belong in narrative/dialogue only, not in stateChanges.npcs.
NPC RELATIONSHIP TRACKING: When introducing or updating NPCs, include these optional fields to build the world relationship graph:
- "factionId": the faction this NPC belongs to (merchants_guild, thieves_guild, temple_sigmar, etc.) — faction reputation will automatically influence their disposition toward the player
- "relatedQuestIds": array of quest IDs this NPC is involved in (as quest giver, target, or participant)
- "relationships": array of NPC-to-NPC relationships: [{"npcName": "Other NPC Name", "type": "ally|enemy|family|employer|rival|friend|mentor|subordinate"}]
These relationships persist across scenes and are used for world consistency. Always set factionId for NPCs who belong to a known faction.
NPC DISPOSITION TRACKING: When a skill check involves interaction with an NPC (check the SKILL CHECK section in user prompt for the outcome), include that NPC in stateChanges.npcs with a variable "dispositionChange" based on SL — NOT a flat +5/-5:
- Critical success: +3 to +5
- Strong success (SL 3+): +2 to +3
- Marginal success (SL 0-2): +1 to +2
- Marginal failure (SL -1 to -2): -1 to -2
- Hard failure (SL -3 or worse): -3 to -5
- Critical failure: -5 to -8
- Betrayal, broken promise, or threat: -8 to -10 (immediate, regardless of roll)
Trust builds SLOWLY but breaks FAST. Disposition delta is capped at +-10 per scene by the game engine.
NPC PERSONALITY FRICTION: At least 30% of NPCs should be naturally suspicious, hostile, self-interested, or uncooperative. Not every NPC wants to help. Introduce suspicious/hostile NPCs with negative starting disposition (-5 to -20).
NPC GRUDGE MEMORY: NPCs remember humiliations, failures, threats, and broken promises. These persist across scenes and reduce disposition permanently. Record grudges in NPC notes via stateChanges.npcs. When an NPC has been wronged, reference it in their dialogue and behavior — they do NOT forgive easily.
For stateChanges.mapChanges: log environmental changes to locations (traps set, doors opened, items left, destruction). type is one of: trap, obstacle, discovery, destruction, other.
For stateChanges.timeAdvance: ALWAYS include "hoursElapsed" (decimal). Each action typically takes 15 min to 1 hour of in-game time: quick dialogue/interaction=0.25, short action/combat=0.5, exploration/travel=0.75-1. Only resting (2-4h) and sleeping (6-8h) should exceed 1 hour. Set newDay=true when a new day begins.
For stateChanges.activeEffects: use "add" to place new effects (traps, spells, environmental), "remove" to clear them, "trigger" to mark as triggered. Each needs a unique id.
For stateChanges.currentLocation: update whenever the player moves to a new location.
For stateChanges.mapMode (MANDATORY): Set the procedural field-map mode matching the current scene environment. Exactly one of: "trakt" (road/path between locations), "pola" (open fields, plains, farmland), "wnetrze" (interior — tavern, dungeon room, house, cave), "las" (forest, dense woods). Choose based on WHERE the scene takes place, not the overall biome.
For stateChanges.roadVariant: ONLY set when mapMode is "trakt". Describes the road surroundings. One of: "pola" (road through fields/plains), "las" (road through forest), "miasto" (road through town/city). Use null when mapMode is not "trakt".
${needsSystemEnabled ? 'For stateChanges.needsChanges: MANDATORY when the character eats, drinks, uses a toilet, bathes, or rests — you MUST include non-zero deltas. Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger and +40 thirst. Typical values: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet → set bladder to 100, bath +60-80 hygiene, nap +20-30 rest. SLEEPING AT INN/TAVERN: restore ALL needs to 100 (the character eats, drinks, uses the privy, washes, and sleeps). Set all values to 0 only when no need was satisfied in this scene. Needs only affect narration when below 10.\n' : ''}
For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.
For sceneGrid: MANDATORY in every scene. Build a coherent 2D grid around the current action. width/height must be 8-16, tiles must exactly match those dimensions, and every row must be equal length. Use tile symbols: W=wall, F=floor, P=player start, E=exit/path, D=door, I=interactive point. Include entities with x/y coordinates for player and all visible NPCs/enemies. Keep entities on walkable tiles only.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized or shortened). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names across scenes. Every dialogue segment MUST have a "gender" field ("male" or "female").${needsSystemEnabled ? buildNeedsEnforcementReminder(characterNeeds) : ''}${buildPacingPressure(scenes)}${shouldGenerateDilemma(scenes) ? '\nDILEMMA OPPORTUNITY: It has been several scenes since the last moral dilemma. Consider presenting one if the narrative naturally supports it — include a "dilemma" field with 2-4 meaningful choices.\n' : ''}${langReminder}`;
}

export function buildCampaignCreationPrompt(settings, language = 'en') {
  const langInstruction = language === 'pl'
    ? '\n\nIMPORTANT: Write ALL text content (name, worldDescription, hook, character backstory, narrative, quest names, quest descriptions, quest completion conditions, quest objectives, world facts, suggested actions) in Polish.'
    : '';

  const characterNameLine = settings.characterName?.trim()
    ? `- Player's character name: "${settings.characterName.trim()}" (use this exact name for the character)`
    : '- Player\'s character name: not specified (suggest a fitting name)';

  const speciesLine = settings.species
    ? `- Character species: ${settings.species}`
    : '- Character species: not specified (suggest a fitting species — Human, Halfling, Dwarf, High Elf, or Wood Elf)';

  const careerLine = settings.careerPreference
    ? `- Preferred career: ${settings.careerPreference}`
    : '- Career: not specified (suggest a career fitting the story and species)';

  const existingCharNote = settings.existingCharacter
    ? `\n\nIMPORTANT: The player is using a PRE-EXISTING character named "${settings.characterName?.trim() || settings.existingCharacter.name}". Do NOT rename this character or invent a different name. Use this exact name consistently in the firstScene narrative and dialogueSegments. The characterSuggestion stats will be ignored — focus on making the firstScene narrative fit this character's identity.`
    : '';

  const humorousToneGuidance = settings.tone === 'Humorous'
    ? `\n\nHUMOROUS TONE GUIDELINES: The humor must NOT rely on random absurdity, slapstick, or zaniness. Ground the campaign in a believable world and derive comedy from character flaws, social misunderstandings, irony, awkward situations, and moral dilemmas. Keep wit sharp but varied. Avoid repeating one joke template or one recurring comparison (for example constant tax/tax-collector jokes).`
    : '';

  return `Create a new WFRP 4th Edition campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
${characterNameLine}
${speciesLine}
${careerLine}
- Player's story idea: "${settings.storyPrompt}"
${langInstruction}${existingCharNote}${humorousToneGuidance}

Generate the campaign foundation. The game uses Warhammer Fantasy Roleplay 4th Edition rules. The 10 characteristics are: WS (Weapon Skill), BS (Ballistic Skill), S (Strength), T (Toughness), I (Initiative), Ag (Agility), Dex (Dexterity), Int (Intelligence), WP (Willpower), Fel (Fellowship). Each characteristic is generated as 2d10 + species base modifier (typically 20 for Humans).

Respond with ONLY valid JSON:
{
  "name": "A compelling campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world, its history, factions, and current state of the Old World",
  "hook": "1-2 paragraphs presenting the story hook that draws the player into the adventure",
  "characterSuggestion": {
    "name": "${settings.characterName?.trim() || 'A fitting character name'}",
    "species": "${settings.species || 'Human'}",
    "career": {
      "class": "Career class (Academics/Burghers/Courtiers/Peasants/Rangers/Riverfolk/Rogues/Warriors)",
      "name": "Career name (e.g. Soldier, Wizard, Rat Catcher)",
      "tier": 1,
      "tierName": "Tier 1 name of the career",
      "status": "Social status (e.g. Silver 1, Brass 3)"
    },
    "characteristics": {
      "ws": 31, "bs": 25, "s": 34, "t": 28, "i": 30,
      "ag": 33, "dex": 27, "int": 35, "wp": 29, "fel": 32
    },
    "skills": {"Melee (Basic)": 5, "Dodge": 3, "Cool": 3, "Endurance": 5, "Perception": 3, "Athletics": 3, "Gossip": 3, "Ranged (Bow)": 3},
    "talents": ["Warrior Born", "Drilled"],
    "fate": 2,
    "resilience": 1,
    "backstory": "2-3 sentences of character backstory tied to the world and the Old World setting",
    "inventory": [{"id": "item_1", "name": "Hand Weapon", "type": "weapon", "description": "A sturdy sword", "rarity": "common"}],
    "money": {"gold": 0, "silver": 5, "copper": 0}
  },
  "firstScene": {
    "narrative": "1-2 short vivid paragraphs of the opening scene",
    "dialogueSegments": [
      {"type": "narration", "text": "Descriptive prose..."},
      {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."}
    ],
    "soundEffect": "Short English ambient sound description or null",
    "musicPrompt": "Short English description of ideal instrumental background music for the opening scene",
    "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
    "sceneGrid": {
      "width": 12,
      "height": 12,
      "tiles": [["W","W","W","W"],["W","P","F","E"],["W","F","I","W"],["W","W","W","W"]],
      "entities": [
        {"name": "Player Name", "type": "player", "x": 1, "y": 1, "marker": "@"},
        {"name": "NPC Name", "type": "npc", "x": 2, "y": 2, "marker": "N"}
      ]
    },
    "atmosphere": {
      "weather": "clear | rain | snow | storm | fog | fire",
      "particles": "magic_dust | sparks | embers | arcane | none",
      "mood": "mystical | dark | peaceful | tense | chaotic",
      "lighting": "natural | night | dawn | bright | rays | candlelight | moonlight",
      "transition": "fade"
    },
    "suggestedActions": ["I look around and take in the situation", "I greet the nearest person and introduce myself", "I keep quiet and observe", "I head toward the most interesting lead I can see"],
    "journalEntries": ["Concise 1-2 sentence summary of a key event from the opening scene"]
  },
  "initialQuest": {
    "name": "${language === 'pl' ? 'Nazwa głównego zadania' : 'Main quest name'}",
    "description": "${language === 'pl' ? 'Rozbudowany opis zadania z kontekstem fabularnym' : 'Detailed quest description with story context'}",
    "completionCondition": "${language === 'pl' ? 'Co trzeba zrobić, aby ukończyć to zadanie' : 'What must be done to complete this quest'}",
    "type": "main",
    "questGiverId": "${language === 'pl' ? 'Imię NPC zlecającego' : 'Quest giver NPC name'}",
    "turnInNpcId": "${language === 'pl' ? 'Imię NPC do zdania raportu' : 'NPC name to report completion to'}",
    "locationId": "${language === 'pl' ? 'Główna lokalizacja zadania' : 'Main quest location'}",
    "reward": {
      "xp": 200,
      "money": {"gold": 5, "silver": 10, "copper": 0},
      "items": [{"id": "reward_1", "name": "${language === 'pl' ? 'Nazwa nagrody' : 'Reward item name'}", "type": "weapon|armor|trinket|consumable", "description": "${language === 'pl' ? 'Opis nagrody' : 'Reward item description'}", "rarity": "uncommon"}],
      "description": "${language === 'pl' ? '200 PD, 5 Złotych Koron, 10 Srebrnych Szylingów i przedmiot' : '200 XP, 5 Gold Crowns, 10 Silver Shillings and an item'}"
    },
    "objectives": [
      {"id": "obj_1", "description": "${language === 'pl' ? 'Spotkaj się z NPC_1 w lokalizacji_1 — dowiedz się o problemie' : 'Meet NPC_1 at location_1 — learn about the problem'}"},
      {"id": "obj_2", "description": "${language === 'pl' ? 'Zbierz informacje od NPC_2 w lokalizacji_2' : 'Gather information from NPC_2 at location_2'}"},
      {"id": "obj_3", "description": "${language === 'pl' ? 'Zdobądź kluczowy przedmiot (qitem_1) z lokalizacji_3' : 'Obtain key item (qitem_1) from location_3'}"},
      {"id": "obj_4", "description": "${language === 'pl' ? 'Przeszukaj lokalizację_4 w poszukiwaniu wskazówek' : 'Search location_4 for clues'}"},
      {"id": "obj_5", "description": "${language === 'pl' ? 'Porozmawiaj z NPC_3 — przekonaj go do pomocy' : 'Talk to NPC_3 — convince them to help'}"},
      {"id": "obj_6", "description": "${language === 'pl' ? 'Dostarcz przedmiot (qitem_2) do NPC_4 w lokalizacji_5' : 'Deliver item (qitem_2) to NPC_4 at location_5'}"},
      {"id": "obj_7", "description": "${language === 'pl' ? 'Zmierz się z przeszkodą lub wrogiem w lokalizacji_6' : 'Face an obstacle or enemy at location_6'}"},
      {"id": "obj_8", "description": "${language === 'pl' ? 'Użyj zdobytej wiedzy/przedmiotu aby rozwiązać zagadkę' : 'Use acquired knowledge/item to solve the puzzle'}"},
      {"id": "obj_9", "description": "${language === 'pl' ? 'Wróć do zleceniodawcy z dowodem wykonania zadania' : 'Return to quest giver with proof of completion'}"}
    ],
    "questItems": [
      {"id": "qitem_1", "name": "${language === 'pl' ? 'Nazwa przedmiotu 1' : 'Item 1 name'}", "type": "key_item|document|artifact|tool|ingredient", "description": "${language === 'pl' ? 'Co to jest i dlaczego jest ważne' : 'What it is and why it matters'}", "relatedObjectiveId": "obj_3", "location": "${language === 'pl' ? 'Gdzie go znaleźć lub kto go posiada' : 'Where to find it or who has it'}"},
      {"id": "qitem_2", "name": "${language === 'pl' ? 'Nazwa przedmiotu 2' : 'Item 2 name'}", "type": "key_item|document|artifact|tool|ingredient", "description": "${language === 'pl' ? 'Co to jest i dlaczego jest ważne' : 'What it is and why it matters'}", "relatedObjectiveId": "obj_6", "location": "${language === 'pl' ? 'Gdzie go znaleźć lub kto go posiada' : 'Where to find it or who has it'}"},
      {"id": "qitem_3", "name": "${language === 'pl' ? 'Nazwa przedmiotu 3' : 'Item 3 name'}", "type": "key_item|document|artifact|tool|ingredient", "description": "${language === 'pl' ? 'Co to jest i dlaczego jest ważne' : 'What it is and why it matters'}", "relatedObjectiveId": "obj_8", "location": "${language === 'pl' ? 'Gdzie go znaleźć lub kto go posiada' : 'Where to find it or who has it'}"}
    ]
  },
  "initialNPCs": [
    {"name": "NPC_1 full name", "gender": "male|female", "role": "${language === 'pl' ? 'rola fabularna (np. zleceniodawca, informator, kupiec)' : 'story role (e.g. quest giver, informant, merchant)'}", "personality": "${language === 'pl' ? 'Krótki opis osobowości' : 'Brief personality description'}", "location": "${language === 'pl' ? 'Gdzie można go znaleźć' : 'Where they can be found'}", "attitude": "friendly|neutral|hostile|suspicious", "relatedObjectiveIds": ["obj_1"]},
    {"name": "NPC_2 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_2"]},
    {"name": "NPC_3 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_5"]},
    {"name": "NPC_4 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_6"]},
    {"name": "NPC_5 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_7"]}
  ],
  "initialWorldFacts": ["Fact 1 about the world", "Fact 2", "Fact 3", "Fact 4", "Fact 5"],
  "campaignStructure": {
    "acts": [
      {"number": 1, "name": "Setup", "targetScenes": 8, "description": "Introduce the world, characters, and central conflict"},
      {"number": 2, "name": "Confrontation", "targetScenes": 12, "description": "Escalate the conflict, raise the stakes"},
      {"number": 3, "name": "Climax", "targetScenes": 5, "description": "Final confrontation and resolution"}
    ],
    "currentAct": 1,
    "totalTargetScenes": 25
  }
}

IMPORTANT for campaignStructure:
- Base the act structure on the campaign length: Short (~15 scenes, 3 acts: 5/7/3), Medium (~25 scenes, 3 acts: 8/12/5), Long (~40 scenes, 3 acts: 12/18/10), Epic (~60+ scenes, 4 acts: 15/20/15/10).
- Each act needs a name, target scene count, and brief description of its narrative purpose.
- totalTargetScenes should be the sum of all act target scenes.

IMPORTANT for initialQuest and initialNPCs:
- The initialQuest MUST have 9-12 objectives forming a coherent multi-step story arc — NOT generic placeholders.
- Mix objective types: NPC conversations/meetings (at least 4), item retrieval (at least 2), location exploration/investigation (at least 1), combat/confrontation (at least 1), puzzle/skill challenge (at least 1).
- Each objective referencing an NPC meeting MUST correspond to a named NPC in initialNPCs. Use the NPC's actual name in the objective description.
- Each objective referencing an item MUST correspond to an entry in questItems. Use the item's actual name in the objective description.
- Objectives should follow a logical narrative order: early objectives involve gathering information and allies, middle objectives involve acquiring items and overcoming obstacles, late objectives involve confrontation and resolution.
- initialNPCs must contain 5-8 unique NPCs with distinct names, roles, personalities, and locations. Spread them across different locations in the starting area.
- Each NPC's relatedObjectiveIds must list the objective IDs they are involved in.
- questItems must contain 3-5 items that are central to the quest. Each item must have a relatedObjectiveId linking it to the objective where it's obtained or used.
- questItems represent things to find/acquire during the quest — they are NOT in the player's inventory at the start.
- reward.items should include at least one meaningful reward item (weapon, armor, trinket, or special item).
- initialWorldFacts should include 5+ facts that establish the world context relevant to the quest.
- The quest giver NPC (questGiverId) MUST be one of the NPCs in initialNPCs.

IMPORTANT for characterSuggestion:
- Generate realistic WFRP characteristics: each is 2d10 + species base (20 for Human). Values typically range 21-40, center around 30.
- Skills object maps skill name to number of advances (typically 3-10 for starting character). Include 6-10 career-appropriate skills.
- Include 1-3 starting talents from the career's tier 1 talent list.
- Set fate/resilience based on species (Human: fate 2, resilience 1; Dwarf: fate 0, resilience 2; Halfling: fate 0, resilience 2; Elves: fate 0, resilience 0).
- Include 2-5 starting inventory items appropriate for the career (weapons, tools, trappings).
- Set starting money based on career status tier: Brass careers get {gold:0, silver:0, copper:10-20}, Silver careers get {gold:0, silver:3-8, copper:0}, Gold careers get {gold:2-8, silver:0, copper:0}.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized or shortened). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST have a "gender" field ("male" or "female").
The firstScene.sceneGrid field is MANDATORY: include a coherent 2D board (8-16 width/height), valid tiles, and entity coordinates for player + visible NPCs.

IMPORTANT for firstScene stateChanges (if included) or top-level initialMapMode: Include "mapMode" in the firstScene's context. The opening scene should establish the field-map mode: "trakt" (road/path), "pola" (open fields), "wnetrze" (interior), or "las" (forest). If the scene starts in a tavern, set "wnetrze"; if on a road, set "trakt"; if in a forest, set "las"; if in open countryside, set "pola".`;
}

const SANITIZE_PATTERNS = [
  /\b(blood|bloody|bleeding|bloodied|bloodstain(ed)?)\b/gi,
  /\b(gore|gory|guts|entrails|viscera|dismember(ed|ment)?)\b/gi,
  /\b(corpse|dead\s+bod(y|ies)|severed|decapitat(ed|ion)|mutilat(ed|ion))\b/gi,
  /\b(murder(ed|ing)?|kill(ed|ing)|slaughter(ed|ing)?|massacre)\b/gi,
  /\b(torture(d|ing)?|torment(ed|ing)?)\b/gi,
  /\b(naked|nude|undress(ed)?)\b/gi,
  /\b(slave(ry|s)?|rape|assault(ed|ing)?)\b/gi,
  /\b(suicide|self-harm)\b/gi,
  /\b(drug|narcotic|opium|warpstone)\b/gi,
];

function sanitizeForImageGen(text) {
  let sanitized = text;
  for (const pattern of SANITIZE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

const IMAGE_STYLE_PROMPTS = {
  illustration: {
    prompt: 'digital illustration, clean defined linework, vibrant saturated colors, fantasy book illustration, detailed ink-and-color art style',
    portrait: 'detailed character illustration, clean linework, vibrant colors, fantasy book art style',
    negative: 'photograph, photorealistic, 3d render, blurry',
  },
  pencil: {
    prompt: 'pencil sketch on textured paper, graphite drawing, expressive crosshatching, delicate shading, monochrome pencil art, hand-drawn feel',
    portrait: 'graphite pencil portrait, crosshatching, paper texture, monochrome sketch, detailed shading',
    negative: 'color, photograph, photorealistic, digital art, painting',
  },
  noir: {
    prompt: 'film noir style, stark high-contrast black and white, dramatic deep shadows, chiaroscuro lighting, 1940s hard-boiled detective aesthetic, venetian blind light',
    portrait: 'film noir portrait, high contrast black and white, dramatic shadow across face, chiaroscuro, smoky atmosphere',
    negative: 'color, bright, cheerful, cartoon, anime',
  },
  anime: {
    prompt: 'anime art style, cel-shaded, vivid colors, expressive eyes, dynamic composition, detailed anime background, Studio Ghibli quality',
    portrait: 'anime character portrait, cel-shaded, large expressive eyes, vivid colors, clean lines, detailed anime style',
    negative: 'photorealistic, photograph, 3d render, western cartoon',
  },
  painting: {
    prompt: 'classical oil painting, rich impasto brushstrokes, Renaissance chiaroscuro, deep warm palette, museum-quality fine art, canvas texture visible',
    portrait: 'oil painting portrait, rich brushwork, warm candlelight, Renaissance master style, deep colors, visible canvas texture',
    negative: 'photograph, digital art, cartoon, anime, sketch, flat colors',
  },
  watercolor: {
    prompt: 'delicate watercolor painting, soft translucent washes, wet-on-wet bleeding edges, visible paper grain, gentle pastel palette, impressionistic atmosphere',
    portrait: 'watercolor portrait, soft translucent washes, bleeding edges, visible paper texture, pastel tones, impressionistic',
    negative: 'photograph, photorealistic, digital art, sharp lines, anime',
  },
  comic: {
    prompt: 'comic book art style, bold black outlines, flat cel colors, halftone dot shading, dynamic panel composition, action-packed graphic novel aesthetic',
    portrait: 'comic book character portrait, bold ink outlines, flat cel colors, halftone shading, dynamic superhero comic style',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft',
  },
  darkFantasy: {
    prompt: 'dark fantasy art, Beksinski-inspired eldritch atmosphere, oppressive gothic architecture, sickly muted palette, visceral organic textures, nightmarish surreal composition',
    portrait: 'dark fantasy portrait, haunted hollow eyes, scarred weathered face, gothic atmosphere, sickly palette, nightmarish eldritch details',
    negative: 'bright, cheerful, cartoon, anime, clean, happy',
  },
  vanGogh: {
    prompt: 'post-impressionist painting in the style of Van Gogh, expressive swirling brushstrokes, thick impasto texture, luminous night-sky colors, emotional dramatic movement, vivid painterly energy',
    portrait: 'post-impressionist portrait inspired by Van Gogh, swirling brushwork, thick impasto texture, vivid expressive colors, emotional painterly lighting',
    negative: 'photograph, photorealistic, 3d render, flat shading, smooth digital art',
  },
  photoreal: {
    prompt: 'photorealistic cinematic photograph, shallow depth of field, RAW photo quality, 8K UHD, DSLR, natural film grain, realistic lighting and materials',
    portrait: 'photorealistic portrait photograph, DSLR quality, shallow depth of field, natural skin texture, cinematic lighting, 8K detail',
    negative: 'painting, drawing, illustration, cartoon, anime, sketch, watercolor, digital art',
  },
  retro: {
    prompt: '16-bit pixel art, retro SNES-era RPG scene, limited color palette, dithering, nostalgic low-resolution aesthetic, crisp individual pixels visible',
    portrait: '16-bit pixel art character portrait, retro RPG style, limited palette, clean pixel work, nostalgic SNES aesthetic',
    negative: 'photorealistic, photograph, high resolution, smooth, blurry, 3d render',
  },
  gothic: {
    prompt: 'gothic fantasy artwork, towering cathedral arches, ornate stonework, candlelit gloom, medieval illuminated detail, solemn dramatic composition, sacred and ominous atmosphere',
    portrait: 'gothic portrait, cathedral-lit face, ornate medieval costume details, candlelit shadows, solemn sacred atmosphere, dramatic old-world elegance',
    negative: 'modern, sci-fi, cartoon, anime, cheerful, bright daylight',
  },
  hiphop: {
    prompt: 'urban hip-hop graffiti art style, bold spray-paint strokes, vibrant neon colors on concrete, street art murals, dripping paint, boombox culture aesthetic, thick outlines, stylized lettering accents',
    portrait: 'hip-hop street art portrait, spray-paint on brick wall, bold outlines, vibrant neon colors, graffiti style, urban swagger, dripping paint details',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft, pastel, delicate',
  },
  crayon: {
    prompt: 'child-like crayon drawing on white paper, waxy texture, uneven coloring, playful naive art style, visible paper grain, bright primary colors, simple bold shapes, charming imperfect lines',
    portrait: 'crayon portrait drawing, waxy colorful strokes, child-like naive art style, uneven coloring, white paper background, playful and charming',
    negative: 'photorealistic, photograph, digital art, clean lines, professional, polished, 3d render',
  },
};

const TONE_MODIFIERS = {
  Dark: 'moody, desaturated colors, deep shadows, somber ominous atmosphere',
  Epic: 'grand scale, dramatic golden-hour lighting, heroic composition, sweeping vista',
  Humorous: 'warm vibrant colors, whimsical playful details, lighthearted cheerful mood',
};

const SERIOUSNESS_MODIFIERS = {
  silly: 'whimsical goofy scene, exaggerated cartoon-like proportions, playful absurd humor, comical expressions, slapstick energy',
  lighthearted: 'lighthearted cheerful mood, playful atmosphere, warm inviting tones, slight whimsy',
  serious: 'serious dignified atmosphere, realistic proportions, dramatic weight, solemn composed mood',
  grave: 'gravely somber atmosphere, oppressive heavy mood, no levity, dark weighty tension, haunting stillness',
};

function getSeriousnessDirective(seriousness) {
  const val = seriousness ?? 50;
  if (val < 25) return SERIOUSNESS_MODIFIERS.silly;
  if (val < 50) return SERIOUSNESS_MODIFIERS.lighthearted;
  if (val < 75) return SERIOUSNESS_MODIFIERS.serious;
  return SERIOUSNESS_MODIFIERS.grave;
}

function getImageStyleDirective(imageStyle, field = 'prompt') {
  const entry = IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting;
  return entry[field] || entry.prompt;
}

export function getImageStyleNegative(imageStyle) {
  const entry = IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting;
  return entry.negative || '';
}

export function buildImagePrompt(narrative, genre, tone, imagePrompt, provider = 'dalle', imageStyle = 'painting', darkPalette = false, characterAge = null, characterGender = null, seriousness = null, hasPortraitRef = false) {
  const isGemini = provider === 'gemini';

  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones, and dark atmospheric hues.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';
  const portraitRefDirective = hasPortraitRef
    ? ' The main character from the reference portrait image must appear in the scene, maintaining their visual identity, face, and likeness.'
    : '';

  const rawDesc = imagePrompt || narrative.substring(0, 300);
  const sceneDesc = sanitizeForImageGen(rawDesc);
  const parsedAge = Number(characterAge);
  const ageDirective = Number.isFinite(parsedAge) ? ` Featured character age: ${Math.max(1, Math.round(parsedAge))}.` : '';
  const genderDirective = characterGender === 'female' || characterGender === 'male'
    ? ` Featured character gender: ${characterGender}.`
    : '';

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective}${ageDirective}${genderDirective} Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting, 16:9 widescreen composition.`;
  }

  return `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective}${ageDirective}${genderDirective}${portraitRefDirective} Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting.`;
}

export function buildSpeculativeImageDescription(previousNarrative, playerAction, diceOutcome) {
  const parts = [];

  if (previousNarrative) {
    parts.push(`Previous scene: ${sanitizeForImageGen(previousNarrative.substring(0, 200))}`);
  }

  const skip = !playerAction || playerAction === '[CONTINUE]' || playerAction === '[WAIT]' || playerAction.startsWith('[IDLE_WORLD_EVENT');
  if (!skip) {
    parts.push(`The character now: ${sanitizeForImageGen(playerAction.substring(0, 150))}`);
  }

  if (diceOutcome) {
    if (diceOutcome.criticalSuccess) {
      parts.push('Outcome: spectacular, extraordinary success — triumphant, glorious moment.');
    } else if (diceOutcome.criticalFailure) {
      parts.push('Outcome: dramatic, catastrophic failure — disaster, chaos, everything goes wrong.');
    } else if (diceOutcome.success) {
      parts.push('Outcome: the action succeeds.');
    } else {
      parts.push('Outcome: the action fails, complications arise.');
    }
  }

  return parts.join(' ');
}

export function buildItemImagePrompt(item, { genre = 'Fantasy', tone = 'Epic', provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null } = {}) {
  const isGemini = provider === 'gemini';
  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';
  const itemName = sanitizeForImageGen(item?.name || 'Unknown item');
  const itemType = sanitizeForImageGen(item?.type || 'misc');
  const itemRarity = sanitizeForImageGen(item?.rarity || 'common');
  const itemDescription = sanitizeForImageGen(item?.description || `${itemName}, ${itemType}`);
  const worldContext = sanitizeForImageGen(genre || 'Fantasy');

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory icon-style artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) in a ${worldContext} world. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
  }

  return `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) from a ${worldContext} setting. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
}

export function buildPortraitPrompt(species, gender, age, careerName, genre = 'Fantasy', provider = 'stability', imageStyle = 'painting', hasReferenceImage = false, darkPalette = false, seriousness = null) {
  const genderLabel = gender === 'female' ? 'female' : 'male';
  const isSD = provider === 'stability';
  const isGemini = provider === 'gemini';

  const speciesTraits = {
    Human: 'human, weathered skin, visible pores and skin texture',
    Halfling: 'halfling, short stature, round cheerful face, rosy cheeks, bright eyes',
    Dwarf: 'dwarf, stocky build, strong jaw, thick brow ridge, deep-set eyes, braided beard',
    'High Elf': 'high elf, pointed ears, high cheekbones, slender refined features, luminous eyes, ethereal complexion',
    'Wood Elf': 'wood elf, pointed ears, angular sharp features, intense wild eyes, sun-kissed weathered skin',
  };

  const styleDirective = getImageStyleDirective(imageStyle, 'portrait');
  const speciesDesc = speciesTraits[species] || 'human, weathered skin, visible pores and skin texture';
  const parsedAge = Number(age);
  const ageDirective = Number.isFinite(parsedAge) ? `, approximately ${Math.max(1, Math.round(parsedAge))} years old` : '';
  const career = careerName ? `, dressed as a ${careerName} with appropriate gear and attire` : '';
  const likenessDirective = hasReferenceImage
    ? 'Preserve a clear likeness to the provided reference image: keep the same face shape, facial proportions, eyes, nose, mouth, hairstyle, and overall identity while reimagining the subject as a fantasy character.'
    : '';
  const darkDirective = darkPalette ? ' Dark moody color palette, deep shadows, low-key lighting, muted desaturated tones.' : '';
  const seriousnessDirective = seriousness != null ? ` ${getSeriousnessDirective(seriousness)}.` : '';

  if (isSD) {
    return `ART STYLE: ${styleDirective}. Close-up portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin imperfections, scars and character lines. Sharp focus on the face, intricate costume, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective} No text, no watermarks.`;
  }

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Detailed face with expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective} Square 1:1 aspect ratio. No text, no watermarks.`;
  }

  if (provider === 'gpt-image') {
    return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin texture and character. Sharp focus on the face, intricate costume details, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective} No text, no watermarks.`;
  }

  return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. Detailed face, expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective} No text, no watermarks, no borders.`;
}

export function buildRecapPrompt(language = 'en', options = {}) {
  const langNote = language === 'pl' ? ' Write the recap in Polish.' : '';
  const sceneCount = Math.max(1, Number(options.sceneCount) || 1);
  const sentencesPerSceneRaw = Number(options.sentencesPerScene);
  const sentencesPerScene = Number.isFinite(sentencesPerSceneRaw)
    ? Math.max(0.25, Math.min(4, sentencesPerSceneRaw))
    : 1;
  const summaryStyle = options.summaryStyle && typeof options.summaryStyle === 'object' ? options.summaryStyle : {};
  const mode = ['story', 'dialogue', 'poem', 'report'].includes(summaryStyle.mode) ? summaryStyle.mode : 'story';
  const literaryStyle = Math.max(0, Math.min(100, Number(summaryStyle.literaryStyle ?? 50)));
  const dramaticity = Math.max(0, Math.min(100, Number(summaryStyle.dramaticity ?? 50)));
  const factuality = Math.max(0, Math.min(100, Number(summaryStyle.factuality ?? 50)));
  const dialogueParticipants = Math.max(2, Math.min(6, Math.round(Number(summaryStyle.dialogueParticipants ?? 3))));
  const targetSentenceCount = Math.max(1, Math.round(sceneCount * sentencesPerScene));
  const poemTargetLineCount = Math.max(2, targetSentenceCount * 2);
  const isPolish = language === 'pl';
  const modeRule = mode === 'dialogue'
    ? `MODE: Dialogue recap. Write the recap as a conversation between exactly ${dialogueParticipants} distinct speakers discussing what happened. Keep speaker names short (e.g., "A:", "B:") and preserve chronological order. Output only dialogue lines prefixed with speaker labels, no plain prose paragraphs.`
    : mode === 'poem'
      ? `MODE: Strongly rhymed poem. Write the recap as a playful, energetic poem in a classic Polish cabaret/ballad spirit (Tuwim-like vibe), preserving concrete facts and chronology. Prioritize clear end-rhymes in almost every line, avoid blank verse, and prefer full/perfect rhymes over weak near-rhymes.${isPolish ? ' In each rhyme pair, match the final 2-3 syllables as closely as possible.' : ' Keep rhyme endings phonetically very close.'} Output only poetic lines and stanza breaks, no prose paragraphs.`
      : mode === 'report'
        ? 'MODE: Report. Write a concise factual report: fact after fact, minimal embellishment, clear causal links.'
        : 'MODE: Story. Write as a flowing narrative recap.';
  const structureRule = mode === 'poem'
    ? `- Use 2-4 stanzas separated by a blank line.
- Keep rhythm lively, singable, and punchy.
- In each stanza, enforce one explicit rhyme scheme: AABB or ABAB.
- Every non-empty line must end with a clearly rhyming word.
- Make adjacent rhyme pairs explicit and audible at line endings.
- Use shorter lines and break lines often.
- Aim for one line per short clause; split long thoughts into two separate lines.
- For Polish output, every non-empty line must have exactly 13 syllables.
- For Polish output, enforce a caesura as 6+7 syllables (preferred) or 7+6 if needed for natural diction.
- For Polish output, add a middle rhyme across neighboring lines: the post-caesura segment (7 or 6-7 cadence) should echo/rhyme with the next line's post-caesura segment.
- Prefer lexical rhymes (content words), avoid weak grammatical rhymes based only on inflection endings.
${isPolish ? '- In each rhyme pair, keep the final vowel group and consonant tail closely matched.' : '- Keep rhyme endings tightly consistent within each rhyme pair.'}
- Add extra rhyme density: include internal rhyme (or a strong echo rhyme) in at least every second non-empty line.
- Keep line breaks in the output (do not merge into a paragraph).
- Do not split one logical verse into two display lines.`
    : mode === 'dialogue'
      ? '- Use speaker-prefixed lines (Speaker: text).\n- Every non-empty line must start with "<speaker>:".\n- Keep line breaks in the output (one spoken turn per line).\n- No bullet points, numbering, checklist formatting, or section headers.'
      : '- Format as multiple paragraphs.\n- Each paragraph must contain 3 to 6 sentences.\n- Separate paragraphs with a blank line.\n- Strictly no bullet points, numbering, checklist formatting, or section headers.';
  const lengthRule = mode === 'poem'
    ? `- Scene count: ${sceneCount}
- Target density: ${sentencesPerScene} line(s) per scene
- Write exactly ${poemTargetLineCount} non-empty poetic lines in total (blank stanza separators do not count).
- Preserve chronological order.
- If density is below 1.0, merge nearby scenes while still covering the full timeline.
- If density is above 1.0, add richer detail per scene while staying factual.`
    : `- Scene count: ${sceneCount}
- Target density: ${sentencesPerScene} sentence(s) per scene
- Write exactly ${targetSentenceCount} sentences in total.
- Keep strict sentence boundaries (avoid semicolon chains pretending to be one sentence).
- Preserve chronological order.
- If density is below 1.0, merge nearby scenes while still covering the full timeline.
- If density is above 1.0, add richer detail per scene while staying factual.`;

  return `Based on the scene history in the system context, generate a "Previously on..." recap that summarizes key events, decisions, and consequences.
STYLE RULES:
${modeRule}
- Literary style intensity: ${literaryStyle}/100 (higher = richer language and imagery).
- Dramaticity: ${dramaticity}/100 (higher = stronger emotional and cinematic emphasis).
- Factuality: ${factuality}/100 (higher = concrete facts, lower = more impressionistic phrasing).
- Always preserve key facts, outcomes, and timeline continuity.
IMPORTANT LENGTH RULE:
${lengthRule}
STRUCTURE RULES:
${structureRule}
${langNote}
Respond with ONLY valid JSON: {"recap": "The recap text..."}`;
}

export function buildRecapMergePrompt(language = 'en', recapParts = [], options = {}) {
  const sanitizedParts = Array.isArray(recapParts)
    ? recapParts
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
    : [];
  const basePrompt = buildRecapPrompt(language, options);
  const partsBlock = sanitizedParts
    .map((part, idx) => `PART ${idx + 1}:\n${part}`)
    .join('\n\n');

  return `${basePrompt}

You are combining partial recaps generated from sequential scene chunks.
- Merge all parts into one cohesive recap.
- Keep strict chronological flow from PART 1 to the last PART.
- Remove duplicated events/details when they overlap between neighboring parts.
- Preserve key decisions, consequences, unresolved threads, and named entities.
- If two parts conflict on outcome details, prefer the later part.

PARTIAL RECAPS (already in chronological order):
${partsBlock}`;
}

export function buildObjectiveVerificationPrompt(storyContext, questName, questDescription, objectiveDescription, language = 'en') {
  const lang = language === 'pl' ? 'Polish' : 'English';
  return {
    system: `You are an impartial story analyst for a tabletop RPG game. Your job is to determine whether a specific quest objective has been fulfilled based on the events that occurred in the story. Analyze the provided story context carefully and objectively. Respond with ONLY valid JSON.`,
    user: `Analyze the following story to determine if the quest objective has been fulfilled.

STORY CONTEXT:
${storyContext}

QUEST: ${questName}
Quest description: ${questDescription}

OBJECTIVE TO VERIFY: "${objectiveDescription}"

Has this specific objective been fulfilled based on the story events? Consider partial or indirect fulfillment as well — if the spirit of the objective has been met, it counts as fulfilled.

Respond with ONLY valid JSON:
{"fulfilled": true or false, "reasoning": "A brief 1-2 sentence explanation in ${lang} of why the objective is or is not fulfilled based on story events."}`
  };
}
