import { buildMultiplayerUnmetNeedsBlock } from './systemPrompt.js';

export function buildMultiplayerScenePrompt(actions, isFirstScene = false, language = 'en', { needsSystemEnabled = false, characters = null } = {}, dmSettings = null, preRolledDice = null, characterMomentum = null, skipDiceRolls = null) {
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
NPC DISPOSITION TRACKING: When a dice roll involves interaction with an NPC, include a variable "dispositionChange" based on margin — NOT flat +5/-5:
- Critical success (roll 1): +3 to +5, Strong success (margin 10+): +2 to +3, Moderate success (margin 5-9): +1 to +2, Marginal success (margin 0-4): +1
- Marginal failure (margin -1 to -5): -1 to -2, Hard failure (margin -6 or worse): -3 to -5, Critical failure (roll 50): -5 to -8
NPC RELATIONSHIP TRACKING: Include optional fields: "factionId", "relatedQuestIds", "relationships".

COMBAT ENCOUNTERS (MULTIPLAYER):
When the narrative describes the beginning of a hostile combat encounter, include "combatUpdate" in stateChanges.
{"combatUpdate": {"active": true, "enemies": [{"name": "Enemy Name"}], "reason": "Short description of why combat started"}}
The game engine assigns balanced stat blocks based on enemy names. Set combatUpdate to null when no combat starts.

For stateChanges.factionChanges: {"faction_id": delta} when actions affect a faction. Use null if none.
For stateChanges.knowledgeUpdates, narrativeSeeds, resolvedSeeds, npcAgendas: see normal scene documentation.
For stateChanges.campaignEnd: only for definitive conclusions. Use null otherwise.

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
  }

  const testsFrequency = dmSettings?.testsFrequency ?? 50;
  const needsReminder = needsSystemEnabled ? buildMultiplayerUnmetNeedsBlock(characters) : '';

  const hasWait = actions.some((a) => a.action === '[WAIT]');
  const hasContinue = actions.some((a) => a.action === '[CONTINUE]');
  const specialActionHints = [
    hasWait
      ? `[WAIT] — Player(s) chose passive waiting: they take no initiative; NPCs and the world should advance meaningfully around them. Set diceRolls to null / omit dice for those characters. Do not start combat unless the world attacks them unprovoked.`
      : null,
    hasContinue
      ? `[CONTINUE] — Player(s) want the story to move forward without specifying how: advance the plot or situation; they remain engaged but you drive the next beat.`
      : null,
  ].filter(Boolean).join('\n\n');

  const hasCustomActions = actions.some((a) => a.isCustom);
  const hasMomentum = characterMomentum && Object.values(characterMomentum).some((v) => v !== 0);
  const actionLines = actions
    .map((a) => {
      const skipRoll = skipDiceRolls?.[a.name];
      const diceInfo = !skipRoll && preRolledDice?.[a.name] ? ` [PRE-ROLLED d50: ${preRolledDice[a.name]}]` : '';
      const skipInfo = skipRoll ? ' [NO DICE ROLL]' : '';
      const momInfo = !skipRoll && characterMomentum?.[a.name] !== 0 && characterMomentum?.[a.name] != null ? ` [MOMENTUM ${characterMomentum[a.name] > 0 ? '+' : ''}${characterMomentum[a.name]}]` : '';
      return `- ${a.name} (${a.gender}): ${a.action}${a.isCustom ? ' [CUSTOM ACTION]' : ''}${diceInfo}${skipInfo}${momInfo}`;
    })
    .join('\n');

  return `${needsReminder}${specialActionHints ? `${specialActionHints}\n\n` : ''}The players' actions this round:
${actionLines}

ACTION VS SPEECH (CRITICAL — read both rules carefully):
RULE 1 — ACTION PARTS: The non-quoted parts of each player's input describe what their character DOES — narrate them as action in prose. Never turn unquoted action text into spoken dialogue (e.g. the character must NOT announce their own action aloud).
RULE 2 — SPEECH PARTS (MANDATORY): When the input contains text inside quotation marks ("..."), that is the character speaking those exact words in-character. You MUST include each quoted phrase as a "dialogue" segment in dialogueSegments with that player character's name and gender. Do NOT skip, paraphrase, or fold quoted speech into narration — present it as actual spoken dialogue.
Example: input [I encourage everyone to celebrate. "Party on!" I shout.] → narrate the encouraging as action, then include "Party on!" as a dialogue segment.
If the input has NO quotation marks at all, the character does not speak (unless you as GM decide they would naturally say something brief and contextually fitting — but never the player's input text verbatim).

Resolve ALL player actions simultaneously. Describe what happens to each character.

FEASIBILITY CHECK: Before rolling dice, verify each action is possible given the NPCs and features present at the current location. Impossible actions auto-fail (no diceRolls entry). Trivial/certain actions auto-succeed (no diceRolls entry). Only roll for uncertain outcomes.
Simple repositioning or low-risk movement such as taking a step back, moving aside, or cautiously backing away is usually trivial. Prefer no dice roll unless the scene is actively dangerous; if you do require a roll, expose that ease with difficultyModifier +20 or +30.

DICE ROLL FREQUENCY: The dice roll frequency is ~${testsFrequency}%. For each player's action, decide whether a roll is needed based on this frequency. At high values (80%+), even trivial actions require a roll. Each character who needs a test gets their own entry in the diceRolls array. Build each roll like this: "baseTarget" = attribute + skill level, "difficultyModifier" = an explicit difficulty step, and "target" = the final effective target used for success comparison.
ATTRIBUTE RULE: Every diceRolls entry MUST include a valid RPGon attribute key: sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, or szczescie. For speech, persuasion, bargaining, bluffing, charming, greeting, and asking questions, default to charyzma unless a more specific skill clearly implies another attribute. Never invent non-RPGon stats. If you cannot determine a valid attribute, omit that character from diceRolls instead of guessing.
DIFFICULTY MODIFIER: Always expose task difficulty explicitly via "difficultyModifier" instead of hiding it inside "target". Use only one of these values: +40, +30, +20, +10, 0, -10, -20, -30, -40. Guide: +40 routine, +30 easy, +20 favorable, +10 slightly favorable, 0 standard, -10 challenging, -20 hard, -30 very hard, -40 extreme / nearly suicidal.
NPC DISPOSITION MODIFIERS: When a roll involves direct NPC interaction (social, trade, persuasion), apply the NPC's disposition as a separate target modifier: >=30:+15, >=15:+10, >=5:+5, neutral:0, <=-5:-5, <=-15:-10, <=-30:-15. Include "dispositionBonus" in the diceRoll entry.
${preRolledDice ? `PRE-ROLLED DICE: Each character has a pre-rolled d50 value (1-50) shown above. You MUST use these exact values as the "roll" in diceRolls. Do NOT generate your own roll numbers. First determine each character's skill and target number (including creativity bonus for custom actions), then check whether the pre-rolled value succeeds or fails against the target, and THEN write the narrative matching those outcomes.` : ''}
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
  "diceRolls": [{"character": "CharacterName", "type": "d50", "roll": 22, "target": 35, "margin": 12, "skill": "Atletyka", "success": true}],
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

