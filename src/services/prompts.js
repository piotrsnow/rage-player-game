import { getBonus, formatMoney } from './gameState';
import { BESTIARY, formatBestiaryForPrompt } from '../data/wfrpBestiary';
import { FACTION_DEFINITIONS, getReputationTier } from '../data/wfrpFactions';
import { formatCriticalWoundsForPrompt } from '../data/wfrpCriticals';
import { formatMagicForPrompt } from '../data/wfrpMagic';
import { formatWeatherForPrompt } from './weatherEngine';
import { formatEquipmentForPrompt } from '../data/wfrpEquipment';
import { extractActionParts, extractDialogueParts, hasDialogue } from './actionParser';

export const COMBAT_INTENT_REGEX = /\b(atak|atakuj[eę]?|walcz[eęy]?|walk[eęiąa]|rozpoczynam|rzucam\s+si[eę]|wyzywam|bij[eę]|uderz(?:am|e)|zabij|zaatakuj|dobywam|wyci[aą]gam\s+(?:miecz|bro[nń]|topor|n[oó][zż]|sztylet)|attack|fight|strike|hit|punch|stab|slash|shoot|kill|combat|draw\s*(?:my\s+)?(?:sword|weapon|blade|axe|knife|dagger))\b/i;

export function detectCombatIntent(playerAction) {
  if (!playerAction) return false;
  if (playerAction.startsWith('[Combat resolved:')) return false;
  if (playerAction.startsWith('[INITIATE COMBAT]') || playerAction.startsWith('[ATTACK:')) return true;
  return COMBAT_INTENT_REGEX.test(playerAction);
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
3. At least ONE of the four suggestedActions MUST address the most urgent unmet need (e.g. "Find food", "Look for a well", "Find a place to rest").
4. Apply a -10 penalty to related skill tests in your diceRoll target calculation (hunger/thirst penalize physical tests, rest penalizes all tests, hygiene penalizes social tests).\n`;
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

export function buildSystemPrompt(gameState, dmSettings, language = 'en', enhancedContext = null, { needsSystemEnabled = false, consistencyWarnings = [] } = {}) {
  const { campaign, character, world, quests } = gameState;

  const activeQuests = quests.active.map((q) => {
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
  const worldFacts = (world?.facts || []).slice(-20).join('\n') || 'No known facts yet.';
  const journal = (world?.eventHistory || []).length > 0
    ? world.eventHistory.map((e, i) => `${i + 1}. ${e}`).join('\n')
    : 'No entries yet.';
  const inventory = character?.inventory?.map((i) => `${i.name} (${i.type})`).join(', ') || 'Empty';
  const moneyDisplay = character?.money ? formatMoney(character.money) : '0 CP';
  const statuses = character?.statuses?.join(', ') || 'None';

  const difficultyLabel = dmSettings.difficulty < 25 ? 'Easy' : dmSettings.difficulty < 50 ? 'Normal' : dmSettings.difficulty < 75 ? 'Hard' : 'Expert';
  const narrativeLabel = dmSettings.narrativeStyle < 25 ? 'Predictable' : dmSettings.narrativeStyle < 50 ? 'Balanced' : dmSettings.narrativeStyle < 75 ? 'Chaotic' : 'Wild';
  const responseLabel = dmSettings.responseLength < 33 ? 'short (2-3 sentences)' : dmSettings.responseLength < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)';

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
  const humorLabel = (dmSettings.narratorHumor ?? 20) < 25 ? 'completely serious' : (dmSettings.narratorHumor ?? 20) < 50 ? 'occasional dry wit' : (dmSettings.narratorHumor ?? 20) < 75 ? 'frequent humor woven into narration, comedy grounded in controversial or morally ambiguous situations' : 'heavily comedic and irreverent — humor drawn from controversial topics, provocative characters, social satire, and dark irony rather than pure absurdity (think Pratchett/Monty Python: sharp wit about real uncomfortable issues)';
  const dramaLabel = (dmSettings.narratorDrama ?? 50) < 25 ? 'understated and subtle' : (dmSettings.narratorDrama ?? 50) < 50 ? 'measured dramatic pacing' : (dmSettings.narratorDrama ?? 50) < 75 ? 'heightened drama and tension' : 'maximally theatrical, grandiose and operatic';

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

  const talentList = character?.talents?.length > 0 ? character.talents.join(', ') : 'None';

  const careerInfo = character?.career
    ? `${character.career.name} (${character.career.class}), Tier ${character.career.tier}: ${character.career.tierName}, Status: ${character.career.status}`
    : 'Unknown';

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
        .map((s) => `Scene ${s.index}${s.action ? ` [Player: ${s.action}]` : ''}:\n${s.narrative}`)
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
    const scenes = gameState.scenes || [];
    sceneHistory = scenes.slice(-10).map((s, i) => `Scene ${i + 1}: ${s.narrative?.substring(0, 200)}...`).join('\n') || 'No scenes yet - this is the beginning of the story.';
  }

  return `You are the Game Master AI for "${campaign?.name || 'Unnamed Campaign'}", running under the Warhammer Fantasy Roleplay 4th Edition (WFRP 4e) rules system.

CAMPAIGN SETTINGS:
- Genre: ${campaign?.genre || 'Fantasy'}
- Tone: ${campaign?.tone || 'Epic'}
- Play Style: ${campaign?.style || 'Hybrid'} (narrative + d100 skill tests)
- Difficulty: ${difficultyLabel}
- Narrative chaos: ${narrativeLabel}
- Response length: ${responseLabel}
- Dice roll frequency: ${testsLabel} (~${testsFrequency}% of actions should require a roll)

NARRATOR VOICE & STYLE:
- Poeticism: ${poeticismLabel}
- Grittiness: ${grittinessLabel}
- Environmental detail: ${detailLabel}
- Humor: ${humorLabel}
- Drama: ${dramaLabel}
Adapt your narration prose style to match ALL of the above parameters simultaneously. They define your voice as the narrator — blend them consistently throughout every scene.

NARRATIVE TONE RULES (anti-purple-prose guardrails):
- VARY PROSE DENSITY BY SCENE TYPE: Action scenes are SHORT and PUNCHY (1-2 paragraphs max, terse sentences, focus on consequences). Exploration is atmospheric but concrete — describe what the character sees, hears, smells, not abstract feelings. Dialogue scenes focus on character voice. Save poetic language for key dramatic moments ONLY.
- AVOID: Excessive metaphors in every paragraph. Overly flowery descriptions of mundane events. A uniform "literary" tone across all NPCs. Multiple adjectives stacked before every noun. Starting every paragraph with a weather or atmosphere description.
- NPC DIALOGUE VARIATION: Each NPC speaks differently. A peasant does not sound like a scholar. A soldier does not sound like a merchant. Dialogue should reveal character, not showcase vocabulary.
- The Old World is grim and perilous. Death is real. Consequences are lasting. Humor exists as dark comedy and gallows wit — it coexists with danger, never replaces it.
- HUMOR COUNTERWEIGHT: Even at high humor settings, maintain real stakes. Funny failures should still hurt mechanically (wounds, lost items, reputation). Comedic NPCs can still be dangerous. Never let humor deflate genuine tension in life-or-death situations.

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
- MANDATORY: At least ONE of the four suggestedActions MUST directly address the most urgent unmet need (e.g. "Search for food", "Find a stream to drink from", "Look for a place to sleep").
- IMPORTANT: Always include stateChanges.timeAdvance with "hoursElapsed" (decimal).
`;
})()}
WFRP 4e RULES FOR THE GM:
- Use the d100 percentile system. When a skill test is needed, start with baseTarget = characteristic + skill advances. Then apply separate modifiers to get the final target.
- EVERY diceRoll MUST include "characteristic" (one of: ws/bs/s/t/i/ag/dex/int/wp/fel), "characteristicValue" (the raw stat value), and "skillAdvances" (advances in the tested skill, 0 if untrained). NEVER return a diceRoll without these fields. Choose the most appropriate characteristic for the action based on WFRP skill definitions above.
- For speech, persuasion, bargaining, bluffing, charming, greeting, asking questions, or other social interaction without a more specific WFRP skill, default to Fel (Fellowship). Do NOT invent non-WFRP stats such as "charisma".
- If you cannot determine a valid WFRP characteristic key for the action, set diceRoll to null instead of guessing.
- IMPORTANT: "difficultyModifier" is a SEPARATE field from baseTarget. Use only this discrete scale: +40, +30, +20, +10, 0, -10, -20, -30, -40.
- Difficulty guide: +40 = routine or almost impossible to fail, +30 = easy, +20 = favorable, +10 = slightly favorable, 0 = standard, -10 = challenging, -20 = hard, -30 = very hard, -40 = extreme / nearly suicidal.
- Do NOT hide task difficulty only inside the final "target". Always expose it explicitly via "difficultyModifier".
- Final target formula: target = baseTarget + capped(creativityBonus + momentumBonus + dispositionBonus) + difficultyModifier.
- "difficultyModifier" is independent from the +30 cap on creativityBonus + momentumBonus + dispositionBonus.
- Success Levels (SL) = (target - roll) ÷ 10, rounded toward 0. Positive SL = degrees of success, negative = degrees of failure.
- A roll of 01-04 always succeeds (critical); 96-00 always fails (critical).
- CRITICAL SUCCESS (roll 01-04): automatic success regardless of target number. Award bonus SL (+1 to +3 extra). Narrate an exceptionally favorable outcome — extra benefits, impressive feats, awed NPCs, found bonus loot, etc.
- CRITICAL FAILURE (roll 96-100): automatic failure regardless of target number. Apply penalty SL (-1 to -3 extra). Narrate a disastrous outcome — additional negative consequences such as injury (woundsChange), broken equipment (removeItems), angered NPCs, environmental hazards triggered, embarrassing mishaps, etc.
- IMPORTANT: When a dice roll results in FAILURE (roll > effective target and not 01-04), the action MUST FAIL in the narrative. The character does NOT achieve what they attempted. Never let a failed roll lead to a successful outcome. Describe how and why the action fails, then present new options. Conversely, when the roll indicates SUCCESS, the narrative MUST describe a successful outcome.
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

NPC DISPOSITION MODIFIERS (apply when a dice roll involves direct interaction with a known NPC):
When the player attempts a social, trade, persuasion, or other interpersonal skill test involving a known NPC, look up that NPC's disposition value from the NPC REGISTRY below and apply the corresponding modifier to the dice target number:
  disposition >= 30 (strong ally): +15 to target
  disposition >= 15 (friendly): +10 to target
  disposition >= 5 (warm): +5 to target
  disposition -5 to +5 (neutral): no modifier
  disposition <= -5 (cool): -5 to target
  disposition <= -15 (hostile): -10 to target
  disposition <= -30 (enemy): -15 to target
When this modifier applies, include "dispositionBonus" in the diceRoll output with the modifier value (e.g. 10, -5, etc.) and mention the NPC name in the skill test narration. Keep this separate from "difficultyModifier".

NPC REGISTRY (reference for consistent characterization — use established personalities and speech patterns):
${npcSection}

NPCs PRESENT AT CURRENT LOCATION (only these NPCs can be directly interacted with unless summoned or newly arriving):
${npcsHereSection}

CURRENT LOCATION & MAP:
Current: ${currentLoc}
Known locations:
${mapSection}

TIME:
${timeSection}

ACTIVE EFFECTS (traps, spells, environmental changes — check before resolving actions in a location):
${effectsSection}

WORLD KNOWLEDGE:
${worldFacts}

STORY JOURNAL (chronological log of key events — use this to maintain narrative consistency):
${journal}

ACTIVE QUESTS:
${activeQuests}

SCENE HISTORY:
${sceneHistory}
${(() => {
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
})()}
${buildRelationshipGraphBlock(npcs, quests, world?.factions)}${consistencyWarnings?.length > 0 ? buildConsistencyWarningsBlock(consistencyWarnings) : ''}LANGUAGE INSTRUCTION:
Write ALL narrative text, dialogue, descriptions, quest names, quest completion conditions, quest objectives, item names, item descriptions, and suggested actions in ${language === 'pl' ? 'Polish' : 'English'}.

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
16. QUEST COMPLETION RULE (CRITICAL): A quest can ONLY be completed (added to completedQuests) when BOTH conditions are met: (a) ALL objectives are marked as completed in questUpdates, AND (b) the player has talked to the turn-in NPC (turnInNpcId, or questGiverId if no turnInNpcId set) about the completed quest in the current scene. Do NOT auto-complete quests — the player must return to the quest giver to report success. When completing a quest, the turn-in NPC should acknowledge the completion, mention the reward, and congratulate the player. If all objectives are done but the player hasn't talked to the NPC yet, suggest returning to the NPC as one of the suggestedActions.
17. ITEM & MONEY ACQUISITION (CRITICAL): When the narrative describes the character picking up, finding, looting, receiving, buying, crafting, or otherwise ACQUIRING any physical object or money, you MUST include the corresponding stateChanges entry. Items go in stateChanges.newItems (with {id, name, type, description, rarity}). Money/coins go in stateChanges.moneyChange (with {gold, silver, copper} deltas). NEVER narrate the character obtaining something without the matching stateChanges — if the narrative says they picked it up, it MUST appear in their inventory or wallet. This applies even for trivial items like a coin, a key, a letter, or food. If a dice roll was required and FAILED, do NOT add the item. If it SUCCEEDED or was auto-success, the item MUST be added.

ACTION FEASIBILITY (MANDATORY — applies BEFORE dice roll decision):
- IMPOSSIBLE ACTIONS (auto-fail, NO dice roll): If the player attempts something physically impossible or targets someone/something not present in the scene (e.g., talking to an NPC who is not at the current location, using a feature that doesn't exist here, attacking an enemy not in combat), set diceRoll to null and narrate the failure — the character looks around but the person isn't here, reaches for something that isn't there, etc. Do NOT waste a dice roll on an impossible action.
- TRIVIAL ACTIONS (auto-success, NO dice roll): If the action is trivially easy with no meaningful chance of failure (e.g., walking a short distance on flat ground, picking up an object at your feet, opening an unlocked door, sitting down), set diceRoll to null and narrate the success directly. These do not need mechanical resolution.
- ROUTINE ACTIONS (auto-success, NEVER roll — regardless of dice frequency): Everyday mundane activities that any healthy person can do without skill or effort. These NEVER require a dice roll, even at 80%+ frequency. Always set diceRoll to null. Examples: eating, drinking, sleeping, resting, sitting down, using a toilet/latrine, bathing, casual conversation, greeting someone, looking around, walking short distances, getting dressed, packing/unpacking belongings, setting up camp (basic), lighting a fire with proper tools. If the needs system is active, apply needsChanges as appropriate.
- UNCERTAIN ACTIONS (normal dice roll): Only use dice rolls for actions with genuinely uncertain outcomes where both success and failure are plausible.
- EXCEPTIONS: A character may summon a companion/familiar, or an NPC may arrive as part of the narrative — but this should be contextually justified, not a way to bypass presence rules. If the player attempts to call someone who could plausibly hear them or arrive shortly, narrate the attempt and its result.
- suggestedActions MUST only include actions that are feasible given who and what is present at the current location. Do not suggest talking to NPCs who are elsewhere.

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
  return `BESTIARY REFERENCE (use these stats for combat encounters instead of inventing stats):\n${formatBestiaryForPrompt(Object.values(BESTIARY).slice(0, 15))}\nUse the stats above for known creature types. For creatures not listed, create comparable stats.\n`;
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
When the character's actions affect a faction's reputation (helping/hindering a guild, temple, criminal organization, military, noble house, or chaos cult), include "factionChanges" in stateChanges: {"guild_name": 5} where positive values improve reputation and negative values worsen it. Faction IDs: merchants_guild, thieves_guild, temple_sigmar, temple_morr, military, noble_houses, chaos_cults, witch_hunters, wizards_college, peasant_folk. Reputation range: -100 to +100.`;
}

