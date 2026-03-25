import { resolveApiKey } from './apiKeyService.js';
import { config } from '../config.js';
import { generateStateChangeMessages } from './stateChangeMessages.js';
import { resolveDiceRollCharacteristic } from '../../../src/services/diceRollInference.js';

const MAX_COMBINED_BONUS = 30;
const MIN_DIFFICULTY_MODIFIER = -40;
const MAX_DIFFICULTY_MODIFIER = 40;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeDifficultyModifier(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER)
    : 0;
}

function snapDifficultyModifier(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.round(value / 10) * 10, MIN_DIFFICULTY_MODIFIER, MAX_DIFFICULTY_MODIFIER);
}

const NEEDS_LABELS = {
  hunger: { low: 'hungry, distracted', critical: 'weak, dizzy, stomach pains' },
  thirst: { low: 'thirsty, dry mouth', critical: 'parched, cracked lips, fading' },
  bladder: { low: 'uncomfortable, fidgeting', critical: 'desperate, about to lose control', zero: 'lost control!' },
  hygiene: { low: 'smelly, NPCs wrinkle noses', critical: 'terrible stench, NPCs recoil' },
  rest: { low: 'tired, yawning, slower reactions', critical: 'can barely keep eyes open, stumbling', zero: 'collapses from exhaustion' },
};