For diceRolls: an array of per-character dice roll results. Each entry: {"character": "CharacterName", "type": "d50", "roll": <1-50>, "attribute": "<sila/inteligencja/charyzma/zrecznosc/wytrzymalosc/szczescie>", "attributeValue": <number — raw stat value 1-25>, "skillLevel": <number — skill level, 0 if untrained>, "baseTarget": <number — attribute + skill level only>, "difficultyModifier": <one of 40, 30, 20, 10, 0, -10, -20, -30, -40>, "target": <number — the EFFECTIVE target used for success comparison>, "margin": <number>, "skill": "<skill name>", "success": <boolean>}. For custom actions, also include: "creativityBonus": <number 10-40>. ${preRolledDice ? 'Use the pre-rolled d50 values for each character.' : ''} For social speech and persuasion use charyzma unless a more specific skill says otherwise. If no valid RPGon attribute fits, omit that character from diceRolls. For custom actions: "target" = baseTarget + difficultyModifier + creativityBonus (+ any other applicable modifiers). For normal actions: "target" = baseTarget + difficultyModifier (+ any other applicable modifiers). "difficultyModifier" must always be explicit; do not hide it only inside "target". Determine success by comparing roll to target: success = (roll <= target) OR (roll === 1, critical success). Roll 50 is always failure (critical failure). The narrative MUST match all dice outcomes. Include a roll for each character whose action warrants a test based on the configured frequency (~${testsFrequency}%). At 80%+, nearly every character rolls. Use empty array [] only when dice frequency is low and no actions warrant tests.