export function buildSceneGenerationPrompt(playerAction, isFirstScene = false, language = 'en', { needsSystemEnabled = false, characterNeeds = null, isCustomAction = false, preRolledDice = null, skipDiceRoll = false, momentumBonus = 0 } = {}, dmSettings = null) {
  const langReminder = `\n\nLANGUAGE REMINDER: Write "narrative", "dialogueSegments" text, "suggestedActions", "journalEntries", "worldFacts", quest names/descriptions/completion conditions/objectives, and "questOffers" names/descriptions/rewards in ${language === 'pl' ? 'Polish' : 'English'}. Only "soundEffect", "musicPrompt", and "imagePrompt" should remain in English.`;

  if (isFirstScene) {
    return `Generate the opening scene of this campaign. Set the stage with an atmospheric description that draws the player in.

Respond with ONLY valid JSON in this exact format:
{
  "narrative": "A vivid 2-3 paragraph scene description setting the stage for the adventure...",
  "dialogueSegments": [
    {"type": "narration", "text": "Descriptive prose..."},
    {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."},
    {"type": "narration", "text": "More prose..."}
  ],
  "soundEffect": "Short English description of ambient/atmospheric sound for this scene, or null",
  "musicPrompt": "Short English description of ideal instrumental background music for this scene, or null",
  "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
  "atmosphere": {
    "weather": "rain | snow | storm | clear | fog | fire",
    "particles": "magic_dust | sparks | embers | arcane | none",
    "mood": "mystical | dark | peaceful | tense | chaotic",
    "lighting": "natural | night | dawn | bright | rays | candlelight | moonlight",
    "transition": "dissolve | fade | arcane_wipe"
  },
  "suggestedActions": ["Action option 1", "Action option 2", "Action option 3", "Action option 4"],
  "stateChanges": {
    "journalEntries": ["Concise 1-2 sentence summary of a key event from this scene"],
    "npcs": [{"action": "introduce", "name": "NPC Name", "gender": "male", "role": "innkeeper", "personality": "jovial, loud", "attitude": "friendly", "location": "The Rusty Anchor", "notes": "", "factionId": "merchants_guild", "relationships": []}],
    "mapChanges": [{"location": "Location Name", "modification": "Description of change", "type": "discovery"}],
    "timeAdvance": {"hoursElapsed": 0.5, "newDay": false},
    "activeEffects": [],
    "moneyChange": null,
    "currentLocation": "Location Name",
    "codexUpdates": []${needsSystemEnabled ? ',\n    "needsChanges": {"hunger": 0, "thirst": 0, "bladder": 0, "hygiene": 0, "rest": 0}' : ''}
  },
  "diceRoll": null
}
${needsSystemEnabled ? '\nFor stateChanges.needsChanges: use when the character satisfies a biological need (eating, drinking, toilet, bathing, resting). Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger and +40 thirst. Use null if no needs changed.\n' : ''}
For stateChanges.timeAdvance: ALWAYS include "hoursElapsed" (decimal). Each action typically takes 15 min to 1 hour: quick interaction=0.25, short action/combat=0.5, exploration=0.75-1. Only resting (2-4) and sleeping (6-8) should exceed 1 hour.

For stateChanges.journalEntries: provide 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant player decisions, discoveries, or combat outcomes. Each entry should be a self-contained 1-2 sentence summary. Do NOT log trivial details.

For atmosphere: choose weather, particles, mood, lighting, and transition that match the scene's environment and tone. weather describes the environmental condition, particles adds visual flair (magic_dust for mystical places, sparks for forges/tech, embers for fire/destruction, arcane for magical events), mood sets the overall feel, lighting describes the scene's light source and quality (natural for daylight outdoors, night for darkness/starlight, dawn for sunrise/sunset, bright for strong direct light, rays for god-rays through trees/windows, candlelight for indoor dim light, moonlight for moon-lit nights), and transition is the visual transition into this scene (use "fade" for the opening scene).

For musicPrompt: describe the ideal instrumental background music — mention instruments, tempo, and emotional tone. Keep under 200 characters. Example: "slow strings with harp arpeggios, mysterious and enchanting". Use null only if the scene should be silent.

For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names. Every dialogue segment MUST have a "gender" field.${langReminder}`;
  }

  const needsReminder = needsSystemEnabled ? buildUnmetNeedsBlock(characterNeeds) : '';

  const isIdleWorldEvent = playerAction && playerAction.startsWith('[IDLE_WORLD_EVENT');
  const isPostCombat = playerAction && playerAction.startsWith('[Combat resolved:');
  const isSurrender = isPostCombat && playerAction.includes('player surrendered');
  const isPostCombatDefeat = isPostCombat && (
    playerAction.includes('LOST the fight')
    || playerAction.includes('did NOT win')
    || playerAction.includes('party LOST the fight')
  );

  const actionPart = extractActionParts(playerAction);
  const dialoguePart = extractDialogueParts(playerAction);
  const playerHasDialogue = hasDialogue(playerAction);

  const actionBlock = isIdleWorldEvent
    ? `IDLE WORLD EVENT — NO PLAYER ACTION OCCURRED.

The player has been idle. The world moves on without them. Generate a small, atmospheric ambient event — something mundane, slice-of-life that happens TO or AROUND the character without their initiative.

RULES FOR THIS SCENE (MANDATORY):
- The character did NOT take any action. Do not narrate the character doing something deliberate.
- Something happens in the world spontaneously: a passerby, an animal, weather, a sound, a small incident nearby.
- Examples of appropriate events: a stray cat approaches and rubs against the character's leg, a street vendor loudly hawks their wares nearby, a fat drunkard stumbles into the character, a bird relieves itself on the character's shoulder, a horse spits in their direction, a child tugs at their sleeve asking for coin, a gust of wind scatters papers, a cart wheel breaks nearby, an NPC starts an argument within earshot, rain begins to fall.
- Keep the narrative SHORT (1-2 paragraphs). This is a minor world beat, not a major plot event.
- The event CAN optionally plant a subtle quest hook or introduce a character, but it does NOT have to. Most of the time, keep it purely atmospheric.
- Set diceRoll to null — no skill test is needed.
- Do NOT start combat. Do NOT include combatUpdate.
- suggestedActions should include reactions to what just happened (e.g. "pet the cat", "talk to the vendor", "brush off the mess", "ignore and move on") plus normal exploration options.
- stateChanges should be minimal or empty. A small timeAdvance (5-15 minutes) is appropriate.`
    : isPostCombat
    ? `COMBAT JUST ENDED — ${playerAction}

POST-COMBAT RULES (MANDATORY):
- Do NOT include "combatUpdate" in this scene's stateChanges — combat has JUST ended, do not start another fight.
- Narrate the aftermath: describe the battlefield, fallen enemies, the character's condition and wounds, loot found, NPC reactions if any witnesses are present.
- The character may be wounded — reflect their physical state in the narration (heavy breathing, bleeding, pain from critical wounds).
- Set diceRoll to null — no skill test is needed for this post-combat transition scene.
- Suggest post-combat actions: searching bodies for loot, tending wounds, resting, continuing the journey, investigating why the enemies attacked, etc.
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
- Do NOT let the surrender have zero consequences — the enemies won and should act like victors.` : ''}`
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

  return `${needsReminder}${actionBlock}${combatReminder}