function buildMultiplayerUnmetNeedsBlock(characters) {
  if (!characters || characters.length === 0) return '';
  const charLines = [];
  for (const c of characters) {
    if (!c.needs) continue;
    const parts = [];
    for (const [key, labels] of Object.entries(NEEDS_LABELS)) {
      const val = c.needs[key] ?? 100;
      if (val <= 0 && labels.zero) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [${key === 'bladder' ? 'ACCIDENT' : 'COLLAPSE'}]`);
      } else if (val < 15) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [CRITICAL]`);
      } else if (val < 30) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [LOW]`);
      }
    }
    if (parts.length > 0) {
      charLines.push(`- ${c.name}: ${parts.join(', ')}`);
    }
  }
  if (charLines.length === 0) return '';
  return `UNMET CHARACTER NEEDS (factor these into the scene — affect narration, NPC reactions, and outcomes):\n${charLines.join('\n')}\n\n`;
}

const QUOTE_OPEN = '„"«"';
const QUOTE_CLOSE = '""»"';
const QUOTE_RE = new RegExp(`[${QUOTE_OPEN}]([^${QUOTE_OPEN}${QUOTE_CLOSE}]+)[${QUOTE_CLOSE}]`, 'g');

function findSpeakerInText(textBefore, knownNames) {
  const words = textBefore.trim().split(/\s+/);
  for (let i = words.length - 1; i >= 0; i--) {
    const raw = words[i].replace(/[,:;.!?…\-—]+$/, '');
    if (raw.length < 2) continue;
    for (const name of knownNames) {
      if (name.split(/\s+/).some(p => p.toLowerCase() === raw.toLowerCase())) return name;
    }
    if (raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase()) {
      const isFirstWord = i === 0 || /[.!?…]$/.test(words[i - 1] || '');
      if (!isFirstWord) return raw;
    }
  }
  return null;
}

function lookupGender(name, knownNpcs, existingDialogueSegs) {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  for (const npc of knownNpcs) {
    if (!npc.name) continue;
    if (npc.name.toLowerCase() === lower || npc.name.toLowerCase().split(/\s+/).includes(lower)) {
      return npc.gender || undefined;
    }
  }
  for (const seg of existingDialogueSegs) {
    if (!seg.character) continue;
    if (seg.character.toLowerCase() === lower || seg.character.toLowerCase().split(/\s+/).includes(lower)) {
      return seg.gender || undefined;
    }
  }
  return undefined;
}

function repairDialogueSegments(narrative, segments, knownNpcs = []) {
  if (!segments || segments.length === 0) {
    if (narrative && narrative.trim()) {
      segments = [{ type: 'narration', text: narrative }];
    } else {
      return [];
    }
  }
  const existingDialogue = segments.filter(s => s.type === 'dialogue' && s.character);
  const knownNames = [...new Set([
    ...knownNpcs.map(n => n.name).filter(Boolean),
    ...existingDialogue.map(s => s.character).filter(Boolean),
  ])];
  const repaired = [];
  for (const seg of segments) {
    if (seg.type !== 'narration' || !seg.text) { repaired.push(seg); continue; }
    QUOTE_RE.lastIndex = 0;
    if (!QUOTE_RE.test(seg.text)) { repaired.push(seg); continue; }
    QUOTE_RE.lastIndex = 0;
    let lastIndex = 0;
    let match;
    const parts = [];
    while ((match = QUOTE_RE.exec(seg.text)) !== null) {
      const before = seg.text.slice(lastIndex, match.index);
      if (before.trim()) parts.push({ type: 'narration', text: before.trimEnd() });
      const speaker = findSpeakerInText(seg.text.slice(0, match.index), knownNames);
      const gender = lookupGender(speaker, knownNpcs, existingDialogue);
      parts.push({ type: 'dialogue', character: speaker || 'NPC', text: match[1].trim(), ...(gender ? { gender } : {}) });
      lastIndex = match.index + match[0].length;
    }
    const trailing = seg.text.slice(lastIndex);
    if (trailing.trim()) parts.push({ type: 'narration', text: trailing.trimStart() });
    repaired.push(...(parts.length > 0 ? parts : [seg]));
  }

  if (narrative && narrative.trim()) {
    const repairedText = repaired.map(s => (s.text || '').trim()).join('');
    if (repairedText.length < narrative.trim().length * 0.7) {
      const alreadySynthetic = segments.length === 1
        && segments[0].type === 'narration'
        && segments[0].text === narrative;
      if (!alreadySynthetic) {
        return repairDialogueSegments(narrative, [{ type: 'narration', text: narrative }], knownNpcs);
      }
    }
  }

  return repaired;
}

function ensurePlayerDialogue(segments, playerAction, characterName, characterGender) {
  if (!playerAction || !characterName) return segments;

  QUOTE_RE.lastIndex = 0;
  const playerQuotes = [];
  let match;
  while ((match = QUOTE_RE.exec(playerAction)) !== null) {
    const text = match[1].trim();
    if (text) playerQuotes.push(text);
  }
  if (playerQuotes.length === 0) return segments;

  const charLower = characterName.toLowerCase();
  const hasPlayerDialogue = (segments || []).some(
    s => s.type === 'dialogue' && s.character && s.character.toLowerCase() === charLower
  );
  if (hasPlayerDialogue) return segments;

  const playerSegments = playerQuotes.map(text => ({
    type: 'dialogue',
    character: characterName,
    text,
    gender: characterGender || undefined,
  }));

  return [...playerSegments, ...(segments || [])];
}

function buildMultiplayerSystemPrompt(gameState, settings, players, language = 'en', dmSettings = null) {
  const needsEnabled = settings.needsSystemEnabled === true;
  const playerList = players
    .map((p) => `- ${p.name} (${p.gender}, ${p.isHost ? 'host' : 'player'})`)
    .join('\n');

  const scenes = gameState.scenes || [];
  const total = scenes.length;
  const FULL_COUNT = 3;
  const MEDIUM_COUNT = 5;
  const parts = [];
  const compressedHistory = (gameState.world || {}).compressedHistory;
  if (compressedHistory) {
    parts.push(`ARCHIVED HISTORY (summary of earliest scenes):\n${compressedHistory}`);
  }
  const medStart = Math.max(0, total - FULL_COUNT - MEDIUM_COUNT);
  const medEnd = Math.max(0, total - FULL_COUNT);
  const medScenes = scenes.slice(medStart, medEnd);
  if (medScenes.length > 0) {
    parts.push('EARLIER SCENES (summaries):\n' + medScenes.map((s, i) => {
      const idx = medStart + i + 1;
      const actions = (s.playerActions || []).map((a) => a.action).join('; ');
      return `Scene ${idx}${actions ? ` [Actions: ${actions}]` : ''}: ${(s.narrative || '').substring(0, 500)}...`;
    }).join('\n'));
  }
  const fullScenes = scenes.slice(-FULL_COUNT);
  if (fullScenes.length > 0) {
    parts.push('RECENT SCENES (full):\n' + fullScenes.map((s, i) => {
      const idx = total - FULL_COUNT + i + 1;
      const actions = (s.playerActions || []).map((a) => a.action).join('; ');
      return `Scene ${idx}${actions ? ` [Actions: ${actions}]` : ''}:\n${s.narrative}`;
    }).join('\n\n'));
  }
  const sceneHistory = parts.join('\n\n') || 'No scenes yet - this is the beginning of the story.';

  const campaign = gameState.campaign || {};
  const world = gameState.world || {};
  const worldFacts = (world.facts || []).slice(-20).join('\n') || 'No known facts yet.';

  const npcs = world.npcs || [];
  const npcSection = npcs.length > 0
    ? npcs.map((n) => `- ${n.name} (${n.role || 'unknown'}, ${n.gender || '?'}): ${n.personality || '?'}, attitude=${n.attitude || 'neutral'}, disposition=${n.disposition || 0}`).join('\n')
    : 'No NPCs encountered yet.';

  const currentLoc = world.currentLocation || 'Unknown';

  const npcsHere = npcs.filter((n) => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  const npcsHereSection = npcsHere.length > 0
    ? npcsHere.map((n) => `- ${n.name} (${n.role || 'unknown'})`).join('\n')
    : 'No known NPCs at this location.';
  const mapState = world.mapState || [];
  const mapSection = mapState.length > 0
    ? mapState.map((loc) => {
        const isCurrent = loc.name?.toLowerCase() === currentLoc?.toLowerCase();
        const mods = (loc.modifications || []).map((m) => `  · [${m.type}] ${m.description}`).join('\n');
        return `- ${loc.name}${isCurrent ? ' ← CURRENT' : ''}${loc.description ? `: ${loc.description}` : ''}${mods ? '\n' + mods : ''}`;
      }).join('\n')
    : 'No locations mapped yet.';

  const charLines = (gameState.characters || []).map((c) => {
    const career = c.career || {};
    const chars = c.characteristics || {};
    const charStr = Object.entries(chars).map(([k, v]) => `${k.toUpperCase()}:${v}`).join(' ');
    let line = `- ${c.name} (${c.species || 'Human'} ${career.name || 'Adventurer'}, Tier ${career.tier || 1}): Wounds ${c.wounds}/${c.maxWounds}, Move ${c.movement || 4}`;
    line += `\n  Characteristics: ${charStr || 'unknown'}`;
    line += `\n  Fate/Fortune: ${c.fate ?? 0}/${c.fortune ?? 0}, Resilience/Resolve: ${c.resilience ?? 0}/${c.resolve ?? 0}`;
    const skillStr = Object.entries(c.skills || {}).map(([s, v]) => `${s}:${v}`).join(', ');
    if (skillStr) line += `\n  Skills: ${skillStr}`;
    const talentStr = (c.talents || []).join(', ');
    if (talentStr) line += `\n  Talents: ${talentStr}`;
    const inv = (c.inventory || []).map((i) => (typeof i === 'string' ? i : i.name)).join(', ');
    line += `\n  Inventory: ${inv || 'Empty'}`;
    const m = c.money || { gold: 0, silver: 0, copper: 0 };
    const moneyParts = [];
    if (m.gold) moneyParts.push(`${m.gold} GC`);
    if (m.silver) moneyParts.push(`${m.silver} SS`);
    if (m.copper) moneyParts.push(`${m.copper} CP`);
    line += `\n  Money: ${moneyParts.length > 0 ? moneyParts.join(' ') : '0 CP'}`;
    if (needsEnabled && c.needs) {
      const n = c.needs;
      const fmt = (k, v) => `${k}: ${v ?? 100}/100${(v ?? 100) < 15 ? ' [CRITICAL]' : (v ?? 100) < 30 ? ' [LOW]' : ''}`;
      line += `\n  Needs: ${fmt('Hunger', n.hunger)}, ${fmt('Thirst', n.thirst)}, ${fmt('Bladder', n.bladder)}, ${fmt('Hygiene', n.hygiene)}, ${fmt('Rest', n.rest)}`;
    }
    return line;
  }).join('\n') || 'No characters defined yet.';

  const needsBlock = needsEnabled ? `
NEEDS SYSTEM: ENABLED. Each character has biological needs (hunger, thirst, bladder, hygiene, rest) on a 0-100 scale (100=fully satisfied, 0=critical). Low needs should affect narrative and character behavior. When characters eat, drink, rest, bathe, or use a toilet, include needsChanges in their perCharacter entry.` : '';

  return `You are the Dungeon Master AI for a MULTIPLAYER campaign: "${campaign.name || 'Unnamed Campaign'}".

CAMPAIGN SETTINGS:
- Genre: ${settings.genre || 'Fantasy'}
- Tone: ${settings.tone || 'Epic'}
- Play Style: ${settings.style || 'Hybrid'} (narrative + optional dice rolls)
- Difficulty: ${dmSettings ? (dmSettings.difficulty < 25 ? 'Easy' : dmSettings.difficulty < 50 ? 'Normal' : dmSettings.difficulty < 75 ? 'Hard' : 'Expert') : (settings.difficulty || 'Normal')}
- Dice roll frequency: ${(() => { const tf = dmSettings?.testsFrequency ?? 50; return tf < 20 ? 'rarely (only critical moments)' : tf < 40 ? 'occasionally (important actions only)' : tf < 60 ? 'regularly (most meaningful actions)' : tf < 80 ? 'frequently (most actions, including minor ones)' : 'almost always (even trivial actions)'; })() } (~${dmSettings?.testsFrequency ?? 50}% of actions should require a roll)
${dmSettings ? `- Narrative chaos: ${dmSettings.narrativeStyle < 25 ? 'Predictable' : dmSettings.narrativeStyle < 50 ? 'Balanced' : dmSettings.narrativeStyle < 75 ? 'Chaotic' : 'Wild'}
- Response length: ${dmSettings.responseLength < 33 ? 'short (2-3 sentences)' : dmSettings.responseLength < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)'}

NARRATOR VOICE & STYLE:
- Poeticism: ${(dmSettings.narratorPoeticism ?? 50) < 25 ? 'dry and prosaic' : (dmSettings.narratorPoeticism ?? 50) < 50 ? 'moderately literary' : (dmSettings.narratorPoeticism ?? 50) < 75 ? 'poetic and evocative' : 'lushly lyrical, rich in metaphor and imagery'}
- Grittiness: ${(dmSettings.narratorGrittiness ?? 30) < 25 ? 'lighthearted and clean' : (dmSettings.narratorGrittiness ?? 30) < 50 ? 'moderately grounded' : (dmSettings.narratorGrittiness ?? 30) < 75 ? 'gritty and raw' : 'brutally dark, visceral and unflinching'}
- Environmental detail: ${(dmSettings.narratorDetail ?? 50) < 25 ? 'minimal, only essential details' : (dmSettings.narratorDetail ?? 50) < 50 ? 'balanced descriptions' : (dmSettings.narratorDetail ?? 50) < 75 ? 'rich environmental detail' : 'lavishly detailed, painting every sensory element'}
- Humor: ${(dmSettings.narratorHumor ?? 20) < 25 ? 'completely serious' : (dmSettings.narratorHumor ?? 20) < 50 ? 'occasional dry wit' : (dmSettings.narratorHumor ?? 20) < 75 ? 'frequent humor woven into narration, comedy grounded in controversial or morally ambiguous situations' : 'heavily comedic and irreverent — humor drawn from controversial topics, provocative characters, social satire, and dark irony rather than pure absurdity (think Pratchett/Monty Python: sharp wit about real uncomfortable issues)'}
- Drama: ${(dmSettings.narratorDrama ?? 50) < 25 ? 'understated and subtle' : (dmSettings.narratorDrama ?? 50) < 50 ? 'measured dramatic pacing' : (dmSettings.narratorDrama ?? 50) < 75 ? 'heightened drama and tension' : 'maximally theatrical, grandiose and operatic'}
Adapt your narration prose style to match ALL of the above parameters simultaneously.` : ''}

PLAYERS IN THIS SESSION:
${playerList}

WORLD DESCRIPTION:
${campaign.worldDescription || 'A mysterious world awaits discovery.'}

STORY HOOK:
${campaign.hook || 'An adventure begins...'}

CHARACTERS:
${charLines}

NPC REGISTRY:
${npcSection}

NPCs PRESENT AT CURRENT LOCATION (only these NPCs can be directly interacted with unless summoned or newly arriving):
${npcsHereSection}

CURRENT LOCATION: ${currentLoc}

MAP STATE (explored locations):
${mapSection}

ACTIVE EFFECTS (traps, spells, environmental changes — check before resolving actions in a location):
${(world.activeEffects || []).filter((e) => e.active !== false).map((e) => `- [${e.type}] ${e.description} at ${e.location || 'unknown'}${e.placedBy ? ` (by ${e.placedBy})` : ''}`).join('\n') || 'None'}

ACTIVE QUESTS:
${(gameState.quests?.active || []).map((q) => {
    let line = `- ${q.name}: ${q.description}`;
    if (q.completionCondition) line += `\n  Goal: ${q.completionCondition}`;
    if (q.objectives?.length > 0) {
      line += '\n  Objectives:';
      for (const obj of q.objectives) {
        line += `\n    [${obj.completed ? 'X' : ' '}] ${obj.description}`;
      }
    }
    return line;
  }).join('\n') || 'None'}

WORLD KNOWLEDGE:
${worldFacts}
${(() => {
  const codex = world.codex;
  if (!codex || Object.keys(codex).length === 0) return '';
  const entries = Object.values(codex).slice(0, 10);
  const lines = entries.map((e) => {
    const frags = e.fragments.map((f) => `  - [${f.aspect || 'info'}] ${f.content} (source: ${f.source})`).join('\n');
    return `* ${e.name} [${e.category}]:\n${frags}`;
  });
  return `\nPLAYER CODEX (knowledge already discovered — do NOT repeat, reveal NEW information):\n${lines.join('\n')}\n`;
})()}
SCENE HISTORY:
${sceneHistory}

LANGUAGE: Write all narrative in ${language === 'pl' ? 'Polish' : 'English'}.
${needsBlock}
NPC DISPOSITION MODIFIERS (apply when a dice roll involves direct interaction with a known NPC):
When a player attempts a social, trade, persuasion, or other interpersonal skill test involving a known NPC, look up that NPC's disposition value from the NPC REGISTRY and apply the corresponding modifier to the dice target:
  disposition >= 30 (strong ally): +15 to target
  disposition >= 15 (friendly): +10 to target
  disposition >= 5 (warm): +5 to target
  disposition -5 to +5 (neutral): no modifier
  disposition <= -5 (cool): -5 to target
  disposition <= -15 (hostile): -10 to target
  disposition <= -30 (enemy): -15 to target
When this modifier applies, include "dispositionBonus" in the diceRoll entry with the modifier value. Keep it separate from "difficultyModifier".

MULTIPLAYER INSTRUCTIONS:
1. You are running a MULTIPLAYER session using the WFRP 4th Edition system. Multiple players act simultaneously each round.
2. When resolving actions, consider ALL submitted actions together and resolve them simultaneously.
3. Describe what happens to each character individually.
4. Include per-character stateChanges so each player's wounds/XP/inventory/skills can be updated independently. Use WFRP mechanics (wounds, characteristics, career skills).
5. All players see the same scene narrative.
6. Maintain fairness — give each player meaningful consequences for their actions.
7. Generate suggested actions that are generic enough for any player to take.
8. Update stateChanges.currentLocation when the party moves to a new location.
9. Always respond with valid JSON.
10. ITEM FORMAT: When giving items to characters via perCharacter newItems, each item MUST be an object: {"id": "item_unique_id", "name": "Item Display Name", "type": "weapon|armor|potion|scroll|tool|food|clothing|key|book|ring|ammunition|trinket|shield|misc", "description": "Short flavor text", "rarity": "common|uncommon|rare|exotic"}. NEVER omit name or description — these are displayed to players.
11. ITEM VALIDATION: Characters can ONLY use items currently listed in their inventory above. If a player's action references using an item they do not possess, the action MUST fail or the narrative should reflect they don't have it. Only include items in removeItems that the character actually has in their inventory.
12. QUEST OBJECTIVE TRACKING (CRITICAL): After writing the narrative, cross-reference ALL unchecked ACTIVE QUESTS objectives against what happened. If ANY objective was fulfilled (even partially or indirectly), you MUST include the corresponding questUpdates entry. Do NOT narrate fulfillment of an objective without marking it in questUpdates.

ACTION FEASIBILITY (MANDATORY — applies BEFORE dice roll decision):
- IMPOSSIBLE ACTIONS (auto-fail, NO dice roll): If a player attempts something physically impossible or targets someone/something not present in the scene (e.g., talking to an NPC who is not at the current location, using a feature that doesn't exist here, attacking an enemy not in combat), do NOT include a diceRolls entry for that action and narrate the failure — the character looks around but the person isn't here, reaches for something that isn't there, etc.
- TRIVIAL ACTIONS (auto-success, NO dice roll): If the action is trivially easy with no meaningful chance of failure (e.g., walking a short distance on flat ground, picking up an object at your feet, opening an unlocked door, sitting down), do NOT include a diceRolls entry and narrate the success directly.
- UNCERTAIN ACTIONS (normal dice roll): Only use dice rolls for actions with genuinely uncertain outcomes where both success and failure are plausible.
- EXCEPTIONS: A character may summon a companion/familiar, or an NPC may arrive as part of the narrative — but this should be contextually justified, not a way to bypass presence rules.
- suggestedActions MUST only include actions that are feasible given who and what is present at the current location. Do not suggest talking to NPCs who are elsewhere.

CODEX SYSTEM (detailed lore and knowledge discovery):
When any player asks about, investigates, or learns about something specific, generate a detailed codex fragment via stateChanges.codexUpdates. Each NPC reveals only ONE fragment per interaction based on their role (scholars know history, peasants know rumors, soldiers know weaknesses/locations). Check the PLAYER CODEX above — never repeat known information. Format:
{"codexUpdates": [{"id": "unique-slug", "name": "Subject Name", "category": "artifact|person|place|event|faction|creature|concept", "fragment": {"content": "2-4 sentences of specific detail...", "source": "Who revealed this", "aspect": "history|description|location|weakness|rumor|technical|political"}, "tags": ["relevant", "tags"], "relatedEntries": []}]}

CURRENCY SYSTEM (WFRP):
The game uses three denominations: Gold Crown (GC), Silver Shilling (SS), Copper Penny (CP). 1 GC = 10 SS = 100 CP.
- When a character BUYS or PAYS, deduct via perCharacter moneyChange (negative deltas). If a character cannot afford the purchase, it MUST FAIL.
- When a character RECEIVES money (loot, payment, selling, rewards), use positive deltas.
- The system auto-normalizes coins.

REFERENCE PRICE LIST (adjust contextually):
Food/Drink: bread 2 CP, ale 3 CP, hot meal 8 CP, fine wine 3 SS
Lodging: common room 5 CP/night, private room 2 SS/night
Weapons: dagger 1 SS, hand weapon 1 GC, crossbow 2 GC 5 SS
Armor: leather jerkin 1 GC 2 SS, mail shirt 6 GC
Gear: rope 4 CP, torch 1 CP, lantern 5 SS, healing draught 3 SS, lockpicks 5 SS
Services: healer 5 SS, blacksmith repair 3 SS, ferry 2 CP
Animals: riding horse 50 GC, mule 15 GC`;
}

function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

function calculateSL(roll, target) {
  const diff = target - roll;
  return diff >= 0 ? Math.floor(diff / 10) : -Math.floor(Math.abs(diff) / 10);
}

function buildMultiplayerScenePrompt(actions, isFirstScene = false, language = 'en', { needsSystemEnabled = false, characters = null } = {}, dmSettings = null, preRolledDice = null, characterMomentum = null, skipDiceRolls = null) {
  const langReminder = `\n\nLANGUAGE: Write narrative, dialogueSegments, suggestedActions in ${language === 'pl' ? 'Polish' : 'English'}. soundEffect, musicPrompt, imagePrompt stay in English.`;
  const needsPerCharHint = needsSystemEnabled
    ? ', "needsChanges": {"hunger": 60}'
    : '';
  const needsPerCharDoc = needsSystemEnabled
    ? '\nFor perCharacter needsChanges: use when a character satisfies a biological need (eating, drinking, toilet, bathing, resting). Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger, +40 thirst. Typical: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet +80-100 bladder, bath +60-80 hygiene, full sleep +70-90 rest, nap +20-30 rest. Omit needsChanges if no needs changed for that character.'
    : '';
  const perCharExample = `"wounds": -3, "xp": 10, "newItems": [{"id": "item_unique_id", "name": "Dagger", "type": "weapon", "description": "A small, sharp blade", "rarity": "common"}], "removeItems": [], "moneyChange": {"gold": 0, "silver": -2, "copper": 0}${needsPerCharHint}`;

  if (isFirstScene) {
    return `Generate the opening scene of this multiplayer campaign. Introduce all player characters and set the stage.

Respond with ONLY valid JSON:
{
  "narrative": "2-3 paragraphs setting the stage, introducing all characters...",
  "dialogueSegments": [
    {"type": "narration", "text": "Prose..."},
    {"type": "dialogue", "character": "NPC or Player Name", "gender": "male", "text": "..."}
  ],
  "soundEffect": "ambient sound or null",
  "musicPrompt": "background music description or null",
  "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
  "atmosphere": {
    "weather": "clear",
    "particles": "none",
    "mood": "mystical",
    "transition": "fade"
  },
  "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "stateChanges": {
    "perCharacter": {},
    "timeAdvance": {"hoursElapsed": 0.5},
    "currentLocation": "Starting Location",
    "mapChanges": [{"location": "Location Name", "modification": "Description of change", "type": "discovery"}],
    "npcs": [{"action": "introduce", "name": "NPC Name", "gender": "male", "role": "innkeeper", "personality": "jovial, loud", "attitude": "friendly", "location": "The Rusty Anchor", "notes": "", "dispositionChange": 5}],
    "worldFacts": [],
    "journalEntries": ["Opening scene summary"],
    "newQuests": [{"id": "quest_unique_id", "name": "Quest Name", "description": "Quest description", "completionCondition": "Main goal", "objectives": [{"id": "obj_1", "description": "First milestone"}]}],
    "completedQuests": [],
    "questUpdates": [],
    "activeEffects": [{"action": "add", "type": "trap|spell|environmental", "location": "Location", "description": "Effect description", "placedBy": "who"}],
    "codexUpdates": [],
    "combatUpdate": null
  }
}

For stateChanges.newQuests: array of new quests to add. Each quest: {"id": "quest_unique_id", "name": "Quest Name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "Milestone"}]}. "objectives" are 2-5 optional milestones guiding through the story. Use empty array [] if no new quests.
For stateChanges.completedQuests: array of quest IDs to mark as completed. Use empty array [] if none completed.
QUEST TRACKING (MANDATORY): For stateChanges.questUpdates: array of objective completions, e.g. [{"questId": "quest_123", "objectiveId": "obj_1", "completed": true}]. AFTER writing the narrative, you MUST cross-check ALL active quest objectives against the scene events. If the narrative describes events that fulfill any objective (even partially or indirectly), you MUST include the corresponding questUpdates entry. NEVER write a journal entry or narrative that fulfills an objective without marking it here. Separate from completedQuests.

For stateChanges.activeEffects: manage traps, spells, ongoing environmental effects. Use "add" to place new effects, "remove" to clear them (by id), "trigger" to fire and deactivate them (by id). Use empty array [] if no effect changes.

For stateChanges.perCharacter: an object keyed by character name, each containing {wounds, xp, newItems, removeItems, moneyChange${needsPerCharHint ? ', needsChanges' : ''}} deltas. "wounds" is a delta (negative = damage taken, positive = healing). "moneyChange" is {gold, silver, copper} deltas (negative = spending, positive = receiving). Example: {"Aldric": {"wounds": -3, "xp": 10, "newItems": [{"id": "item_sword_01", "name": "Rusty Sword", "type": "weapon", "description": "A battered but functional blade", "rarity": "common"}], "moneyChange": {"silver": -2}}, "Lyra": {"xp": 10, "moneyChange": {"gold": 1}}}. Use empty object {} if no per-character changes.
For perCharacter newItems: each item MUST be an object with {id, name, type, description, rarity}. "id" = unique string. "name" = the item's display name. "type" = one of: weapon, armor, potion, scroll, artifact, tool, food, clothing, key, book, ring, ammunition, trinket, shield, misc. "description" = short flavor text. "rarity" = "common", "uncommon", "rare", or "exotic". NEVER omit name or description. For removeItems: array of item id strings.${needsPerCharDoc}

For stateChanges.mapChanges: use when a location is modified (trap set, destruction, discovery, obstacle). Each entry: {"location": "Place", "modification": "what changed", "type": "trap|destruction|discovery|obstacle|other"}. Use empty array [] if no map changes.

For stateChanges.npcs: use "introduce" for new NPCs and "update" for existing ones. Always include name and gender. Provide personality, role, attitude toward player, and current location.
NPC DISPOSITION TRACKING: When a dice roll directly involves interaction with an NPC (social, combat, trade, persuasion, etc.), include that NPC in stateChanges.npcs with "dispositionChange": +5 if the roll succeeded, or -5 if it failed. This tracks how favorably the NPC views the player.

COMBAT ENCOUNTERS (MULTIPLAYER):
When the narrative describes the beginning of a hostile combat encounter, include "combatUpdate" in stateChanges with enemy data. The client-side combat engine handles turn-by-turn tactical resolution.
{"combatUpdate": {"active": true, "enemies": [{"name": "Enemy Name", "characteristics": {"ws": 35, "bs": 25, "s": 30, "t": 30, "i": 30, "ag": 30, "dex": 25, "int": 20, "wp": 25, "fel": 15}, "wounds": 10, "maxWounds": 10, "skills": {"Melee (Basic)": 5, "Dodge": 3}, "traits": [], "armour": {"body": 1}, "weapons": ["Hand Weapon"]}], "reason": "Short description of why combat started"}}
PLAYER-INITIATED COMBAT: When ANY player's action explicitly involves attacking, starting a fight, or provoking a confrontation, you MUST include "combatUpdate" with appropriate enemies built from NPCs present in the scene. Use the BESTIARY for matching stat blocks, or create contextually appropriate stats. The narrative should briefly describe the escalation, then combat begins via combatUpdate. Do NOT narrate combat without including combatUpdate. Set combatUpdate to null when no combat starts.

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
  }

  const testsFrequency = dmSettings?.testsFrequency ?? 50;
  const needsReminder = needsSystemEnabled ? buildMultiplayerUnmetNeedsBlock(characters) : '';

  const hasCustomActions = actions.some((a) => a.isCustom);
  const hasMomentum = characterMomentum && Object.values(characterMomentum).some((v) => v !== 0);
  const actionLines = actions
    .map((a) => {
      const skipRoll = skipDiceRolls?.[a.name];
      const diceInfo = !skipRoll && preRolledDice?.[a.name] ? ` [PRE-ROLLED d100: ${preRolledDice[a.name]}]` : '';
      const skipInfo = skipRoll ? ' [NO DICE ROLL]' : '';
      const momInfo = !skipRoll && characterMomentum?.[a.name] !== 0 && characterMomentum?.[a.name] != null ? ` [MOMENTUM ${characterMomentum[a.name] > 0 ? '+' : ''}${characterMomentum[a.name]}]` : '';
      return `- ${a.name} (${a.gender}): ${a.action}${a.isCustom ? ' [CUSTOM ACTION]' : ''}${diceInfo}${skipInfo}${momInfo}`;
    })
    .join('\n');

  return `${needsReminder}The players' actions this round:
${actionLines}

ACTION VS SPEECH (CRITICAL — read both rules carefully):
RULE 1 — ACTION PARTS: The non-quoted parts of each player's input describe what their character DOES — narrate them as action in prose. Never turn unquoted action text into spoken dialogue (e.g. the character must NOT announce their own action aloud).
RULE 2 — SPEECH PARTS (MANDATORY): When the input contains text inside quotation marks ("..."), that is the character speaking those exact words in-character. You MUST include each quoted phrase as a "dialogue" segment in dialogueSegments with that player character's name and gender. Do NOT skip, paraphrase, or fold quoted speech into narration — present it as actual spoken dialogue.
Example: input [I encourage everyone to celebrate. "Party on!" I shout.] → narrate the encouraging as action, then include "Party on!" as a dialogue segment.
If the input has NO quotation marks at all, the character does not speak (unless you as GM decide they would naturally say something brief and contextually fitting — but never the player's input text verbatim).

Resolve ALL player actions simultaneously. Describe what happens to each character.

FEASIBILITY CHECK: Before rolling dice, verify each action is possible given the NPCs and features present at the current location. Impossible actions auto-fail (no diceRolls entry). Trivial/certain actions auto-succeed (no diceRolls entry). Only roll for uncertain outcomes.
Simple repositioning or low-risk movement such as taking a step back, moving aside, or cautiously backing away is usually trivial. Prefer no dice roll unless the scene is actively dangerous; if you do require a roll, expose that ease with difficultyModifier +20 or +30.

DICE ROLL FREQUENCY: The dice roll frequency is ~${testsFrequency}%. For each player's action, decide whether a roll is needed based on this frequency. At high values (80%+), even trivial actions require a roll. Each character who needs a test gets their own entry in the diceRolls array. Build each roll like this: "baseTarget" = characteristic + skill advances, "difficultyModifier" = an explicit difficulty step, and "target" = the final effective target used for success comparison.
CHARACTERISTIC RULE: Every diceRolls entry MUST include a valid WFRP characteristic key: ws, bs, s, t, i, ag, dex, int, wp, or fel. For speech, persuasion, bargaining, bluffing, charming, greeting, and asking questions, default to Fel unless a more specific WFRP skill clearly implies another characteristic. Never invent non-WFRP stats such as "charisma". If you cannot determine a valid WFRP characteristic, omit that character from diceRolls instead of guessing.
DIFFICULTY MODIFIER: Always expose task difficulty explicitly via "difficultyModifier" instead of hiding it inside "target". Use only one of these values: +40, +30, +20, +10, 0, -10, -20, -30, -40. Guide: +40 routine, +30 easy, +20 favorable, +10 slightly favorable, 0 standard, -10 challenging, -20 hard, -30 very hard, -40 extreme / nearly suicidal.
NPC DISPOSITION MODIFIERS: When a roll involves direct NPC interaction (social, trade, persuasion), apply the NPC's disposition as a separate target modifier: >=30:+15, >=15:+10, >=5:+5, neutral:0, <=-5:-5, <=-15:-10, <=-30:-15. Include "dispositionBonus" in the diceRoll entry.
${preRolledDice ? `PRE-ROLLED DICE: Each character has a pre-rolled d100 value shown above. You MUST use these exact values as the "roll" in diceRolls. Do NOT generate your own roll numbers. First determine each character's skill and target number (including creativity bonus for custom actions), then check whether the pre-rolled value succeeds or fails against the target, and THEN write the narrative matching those outcomes.` : ''}
${skipDiceRolls && Object.keys(skipDiceRolls).length > 0 ? `DICE ROLL OVERRIDE: Characters marked [NO DICE ROLL] above do NOT require a dice roll this round. Do NOT include them in the diceRolls array. Resolve their actions narratively without mechanical dice resolution.` : ''}
${hasCustomActions ? `
CREATIVITY BONUS: Actions marked [CUSTOM ACTION] were written by the player (not selected from suggestions). Evaluate the creativity, originality, and cleverness of each custom action.
- +10: Mundane custom action — a basic alternative to the suggestions, nothing special
- +15: Slightly creative — shows some thought or personality but still straightforward
- +20: Moderately creative — good use of environment or character abilities
- +30: Very creative — an unexpected approach that makes strong narrative sense, demonstrates clever thinking
- +40: Exceptionally creative — a truly brilliant, surprising action that uses multiple narrative elements in an inventive way. This should be RARE
Always award at least +10 for any custom action.
COMBINED BONUS CAP: creativityBonus + momentumBonus + dispositionBonus is capped at +30 by the game engine. "difficultyModifier" is NOT part of that cap and stays separate.
Output the diceRoll fields as follows for custom actions:
- "baseTarget": the BASE value (characteristic + skill advances only)
- "difficultyModifier": the separate difficulty step (one of +40, +30, +20, +10, 0, -10, -20, -30, -40)
- "creativityBonus": the bonus (10-40)
- "target": the EFFECTIVE value = baseTarget + difficultyModifier + creativityBonus (+ other applicable modifiers) (this is the number you compare the roll against!)
- "success": whether roll <= target (the effective value)
Example: baseTarget=31, difficultyModifier=-10, creativityBonus=20, target=41, roll=45 → 45 > 41 → success=false. The narrative MUST describe a failed outcome.
` : ''}${hasMomentum ? `
MOMENTUM: Some characters have momentum from previous rolls (shown as [MOMENTUM +N] or [MOMENTUM -N] above).
Positive momentum is a bonus — add it to the target: target = baseTarget + difficultyModifier + creativityBonus + momentumBonus.
Negative momentum is a penalty — it reduces the target (momentumBonus is negative, so adding it lowers the target).
Output "momentumBonus": N in the diceRoll entry for that character (N can be positive or negative).
` : ''}
IMPORTANT: Resolve dice checks FIRST for all characters, then write the narrative consistent with ALL outcomes.

Respond with ONLY valid JSON:
{
  "diceRolls": [{"character": "CharacterName", "type": "d100", "roll": 42, "target": 65, "sl": 2, "skill": "Athletics", "success": true}],
  "narrative": "2-3 paragraphs resolving all actions and setting up the next decision...",
  "dialogueSegments": [
    {"type": "narration", "text": "Prose..."},
    {"type": "dialogue", "character": "NPC or Player Name", "gender": "male", "text": "..."}
  ],
  "soundEffect": "sound description or null",
  "musicPrompt": "music description or null",
  "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
  "atmosphere": {
    "weather": "clear",
    "particles": "none",
    "mood": "tense",
    "transition": "dissolve"
  },
  "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "questOffers": [],
  "stateChanges": {
    "perCharacter": {
      "CharacterName": {${perCharExample}}
    },
    "timeAdvance": {"hoursElapsed": 0.5},
    "currentLocation": "Location Name",
    "mapChanges": [{"location": "Location Name", "modification": "Description of change", "type": "discovery"}],
    "npcs": [{"action": "introduce|update", "name": "NPC Name", "gender": "male|female", "role": "their role", "personality": "traits", "attitude": "friendly|neutral|hostile|fearful|etc", "location": "where they are", "notes": "optional notes", "dispositionChange": 5}],
    "worldFacts": [],
    "journalEntries": ["Summary of key events"],
    "newQuests": [],
    "completedQuests": [],
    "questUpdates": [],
    "activeEffects": [],
    "codexUpdates": [],
    "combatUpdate": null
  }
}

For perCharacter: include an entry for each character that is affected. wounds/xp are deltas (wounds negative = damage, positive = healing). moneyChange is {gold, silver, copper} deltas (negative = spending, positive = receiving). Check each character's Money before allowing purchases.
For perCharacter newItems: each item MUST be an object with {id, name, type, description, rarity}. "id" = unique string (e.g. "item_dagger_01"). "name" = the item's display name. "type" = one of: weapon, armor, potion, scroll, artifact, tool, food, clothing, key, book, ring, ammunition, trinket, shield, misc. "description" = short flavor text. "rarity" = "common", "uncommon", "rare", or "exotic". NEVER omit name or description — these are shown to the player. For removeItems: array of item id strings to remove from the character's inventory.
LOOT RARITY GATING: Scenes 1-15: only "common"/"uncommon" items. Scenes 16-30: "rare" allowed. Scenes 31+: "exotic" possible but with narrative cost (thieves, faction interest, rumors). Always set the "rarity" field.
ITEM VALIDATION: Characters can ONLY use items currently in their inventory. If a player references an item they don't have, the action MUST fail narratively. Only include items in removeItems that exist in the character's inventory.${needsPerCharDoc}

For diceRolls: an array of per-character dice roll results. Each entry: {"character": "CharacterName", "type": "d100", "roll": <1-100>, "characteristic": "<ws/bs/s/t/i/ag/dex/int/wp/fel>", "characteristicValue": <number — raw stat value>, "skillAdvances": <number — advances in the tested skill, 0 if untrained>, "baseTarget": <number — characteristic + skill advances only>, "difficultyModifier": <one of 40, 30, 20, 10, 0, -10, -20, -30, -40>, "target": <number — the EFFECTIVE target used for success comparison>, "sl": <number>, "skill": "<skill name>", "success": <boolean>}. For custom actions, also include: "creativityBonus": <number 10-40>. ${preRolledDice ? 'Use the pre-rolled d100 values for each character.' : ''} For social speech and persuasion use Fel unless a more specific WFRP skill says otherwise. If no valid WFRP characteristic fits, omit that character from diceRolls. For custom actions: "target" = baseTarget + difficultyModifier + creativityBonus (+ any other applicable modifiers). For normal actions: "target" = baseTarget + difficultyModifier (+ any other applicable modifiers). "difficultyModifier" must always be explicit; do not hide it only inside "target". Determine success by comparing roll to target: success = (roll <= target) OR (roll is 01-04). Rolls 96-00 are always failure. The narrative MUST match all dice outcomes. Include a roll for each character whose action warrants a test based on the configured frequency (~${testsFrequency}%). At 80%+, nearly every character rolls. Use empty array [] only when dice frequency is low and no actions warrant tests.

For stateChanges.newQuests: array of new quests to add. Each quest: {"id": "quest_unique_id", "name": "Quest Name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "Milestone"}]}. "objectives" are 2-5 optional milestones guiding through the story. Use empty array [] if no new quests.
For stateChanges.completedQuests: array of quest IDs to mark as completed. Use empty array [] if none completed.
QUEST TRACKING (MANDATORY): For stateChanges.questUpdates: array of objective completions, e.g. [{"questId": "quest_123", "objectiveId": "obj_1", "completed": true}]. AFTER writing the narrative, you MUST cross-check ALL active quest objectives against the scene events. If the narrative describes events that fulfill any objective (even partially or indirectly), you MUST include the corresponding questUpdates entry. NEVER write a journal entry or narrative that fulfills an objective without marking it here. Separate from completedQuests.
QUEST DISCOVERY: When any player explicitly asks about available work, tasks, quests, jobs, or missions, populate the top-level "questOffers" array with 1-3 quest proposals. Each offer: {"id": "quest_<unique>", "name": "Quest Name", "description": "What the quest entails", "completionCondition": "What must be done to complete it", "objectives": [{"id": "obj_1", "description": "First milestone"}, ...], "offeredBy": "NPC name or source", "reward": "Narrative reward hint", "type": "main|side|personal"}. Narrate quest sources naturally — NPCs offering jobs, notice boards, tavern rumors, guild contacts. Use "questOffers" for quests players can accept or decline. Use "stateChanges.newQuests" only for quests forced by story events. When not asked about quests, leave "questOffers" as [].

For stateChanges.activeEffects: manage traps, spells, ongoing environmental effects. Use "add" to place new effects, "remove" to clear them (by id), "trigger" to fire and deactivate them (by id). Use empty array [] if no effect changes.

For stateChanges.npcs: use "introduce" for new NPCs and "update" for existing ones. Always include name and gender. Provide personality, role, attitude toward player, and current location.
NPC DISPOSITION TRACKING: When a dice roll directly involves interaction with an NPC (social, combat, trade, persuasion, etc.), include that NPC in stateChanges.npcs with "dispositionChange": +5 if the roll succeeded, or -5 if it failed. This tracks how favorably the NPC views the player.

COMBAT ENCOUNTERS (MULTIPLAYER):
When the narrative describes the beginning of a hostile combat encounter, include "combatUpdate" in stateChanges with enemy data. The client-side combat engine handles turn-by-turn tactical resolution for all players.
{"combatUpdate": {"active": true, "enemies": [{"name": "Enemy Name", "characteristics": {"ws": 35, "bs": 25, "s": 30, "t": 30, "i": 30, "ag": 30, "dex": 25, "int": 20, "wp": 25, "fel": 15}, "wounds": 10, "maxWounds": 10, "skills": {"Melee (Basic)": 5, "Dodge": 3}, "traits": [], "armour": {"body": 1}, "weapons": ["Hand Weapon"]}], "reason": "Short description of why combat started"}}
PLAYER-INITIATED COMBAT: When ANY player's action explicitly involves attacking, starting a fight, initiating combat, challenging someone, or provoking a confrontation, you MUST include "combatUpdate" with appropriate enemies. Use NPCs currently present in the scene as enemies with stat blocks from the BESTIARY if matching, or create contextually appropriate stats. The narrative should briefly describe the escalation, then combat begins via combatUpdate. Respect player agency: if a player wants to fight, they fight. Do NOT narrate combat without including combatUpdate. Set combatUpdate to null when no combat starts.

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
}

function safeParseJSONContent(raw) {
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }
    throw new Error('Failed to parse AI response as JSON');
  }
}