For stateChanges.newQuests: array of new quests to add. Each quest: {"id": "quest_unique_id", "name": "Quest Name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "Milestone"}]}. "objectives" are 2-5 optional milestones guiding through the story. Use empty array [] if no new quests.
For stateChanges.completedQuests: array of quest IDs to mark as completed. Use empty array [] if none completed.
QUEST TRACKING (MANDATORY): For stateChanges.questUpdates: array of objective completions, e.g. [{"questId": "quest_123", "objectiveId": "obj_1", "completed": true}]. AFTER writing the narrative, you MUST cross-check ALL active quest objectives against the scene events. If the narrative describes events that fulfill any objective (even partially or indirectly), you MUST include the corresponding questUpdates entry. NEVER write a journal entry or narrative that fulfills an objective without marking it here. Separate from completedQuests.
QUEST DISCOVERY: When any player explicitly asks about available work, tasks, quests, jobs, or missions, populate the top-level "questOffers" array with 1-3 quest proposals. Each offer: {"id": "quest_<unique>", "name": "Quest Name", "description": "What the quest entails", "completionCondition": "What must be done to complete it", "objectives": [{"id": "obj_1", "description": "First milestone"}, ...], "offeredBy": "NPC name or source", "reward": "Narrative reward hint", "type": "main|side|personal"}. Narrate quest sources naturally — NPCs offering jobs, notice boards, tavern rumors, guild contacts. Use "questOffers" for quests players can accept or decline. Use "stateChanges.newQuests" only for quests forced by story events. When not asked about quests, leave "questOffers" as [].

For stateChanges.activeEffects: manage traps, spells, ongoing environmental effects. Use "add" to place new effects, "remove" to clear them (by id), "trigger" to fire and deactivate them (by id). Use empty array [] if no effect changes.

For stateChanges.npcs: use "introduce" for new NPCs and "update" for existing ones. Always include name and gender. Provide personality, role, attitude toward player, and current location.
NPC DISPOSITION TRACKING: When a dice roll involves interaction with an NPC, include that NPC in stateChanges.npcs with a variable "dispositionChange" based on margin — NOT a flat +5/-5:
- Critical success (roll 1): +3 to +5, Strong success (margin 10+): +2 to +3, Moderate success (margin 5-9): +1 to +2, Marginal success (margin 0-4): +1
- Marginal failure (margin -1 to -5): -1 to -2, Hard failure (margin -6 or worse): -3 to -5, Critical failure (roll 50): -5 to -8
- Betrayal, broken promise, or threat: -8 to -10
NPC RELATIONSHIP TRACKING: Include optional fields: "factionId", "relatedQuestIds", "relationships" ([{"npcName": "Other NPC", "type": "ally|enemy|family|employer|rival|friend|mentor|subordinate"}]).

COMBAT ENCOUNTERS (MULTIPLAYER):
When the narrative describes the beginning of a hostile combat encounter, include "combatUpdate" in stateChanges.
{"combatUpdate": {"active": true, "enemies": [{"name": "Enemy Name"}], "reason": "Short description of why combat started"}}
The game engine assigns balanced stat blocks based on enemy names — you only need to provide the name.
PLAYER-INITIATED COMBAT: When ANY player's action explicitly involves attacking, starting a fight, initiating combat, challenging someone, or provoking a confrontation, you MUST include "combatUpdate" with appropriate enemies. Use NPCs currently present in the scene. Respect player agency: if a player wants to fight, they fight. Do NOT narrate combat without including combatUpdate. Set combatUpdate to null when no combat starts.

For stateChanges.factionChanges: {"faction_id": delta} when actions affect a faction. IDs: merchants_guild, thieves_guild, temple_sigmar, temple_morr, military, noble_houses, chaos_cults, witch_hunters, wizards_college, peasant_folk. Use null if no faction changes.
For stateChanges.knowledgeUpdates: {"events": [{"summary": "...", "importance": "minor|major|critical", "tags": []}], "decisions": [{"choice": "...", "consequence": "...", "tags": []}], "plotThreads": [{"id": "...", "name": "...", "status": "active|resolved|abandoned", "relatedNpcIds": [], "relatedQuestIds": []}]}. Use null if no knowledge updates.
For stateChanges.narrativeSeeds: array of foreshadowing details: [{"id": "seed_id", "description": "what the player notices", "payoffCondition": "location|scenes", "payoffHint": "GM note on resolution", "location": "where it pays off"}]. Plant 0-1 per scene. Use empty array [] if none.
For stateChanges.resolvedSeeds: array of seed IDs whose payoff is woven into this scene. Use empty array [] if none.
For stateChanges.npcAgendas: array of off-screen NPC activities: [{"npcName": "NPC", "goal": "what they want", "nextAction": "what they will do", "urgency": "low|medium|high", "triggerAfterScenes": 3}]. Use empty array [] if none.
For stateChanges.campaignEnd: {"status": "completed"|"failed", "epilogue": "2-3 paragraph epilogue"} ONLY for definitive campaign conclusions. Use null otherwise.

For scenePacing (MANDATORY): return one of: combat, chase, stealth, exploration, dialogue, travel_montage, celebration, rest, dramatic, dream, cutscene. Match prose style to the chosen pacing type.
For cutscene: {"title": "Meanwhile...", "narrative": "1-2 paragraphs", "location": "Location", "characters": ["NPC"]}. Use sparingly. Set to null when not using. Never include player characters.
For dilemma: {"title": "...", "stakes": "...", "options": [{"label": "...", "consequence": "...", "action": "..."}]}. 2-4 options. Use every 5-8 scenes when narrative supports it. Set to null otherwise.

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
}