${isPostCombat ? '' : `
ACTION VS SPEECH (CRITICAL — read both rules carefully):
RULE 1 — ACTION PARTS: The ACTION line describes what the character DOES — narrate it as action in prose. Never turn action text into spoken dialogue (the character must NOT announce their own action aloud).
RULE 2 — SPEECH PARTS (MANDATORY): The DIALOGUE line (if present) contains the character's exact in-character speech. You MUST include each quoted phrase as a "dialogue" segment in dialogueSegments with the player character's name and gender. Do NOT skip, paraphrase, or fold quoted speech into narration — present it as actual spoken dialogue.
If there is no DIALOGUE line, the character does not speak (unless you as GM decide they would naturally say something brief and contextually fitting — but never the player's action text verbatim).
`}
Resolve this action and advance the story. Determine outcomes, describe the consequences, and set up the next decision point.

FEASIBILITY CHECK: Before rolling dice, verify the action is possible given the NPCs and features present at the current location. Impossible actions auto-fail (diceRoll=null). Trivial/certain actions auto-succeed (diceRoll=null). Only roll for uncertain outcomes.
Simple repositioning or low-risk movement such as "I take a step back", "I move aside", or "I cautiously back away" is usually trivial. Prefer diceRoll=null unless the scene is actively dangerous; if you do require a roll, expose that ease with difficultyModifier +20 or +30.