const RETRY_DELAYS = [1000, 3000];

async function callAI(messages, encryptedApiKeys) {
  const openaiKey = resolveApiKey(encryptedApiKeys, 'openai');
  const anthropicKey = resolveApiKey(encryptedApiKeys, 'anthropic');

  if (!openaiKey && !anthropicKey) {
    throw new Error('No API key configured. The host must have an OpenAI or Anthropic API key.');
  }

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (openaiKey && (attempt < 2 || !anthropicKey)) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages,
            temperature: 0.8,
            response_format: { type: 'json_object' },
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
        }
        const data = await response.json();
        return safeParseJSONContent(data.choices[0].message.content);
      }

      if (anthropicKey) {
        const systemMsg = messages.find((m) => m.role === 'system');
        const userMsgs = messages.filter((m) => m.role !== 'system');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemMsg?.content || '',
            messages: userMsgs,
            temperature: 0.8,
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
        }
        const data = await response.json();
        return safeParseJSONContent(data.content[0].text);
      }
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        const delay = RETRY_DELAYS[attempt] || 3000;
        console.warn(`[multiplayerAI] Retry ${attempt + 1} after ${delay}ms:`, err.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

export async function generateMultiplayerCampaign(settings, players, encryptedApiKeys, language = 'en') {
  const playerCharList = players.map((p) => {
    if (p.characterData) {
      const cd = p.characterData;
      const career = cd.career || {};
      return `- ${cd.name} (${cd.species || 'Human'} ${career.name || 'Adventurer'}, ${p.gender})`;
    }
    return `- ${p.name} (${p.gender})`;
  }).join('\n');

  const humorousToneGuidance = settings.tone === 'Humorous'
    ? `\n\nHUMOROUS TONE GUIDELINES: The humor must NOT rely on random absurdity, slapstick, or zaniness. Instead, ground the campaign in a believable world and derive comedy from 1-2 genuinely controversial, provocative, or morally ambiguous elements — corrupt institutions, taboo customs, ethically questionable practices, morally grey factions, or politically charged conflicts. Comedy should emerge from how characters earnestly navigate these uncomfortable realities: dark irony, social satire, awkward moral dilemmas, characters taking absurd stances on serious issues. Sharp wit about real controversies, not random nonsense.\n`
    : '';

  const prompt = `Create a new MULTIPLAYER WFRP 4th Edition campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
- Story prompt: "${settings.storyPrompt}"
${humorousToneGuidance}
PLAYERS (characters already created by players):
${playerCharList}

Generate the campaign foundation. The characters are already pre-created by the players — do NOT generate new characters. Respond with ONLY valid JSON:
{
  "name": "Campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world",
  "hook": "1-2 paragraphs story hook",
  "firstScene": {
    "narrative": "2-3 paragraphs of the opening scene introducing all characters",
    "dialogueSegments": [{"type": "narration", "text": "..."}],
    "soundEffect": null,
    "musicPrompt": "background music description",
    "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
    "atmosphere": {"weather": "clear", "particles": "none", "mood": "mystical", "transition": "fade"},
    "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
    "journalEntries": ["Opening scene summary"]
  },
  "initialQuest": {"name": "Quest name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "First milestone"}, {"id": "obj_2", "description": "Second milestone"}]},
  "initialWorldFacts": ["Fact 1", "Fact 2", "Fact 3"]
}

${language === 'pl' ? 'Write ALL text in Polish.' : ''}`;

  const messages = [
    { role: 'system', content: `You are a creative WFRP 4th Edition campaign designer. Create immersive multiplayer campaigns. Players already have pre-created characters — do not generate characters. Always respond with valid JSON. Write in ${language === 'pl' ? 'Polish' : 'English'}.` },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages, encryptedApiKeys);

  const characters = players.map((p) => {
    const cd = p.characterData || {};
    return {
      playerName: p.name,
      odId: p.odId,
      name: cd.name || p.name,
      gender: cd.gender || p.gender || 'male',
      species: cd.species || 'Human',
      career: cd.career || { class: 'Warriors', name: 'Soldier', tier: 1, tierName: 'Recruit', status: 'Silver 1' },
      characteristics: cd.characteristics || { ws: 31, bs: 25, s: 34, t: 28, i: 30, ag: 33, dex: 27, int: 35, wp: 29, fel: 32 },
      advances: cd.advances || { ws: 0, bs: 0, s: 0, t: 0, i: 0, ag: 0, dex: 0, int: 0, wp: 0, fel: 0 },
      wounds: cd.wounds ?? cd.maxWounds ?? 12,
      maxWounds: cd.maxWounds ?? 12,
      movement: cd.movement ?? 4,
      fate: cd.fate ?? 2,
      fortune: cd.fortune ?? cd.fate ?? 2,
      resilience: cd.resilience ?? 1,
      resolve: cd.resolve ?? cd.resilience ?? 1,
      skills: cd.skills || {},
      talents: cd.talents || [],
      inventory: cd.inventory || [],
      money: cd.money || { gold: 0, silver: 5, copper: 0 },
      statuses: cd.statuses || [],
      backstory: cd.backstory || '',
      xp: cd.xp ?? 0,
      xpSpent: cd.xpSpent ?? 0,
      needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
    };
  });

  const sceneId = `scene_mp_${Date.now()}`;
  const firstSceneNarrative = result.firstScene?.narrative || 'The adventure begins...';
  const firstSceneSegments = repairDialogueSegments(
    firstSceneNarrative,
    result.firstScene?.dialogueSegments || [],
    []
  );
  const firstScene = {
    id: sceneId,
    narrative: firstSceneNarrative,
    dialogueSegments: firstSceneSegments,
    actions: result.firstScene?.suggestedActions || [],
    soundEffect: result.firstScene?.soundEffect || null,
    musicPrompt: result.firstScene?.musicPrompt || null,
    imagePrompt: result.firstScene?.imagePrompt || null,
    atmosphere: result.firstScene?.atmosphere || {},
    timestamp: Date.now(),
  };

  const dmMessage = {
    id: `msg_${Date.now()}`,
    role: 'dm',
    sceneId: firstScene.id,
    content: firstScene.narrative,
    dialogueSegments: firstScene.dialogueSegments,
    timestamp: Date.now(),
  };

  return {
    campaign: {
      name: result.name || 'Multiplayer Campaign',
      genre: settings.genre,
      tone: settings.tone,
      style: settings.style,
      difficulty: settings.difficulty,
      length: settings.length,
      worldDescription: result.worldDescription || '',
      hook: result.hook || '',
    },
    characters,
    world: {
      locations: [],
      facts: result.initialWorldFacts || [],
      eventHistory: result.firstScene?.journalEntries || [],
      npcs: [],
      mapState: [],
      mapConnections: [],
      currentLocation: '',
      exploredLocations: [],
      timeState: { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' },
      weather: { type: 'clear', intensity: 'mild', description: '' },
      factions: {},
      knowledgeBase: { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] },
      activeEffects: [],
      compressedHistory: '',
      codex: {},
    },
    quests: {
      active: result.initialQuest ? [{
        id: `quest_${Date.now()}`,
        ...result.initialQuest,
        objectives: (result.initialQuest.objectives || []).map((obj) => ({
          ...obj,
          completed: obj.completed ?? false,
        })),
      }] : [],
      completed: [],
    },
    scenes: [firstScene],
    chatHistory: [dmMessage],
    characterMomentum: {},
  };
}

export async function generateMidGameCharacter(gameState, settings, playerName, playerGender, encryptedApiKeys, language = 'en', playerCharacterData = null) {
  // If the player already created a character via the modal, use it directly
  if (playerCharacterData) {
    const cd = playerCharacterData;
    return {
      character: {
        playerName,
        name: cd.name || playerName,
        gender: cd.gender || playerGender || 'male',
        species: cd.species || 'Human',
        career: cd.career || { class: 'Warriors', name: 'Soldier', tier: 1, tierName: 'Recruit', status: 'Silver 1' },
        characteristics: cd.characteristics || {},
        advances: cd.advances || {},
        wounds: cd.wounds ?? cd.maxWounds ?? 12,
        maxWounds: cd.maxWounds ?? 12,
        movement: cd.movement ?? 4,
        fate: cd.fate ?? 2,
        fortune: cd.fortune ?? cd.fate ?? 2,
        resilience: cd.resilience ?? 1,
        resolve: cd.resolve ?? cd.resilience ?? 1,
        skills: cd.skills || {},
        talents: cd.talents || [],
        inventory: cd.inventory || [],
        money: cd.money || { gold: 0, silver: 5, copper: 0 },
        statuses: cd.statuses || [],
        backstory: cd.backstory || '',
        xp: cd.xp ?? 0,
        xpSpent: cd.xpSpent ?? 0,
        needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
      },
      arrivalNarrative: `${cd.name || playerName} joins the adventure.`,
    };
  }

  const existingChars = (gameState.characters || [])
    .map((c) => `- ${c.name} (${c.species || 'Human'} ${c.career?.name || 'Adventurer'}, Wounds ${c.wounds}/${c.maxWounds})`)
    .join('\n') || 'None';

  const campaign = gameState.campaign || {};

  const prompt = `A new player is joining a MULTIPLAYER WFRP 4th Edition campaign mid-game.

CAMPAIGN: "${campaign.name || 'Unnamed'}"
- Genre: ${settings.genre || 'Fantasy'}
- Tone: ${settings.tone || 'Epic'}
- Difficulty: ${settings.difficulty || 'Normal'}
- World: ${campaign.worldDescription?.substring(0, 300) || 'A mysterious world'}

EXISTING CHARACTERS:
${existingChars}

NEW PLAYER: ${playerName} (${playerGender})

Create a WFRP character for this new player that fits the campaign.

Respond with ONLY valid JSON:
{
  "name": "${playerName}",
  "species": "Human",
  "career": {"class": "Warriors", "name": "Soldier", "tier": 1, "tierName": "Recruit", "status": "Silver 1"},
  "characteristics": {"ws": 31, "bs": 25, "s": 34, "t": 28, "i": 30, "ag": 33, "dex": 27, "int": 35, "wp": 29, "fel": 32},
  "skills": {"Melee (Basic)": 5, "Dodge": 5},
  "talents": ["Warrior Born", "Drilled"],
  "wounds": 12, "maxWounds": 12,
  "movement": 4, "fate": 2, "resilience": 1,
  "inventory": [],
  "backstory": "2-3 sentences explaining how they arrive mid-adventure",
  "arrivalNarrative": "1-2 sentences describing the character appearing/arriving in the current scene"
}

${language === 'pl' ? 'Write ALL text in Polish.' : ''}`;

  const messages = [
    { role: 'system', content: `You are a WFRP 4th Edition character designer. Create balanced characters that fit existing campaigns. Write in ${language === 'pl' ? 'Polish' : 'English'}. Always respond with valid JSON.` },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages, encryptedApiKeys);

  return {
    character: {
      playerName,
      name: result.name || playerName,
      gender: playerGender || 'male',
      species: result.species || 'Human',
      career: result.career || { class: 'Warriors', name: 'Soldier', tier: 1, tierName: 'Recruit', status: 'Silver 1' },
      characteristics: result.characteristics || { ws: 31, bs: 25, s: 34, t: 28, i: 30, ag: 33, dex: 27, int: 35, wp: 29, fel: 32 },
      advances: { ws: 0, bs: 0, s: 0, t: 0, i: 0, ag: 0, dex: 0, int: 0, wp: 0, fel: 0 },
      wounds: result.wounds ?? result.maxWounds ?? 12,
      maxWounds: result.maxWounds ?? 12,
      movement: result.movement ?? 4,
      fate: result.fate ?? 2,
      fortune: result.fate ?? 2,
      resilience: result.resilience ?? 1,
      resolve: result.resilience ?? 1,
      skills: result.skills || {},
      talents: result.talents || [],
      inventory: result.inventory ?? [],
      money: { gold: 0, silver: 5, copper: 0 },
      statuses: [],
      backstory: result.backstory || '',
      xp: 0,
      xpSpent: 0,
      needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
    },
    arrivalNarrative: result.arrivalNarrative || `${playerName} joins the adventure.`,
  };
}

export async function generateMultiplayerScene(gameState, settings, players, actions, encryptedApiKeys, language = 'en', dmSettings = null, characterMomentum = null) {
  const systemPrompt = buildMultiplayerSystemPrompt(gameState, settings, players, language, dmSettings);
  const actionByName = new Map(actions.map((action) => [action.name, action]));
  const characterByName = new Map((gameState.characters || []).map((character) => [character.name, character]));

  const testsFrequency = dmSettings?.testsFrequency ?? 50;
  const preRolledDice = {};
  const skipDiceRolls = {};
  for (const a of actions) {
    if (Math.random() * 100 < testsFrequency) {
      preRolledDice[a.name] = rollD100();
    } else {
      skipDiceRolls[a.name] = true;
    }
  }

  const scenePrompt = buildMultiplayerScenePrompt(actions, false, language, { needsSystemEnabled: settings.needsSystemEnabled === true, characters: gameState.characters || [] }, dmSettings, preRolledDice, characterMomentum, skipDiceRolls);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: scenePrompt },
  ];

  const result = await callAI(messages, encryptedApiKeys);

  function normalizeDiceRoll(dr, fallbackCharacterName = null) {
    if (!dr || dr.roll == null || dr.target == null) return dr;

    const characterName = dr.character || fallbackCharacterName;
    const actionText = actionByName.get(characterName)?.action || actions[0]?.action || '';
    const characterData = characterByName.get(characterName) || null;
    const resolvedCharacteristic = resolveDiceRollCharacteristic(dr, actionText);
    if (!resolvedCharacteristic) return null;

    dr.characteristic = resolvedCharacteristic;
    if (dr.characteristicValue == null) {
      dr.characteristicValue = characterData?.characteristics?.[resolvedCharacteristic] ?? null;
    }

    return dr.characteristicValue == null ? null : dr;
  }

  function recalcDiceRoll(dr) {
    if (dr && dr.roll != null && dr.target != null) {
      const originalTarget = dr.target;
      const roll = dr.roll;
      const bonus = dr.creativityBonus || 0;
      const momentum = dr.momentumBonus || 0;
      const disposition = dr.dispositionBonus || 0;
      const providedDifficultyModifier = dr.difficultyModifier != null
        ? normalizeDifficultyModifier(dr.difficultyModifier)
        : null;

      let baseTarget;
      if (dr.baseTarget) {
        baseTarget = dr.baseTarget;
      } else if (dr.characteristicValue != null && dr.skillAdvances != null) {
        baseTarget = dr.characteristicValue + dr.skillAdvances;
      } else {
        baseTarget = dr.target - bonus - momentum - disposition - (providedDifficultyModifier ?? 0);
      }
      dr.baseTarget = baseTarget;

      if (dr.skillAdvances == null && dr.characteristicValue != null) {
        dr.skillAdvances = Math.max(0, baseTarget - dr.characteristicValue);
      }

      const totalBonus = bonus + momentum + disposition;
      const cappedBonus = Math.min(totalBonus, MAX_COMBINED_BONUS);
      const difficultyModifier = providedDifficultyModifier ?? snapDifficultyModifier(originalTarget - baseTarget - cappedBonus);
      dr.difficultyModifier = difficultyModifier;
      const effectiveTarget = baseTarget + cappedBonus + difficultyModifier;
      dr.target = effectiveTarget;

      const isCriticalSuccess = roll >= 1 && roll <= 4;
      const isCriticalFailure = roll >= 96 && roll <= 100;
      dr.success = isCriticalSuccess || (!isCriticalFailure && roll <= effectiveTarget);
      dr.criticalSuccess = isCriticalSuccess;
      dr.criticalFailure = isCriticalFailure;
      dr.sl = calculateSL(roll, effectiveTarget);
    }
  }

  if (result.diceRolls?.length) {
    result.diceRolls = result.diceRolls
      .map((dr) => normalizeDiceRoll(dr))
      .filter(Boolean);
    for (const dr of result.diceRolls) recalcDiceRoll(dr);
  }
  if (result.diceRoll) {
    result.diceRoll = normalizeDiceRoll(result.diceRoll, actions[0]?.name);
    if (result.diceRoll) recalcDiceRoll(result.diceRoll);
  }

  const worldNpcs = gameState?.world?.npcs || [];
  const stateNpcs = result.stateChanges?.npcs || [];
  const repairedSegments = repairDialogueSegments(
    result.narrative || '',
    result.dialogueSegments || [],
    [...worldNpcs, ...stateNpcs]
  );

  let finalSegments = repairedSegments;
  for (const a of actions) {
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
    dialogueSegments: finalSegments,
    actions: result.suggestedActions || [],
    questOffers,
    soundEffect: result.soundEffect || null,
    musicPrompt: result.musicPrompt || null,
    imagePrompt: result.imagePrompt || null,
    atmosphere: result.atmosphere || {},
    diceRoll: result.diceRoll || null,
    diceRolls: result.diceRolls || [],
    playerActions: actions.map((a) => ({ name: a.name, action: a.action })),
    timestamp: Date.now(),
    ...(stateChanges.combatUpdate && { stateChanges: { combatUpdate: stateChanges.combatUpdate } }),
  };

  const chatMessages = [];
  for (const a of actions) {
    chatMessages.push({
      id: `msg_${Date.now()}_${a.odId}`,
      role: 'player',
      playerName: a.name,
      odId: a.odId,
      content: a.action,
      timestamp: Date.now(),
    });
  }
  if (result.diceRolls?.length) {
    for (const dr of result.diceRolls) {
      chatMessages.push({
        id: `msg_${Date.now()}_roll_${dr.character}`,
        role: 'system',
        subtype: 'dice_roll',
        content: `🎲 ${dr.character} — ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — SL ${dr.sl ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
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
      content: `🎲 ${dr.skill || 'Check'}: ${dr.roll ?? '?'} vs ${dr.target ?? '?'} — SL ${dr.sl ?? 0} — ${dr.success ? 'Success' : 'Failure'}`,
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

const COMPRESSION_THRESHOLD = 15;
const FULL_SCENE_KEEP = 3;
const MEDIUM_SCENE_KEEP = 5;

export function needsCompression(gameState) {
  return (gameState.scenes || []).length > COMPRESSION_THRESHOLD && !gameState.world?.compressedHistory;
}

export async function compressOldScenes(gameState, encryptedApiKeys, language = 'en') {
  const scenes = gameState.scenes || [];
  const scenesToCompress = scenes.slice(0, -FULL_SCENE_KEEP - MEDIUM_SCENE_KEEP);
  if (scenesToCompress.length === 0) return null;

  const scenesText = scenesToCompress
    .map((s, i) => {
      const actions = (s.playerActions || []).map((a) => `${a.name}: ${a.action}`).join('; ');
      return `Scene ${i + 1}${actions ? ` [${actions}]` : ''}: ${s.narrative}`;
    })
    .join('\n\n');

  const langNote = language === 'pl' ? ' Write the summary in Polish, matching the language of the source scenes.' : '';
  const systemPrompt = `You are a narrative summarizer for a multiplayer RPG game. Compress scene histories into concise but complete summaries that preserve all important details: character names, NPC names, locations, player decisions, consequences, combat outcomes, items found, and plot developments. Always respond with valid JSON only.${langNote}`;
  const userPrompt = `Summarize the following multiplayer RPG scene history into a concise narrative summary (max 2000 characters). Preserve key facts: character names and actions, NPC names and fates, locations visited, items acquired/lost, major decisions and their consequences, combat outcomes, and unresolved plot threads.\n\nSCENES:\n${scenesText}\n\nRespond with JSON: {"summary": "Your compressed summary here..."}`;

  try {
    const result = await callAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      encryptedApiKeys,
    );
    return result?.summary || null;
  } catch (err) {
    console.warn('[multiplayerAI] Scene compression failed:', err.message);
    return null;
  }
}