DICE ROLL FREQUENCY: The dice roll frequency is set to ~${dmSettings?.testsFrequency ?? 50}%. Roll dice for approximately that proportion of actions. At high frequency (80%+), most actions require a roll (stepping over a threshold, opening a door, etc.) with high target numbers (70-90+) so success is very likely but never guaranteed — but ROUTINE ACTIONS (eating, resting, sleeping, bodily needs, casual conversation) are ALWAYS exempt and must use diceRoll=null. Consider the character's species for modifiers: Dwarfs have lower Agility (movement/balance checks harder), Elves have lower Toughness, etc. Use the WFRP d100 system with the pre-rolled d100 value below. Build each roll like this: "baseTarget" = characteristic + skill advances, "difficultyModifier" = a separate explicit difficulty step from +40 to -40, and "target" = final effective target used for success comparison after all modifiers. Calculate Success Levels (SL) = (target - roll) ÷ 10 rounded toward 0. Rolls of 01-04 are CRITICAL SUCCESS (automatic success + extra benefits). Rolls of 96-00 are CRITICAL FAILURE (automatic failure + extra penalties/consequences). IMPORTANT: When the roll indicates failure (roll > target and not 01-04), the narrative MUST reflect the action failing — the character does NOT succeed. When the roll indicates success (roll <= target or roll is 01-04), the narrative MUST reflect the action succeeding.
DIFFICULTY MODIFIER: Always expose task difficulty explicitly via "difficultyModifier" instead of hiding it inside "target". Use only one of these values: +40, +30, +20, +10, 0, -10, -20, -30, -40. Guide: +40 routine, +30 easy, +20 favorable, +10 slightly favorable, 0 standard, -10 challenging, -20 hard, -30 very hard, -40 extreme.
NPC DISPOSITION MODIFIERS: When this roll involves direct interaction with a known NPC (social, trade, persuasion, etc.), apply the NPC's disposition as a separate target modifier: >=30:+15, >=15:+10, >=5:+5, neutral:0, <=-5:-5, <=-15:-10, <=-30:-15. Include "dispositionBonus" in the diceRoll output with the applied modifier value.
${skipDiceRoll ? 'DICE ROLL OVERRIDE: This action does NOT require a dice roll. Set diceRoll to null in your response. Do not invent or include any dice check.' : (preRolledDice ? `PRE-ROLLED DICE: The d100 roll result is: ${preRolledDice}. You MUST use this exact value as the "roll" in the diceRoll. Do NOT generate your own roll number. First determine the appropriate skill and target number (including creativity bonus for custom actions), then check whether ${preRolledDice} succeeds or fails against the target, and THEN write the narrative matching that outcome.` : 'If a dice check is needed, generate a random d100 roll (1-100).')}
${isCustomAction ? `
CREATIVITY BONUS: The player wrote a CUSTOM action (not one of the suggested options). Evaluate the creativity, originality, and cleverness of their action and add a bonus.
- +5: Mundane custom action — a basic alternative to the suggestions, nothing special
- +10: Slightly creative — shows some thought or personality but still straightforward
- +15: Moderately creative — good use of environment or character abilities
- +20: Very creative — an unexpected approach that makes strong narrative sense, demonstrates clever thinking
- +25: Exceptionally creative — a truly brilliant, surprising action that uses multiple narrative elements in an inventive way. This should be RARE.
Award +5 minimum for any custom action. Do NOT default to high bonuses — most custom actions are +5 or +10.
COMBINED BONUS CAP: The total of creativityBonus + momentumBonus + dispositionBonus is hard-capped at +30 by the game engine. Any excess is discarded. "difficultyModifier" is NOT part of this cap and stays separate. Keep this in mind when setting target numbers.
Output the diceRoll fields as follows:
- "characteristic": the characteristic key used (e.g. "ag", "ws", "fel")
- "characteristicValue": the raw characteristic value (e.g. 33)
- "skillAdvances": the skill advances applied (e.g. 10; use 0 if untrained)
- "baseTarget": the BASE value (characteristicValue + skillAdvances)
- "difficultyModifier": the separate difficulty step (one of +40, +30, +20, +10, 0, -10, -20, -30, -40)
- "creativityBonus": the bonus (5-25)
- "target": the EFFECTIVE value = baseTarget + creativityBonus + difficultyModifier (+ other applicable modifiers) (this is the number you compare the roll against!)
- "success": whether roll <= target (the effective value)
Example: characteristic="ag", characteristicValue=33, skillAdvances=10, baseTarget=43, difficultyModifier=-10, creativityBonus=15, target=48, roll=45 → 45 ≤ 48 → success=true. The narrative MUST describe a successful outcome.
` : ''}${momentumBonus !== 0 ? `
MOMENTUM ${momentumBonus > 0 ? 'BONUS' : 'PENALTY'}: The player has ${momentumBonus > 0 ? '+' : ''}${momentumBonus} momentum from a previous roll.
${momentumBonus > 0 ? 'Add this to the target: target = baseTarget + difficultyModifier + creativityBonus + momentumBonus.' : 'Subtract this from the target: target = baseTarget + difficultyModifier + creativityBonus + momentumBonus (momentumBonus is negative, so it reduces the target).'}
Output "momentumBonus": ${momentumBonus} in the diceRoll.
This ${momentumBonus > 0 ? 'bonus' : 'penalty'} is consumed after this roll regardless of outcome.
` : ''}
IMPORTANT: Resolve the dice check FIRST, then write the narrative consistent with the outcome.

Respond with ONLY valid JSON in this exact format:
{
  "diceRoll": null,
  "narrative": "2-3 paragraphs describing what happens as a result of the player's action and setting up the next beat...",
  "dialogueSegments": [
    {"type": "narration", "text": "Descriptive prose..."},
    {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."},
    {"type": "narration", "text": "More prose..."}
  ],
  "soundEffect": "Short English description of a sound effect for impactful moments, or null",
  "musicPrompt": "Short English description of ideal instrumental background music for this scene, or null",
  "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
  "atmosphere": {
    "weather": "rain | snow | storm | clear | fog | fire",
    "particles": "magic_dust | sparks | embers | arcane | none",
    "mood": "mystical | dark | peaceful | tense | chaotic",
    "lighting": "natural | night | dawn | bright | rays | candlelight | moonlight",
    "transition": "dissolve | fade | arcane_wipe"
  },
  "suggestedActions": ["Action option 1", "Action option 2", "Action option 3", "Action option 4"],
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
    "knowledgeUpdates": null,
    "codexUpdates": [],
    "campaignEnd": null${needsSystemEnabled ? ',\n    "needsChanges": {"hunger": 0, "thirst": 0, "bladder": 0, "hygiene": 0, "rest": 0}' : ''}
  }
}

For atmosphere: choose weather, particles, mood, lighting, and transition that best match the current scene's environment. Pick ONE value for each field. weather = environmental condition (clear/rain/snow/storm/fog/fire). particles = visual flair (magic_dust/sparks/embers/arcane/none). mood = overall feel (mystical/dark/peaceful/tense/chaotic). lighting = light source and quality (natural for daylight, night for darkness/starlight, dawn for sunrise/sunset, bright for strong light, rays for god-rays through trees/windows, candlelight for dim indoor light, moonlight for moon-lit nights). transition = how the scene visually transitions in (dissolve/fade/arcane_wipe — use arcane_wipe for magical events, dissolve for abrupt changes, fade for calm transitions).

For diceRoll: use based on the configured dice frequency (~${dmSettings?.testsFrequency ?? 50}%). At 80%+, nearly every action needs a roll — except routine mundane actions (eating, resting, sleeping, bodily needs, casual conversation) which NEVER get a roll. For social speech and persuasion, use Fel unless a more specific WFRP skill clearly implies another characteristic. If you cannot determine a valid WFRP characteristic, return diceRoll: null. Format: {"type": "d100", "roll": <number 1-100>, "characteristic": "<characteristic key: ws/bs/s/t/i/ag/dex/int/wp/fel>", "characteristicValue": <number — raw stat value>, "skillAdvances": <number — advances in tested skill, 0 if untrained>, "baseTarget": <number — characteristicValue + skillAdvances>, "difficultyModifier": <one of 40, 30, 20, 10, 0, -10, -20, -30, -40>, "target": <number — the EFFECTIVE target used for success comparison>, ${isCustomAction ? '"creativityBonus": <number 5-25>, ' : ''}${momentumBonus !== 0 ? `"momentumBonus": ${momentumBonus}, ` : ''}"dispositionBonus": <number or omit if N/A>, "sl": <number>, "skill": "<skill name>", "success": <boolean>, "criticalSuccess": <boolean>, "criticalFailure": <boolean>}. MANDATORY: "characteristic", "characteristicValue", "skillAdvances", "baseTarget", and "difficultyModifier" must ALWAYS be present when diceRoll is not null. ${preRolledDice ? `Use the pre-rolled value ${preRolledDice} as "roll".` : ''} ${isCustomAction ? `"target" must be the EFFECTIVE target (baseTarget + difficultyModifier + creativityBonus${momentumBonus !== 0 ? ' + momentumBonus' : ''} + dispositionBonus if applicable, with only creativity+momentum+disposition subject to the +30 cap).` : `"target" must be the EFFECTIVE target (baseTarget + difficultyModifier${momentumBonus !== 0 ? ' + momentumBonus' : ''} + dispositionBonus if applicable).`} Set criticalSuccess=true when roll is 01-04 (automatic success with bonus effects). Set criticalFailure=true when roll is 96-00 (automatic failure with extra penalties). Determine success by comparing roll to target: success = (roll <= target) OR (roll is 01-04). The narrative MUST match: failed roll = failed action, successful roll = successful action.${skipDiceRoll ? ' DICE ROLL OVERRIDE IS ACTIVE: set diceRoll to null.' : ' Use null ONLY when dice frequency is low and the action truly doesn\'t warrant a test.'}

For stateChanges: woundsChange is a DELTA (negative = damage, positive = healing). xp is a DELTA (typically +20 to +50 per scene). fortuneChange/resolveChange are DELTAS (usually negative when spent). newItems should be objects with {id, name, type, description, rarity}. newQuests should be objects with {id, name, description, completionCondition, objectives: [{id, description}], questGiverId, turnInNpcId, locationId, prerequisiteQuestIds, reward: {xp, money: {gold, silver, copper}, items: [{id, name, type, description, rarity}], description}, type: "main|side|personal"}. "completionCondition" is the main goal to finish the quest. "objectives" are 2-5 optional milestones guiding the player through the story. "questGiverId" is the NPC name who assigned the quest. "turnInNpcId" is the NPC name to report quest completion to (defaults to questGiverId if omitted). "locationId" is the main location where the quest takes place. "prerequisiteQuestIds" is an array of quest IDs that must be completed before this quest can progress. "reward" MUST be included on every quest — use xp (side: 25-75, main: 100-200), optionally money and items. "type" is "main" for central plot, "side" for independent, "personal" for character-specific. worldFacts are strings of new information. journalEntries are 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant decisions, discoveries, or combat outcomes. Each entry: 1-2 sentences, self-contained. Do NOT log trivial details. Set any field to null/empty to skip it.
QUEST TRACKING (MANDATORY): For stateChanges.questUpdates: array of objective completions, e.g. [{"questId": "quest_123", "objectiveId": "obj_1", "completed": true}]. AFTER writing the narrative, you MUST cross-check ALL active quest objectives against the scene events. If the narrative describes events that fulfill any objective (even partially or indirectly), you MUST include the corresponding questUpdates entry. NEVER write a journal entry or narrative that fulfills an objective without marking it here. This is separate from completedQuests which finishes the entire quest.
QUEST DISCOVERY: When the player explicitly asks about available work, tasks, quests, jobs, or missions (e.g. "I look for quests", "I ask about available work", "I check the notice board"), populate the top-level "questOffers" array with 1-3 quest proposals. Each offer: {"id": "quest_<unique>", "name": "Quest Name", "description": "What the quest entails", "completionCondition": "What must be done to complete it", "objectives": [{"id": "obj_1", "description": "First milestone"}, ...], "offeredBy": "NPC name or source", "reward": {"xp": 50, "money": {"gold": 1, "silver": 0, "copper": 0}, "items": [], "description": "50 XP and 1 Gold Crown"}, "type": "main|side|personal"}. Narrate the quest sources naturally — NPCs offering jobs, notice boards, tavern rumors, guild contacts, merchant requests, desperate villagers, etc. Quest offers should: (a) mix story-related and independent hooks, (b) fit the current location, NPCs, and world state, (c) have 2-5 trackable objectives, (d) vary in scope — some quick side jobs, some longer arcs. The "type" field: "main" for quests tied to the campaign's central plot, "side" for independent adventures, "personal" for character-specific goals. Use "questOffers" for quests the player discovers and can choose to accept or decline. Use "stateChanges.newQuests" ONLY for quests forced by story events (unavoidable plot developments). When NOT asked about quests, leave "questOffers" as an empty array [].
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
NPC RELATIONSHIP TRACKING: When introducing or updating NPCs, include these optional fields to build the world relationship graph:
- "factionId": the faction this NPC belongs to (merchants_guild, thieves_guild, temple_sigmar, etc.) — faction reputation will automatically influence their disposition toward the player
- "relatedQuestIds": array of quest IDs this NPC is involved in (as quest giver, target, or participant)
- "relationships": array of NPC-to-NPC relationships: [{"npcName": "Other NPC Name", "type": "ally|enemy|family|employer|rival|friend|mentor|subordinate"}]
These relationships persist across scenes and are used for world consistency. Always set factionId for NPCs who belong to a known faction.
NPC DISPOSITION TRACKING: When a dice roll directly involves interaction with an NPC, include that NPC in stateChanges.npcs with a variable "dispositionChange" based on SL — NOT a flat +5/-5:
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
${needsSystemEnabled ? 'For stateChanges.needsChanges: MANDATORY when the character eats, drinks, uses a toilet, bathes, or rests — you MUST include non-zero deltas. Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger and +40 thirst. Typical values: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet → set bladder to 100, bath +60-80 hygiene, nap +20-30 rest. SLEEPING AT INN/TAVERN: restore ALL needs to 100 (the character eats, drinks, uses the privy, washes, and sleeps). Set all values to 0 only when no need was satisfied in this scene. Needs only affect narration when below 10.\n' : ''}
For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized or shortened). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names across scenes. Every dialogue segment MUST have a "gender" field ("male" or "female").${needsSystemEnabled ? buildNeedsEnforcementReminder(characterNeeds) : ''}${langReminder}`;
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
    ? `\n\nHUMOROUS TONE GUIDELINES: The humor must NOT rely on random absurdity, slapstick, or zaniness. Instead, ground the campaign in a believable world and derive comedy from 1-2 genuinely controversial, provocative, or morally ambiguous elements — corrupt institutions, taboo customs, ethically questionable practices, morally grey factions, or politically charged conflicts. Comedy should emerge from how characters earnestly navigate these uncomfortable realities: dark irony, social satire, awkward moral dilemmas, characters taking absurd stances on serious issues. Sharp wit about real controversies, not random nonsense.`
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
    "narrative": "2-3 vivid paragraphs of the opening scene",
    "dialogueSegments": [
      {"type": "narration", "text": "Descriptive prose..."},
      {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."}
    ],
    "soundEffect": "Short English ambient sound description or null",
    "musicPrompt": "Short English description of ideal instrumental background music for the opening scene",
    "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
    "atmosphere": {
      "weather": "clear | rain | snow | storm | fog | fire",
      "particles": "magic_dust | sparks | embers | arcane | none",
      "mood": "mystical | dark | peaceful | tense | chaotic",
      "lighting": "natural | night | dawn | bright | rays | candlelight | moonlight",
      "transition": "fade"
    },
    "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
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

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized or shortened). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST have a "gender" field ("male" or "female").`;
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
};

const TONE_MODIFIERS = {
  Dark: 'moody, desaturated colors, deep shadows, somber ominous atmosphere',
  Epic: 'grand scale, dramatic golden-hour lighting, heroic composition, sweeping vista',
  Humorous: 'warm vibrant colors, whimsical playful details, lighthearted cheerful mood',
};

function getImageStyleDirective(imageStyle, field = 'prompt') {
  const entry = IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting;
  return entry[field] || entry.prompt;
}

export function getImageStyleNegative(imageStyle) {
  const entry = IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting;
  return entry.negative || '';
}

export function buildImagePrompt(narrative, genre, tone, imagePrompt, provider = 'dalle', imageStyle = 'painting') {
  const isGemini = provider === 'gemini';

  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;

  const rawDesc = imagePrompt || narrative.substring(0, 300);
  const sceneDesc = sanitizeForImageGen(rawDesc);

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}. Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting, 16:9 widescreen composition.`;
  }

  return `ART STYLE: ${styleDirective}. ${mood}. Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting.`;
}

export function buildPortraitPrompt(species, gender, careerName, genre = 'Fantasy', provider = 'stability', imageStyle = 'painting', hasReferenceImage = false) {
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
  const career = careerName ? `, dressed as a ${careerName} with appropriate gear and attire` : '';
  const likenessDirective = hasReferenceImage
    ? 'Preserve a clear likeness to the provided reference image: keep the same face shape, facial proportions, eyes, nose, mouth, hairstyle, and overall identity while reimagining the subject as a fantasy character.'
    : '';

  if (isSD) {
    return `ART STYLE: ${styleDirective}. Close-up portrait of a ${genderLabel} ${speciesDesc}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin imperfections, scars and character lines. Sharp focus on the face, intricate costume, moody atmospheric background, head and shoulders composition. No text, no watermarks.`;
  }

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${career}. ${likenessDirective} Detailed face with expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background. Square 1:1 aspect ratio. No text, no watermarks.`;
  }

  return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${career}. Detailed face, expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background. No text, no watermarks, no borders.`;
}

export function buildRecapPrompt(language = 'en') {
  const langNote = language === 'pl' ? ' Write the recap in Polish.' : '';
  return `Based on the scene history in the system context, generate a brief "Previously on..." recap summarizing the key events, decisions, and their consequences. Write it in a dramatic, narrative style (2-3 sentences).${langNote} Respond with ONLY valid JSON: {"recap": "The recap text..."}`;
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
