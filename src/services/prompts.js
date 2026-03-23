import { getBonus, formatMoney } from './gameState';

const NEEDS_LABELS = {
  hunger: { low: 'hungry, distracted', critical: 'weak, dizzy, stomach pains' },
  thirst: { low: 'thirsty, dry mouth', critical: 'parched, cracked lips, fading' },
  bladder: { low: 'uncomfortable, fidgeting', critical: 'desperate, about to lose control', zero: 'lost control!' },
  hygiene: { low: 'smelly, NPCs wrinkle noses', critical: 'terrible stench, NPCs recoil' },
  rest: { low: 'tired, yawning, slower reactions', critical: 'can barely keep eyes open, stumbling', zero: 'collapses from exhaustion' },
};

export function buildUnmetNeedsBlock(needs) {
  if (!needs) return '';
  const lines = [];
  for (const [key, labels] of Object.entries(NEEDS_LABELS)) {
    const val = needs[key] ?? 100;
    if (val <= 0 && labels.zero) {
      lines.push(`- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}/100 [${key === 'bladder' ? 'ACCIDENT' : 'COLLAPSE'} — ${labels.zero}]`);
    } else if (val < 15) {
      lines.push(`- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}/100 [CRITICAL — ${labels.critical}]`);
    } else if (val < 30) {
      lines.push(`- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${val}/100 [LOW — ${labels.low}]`);
    }
  }
  if (lines.length === 0) return '';
  return `UNMET CHARACTER NEEDS (factor these into the scene — affect narration, NPC reactions, and outcomes):\n${lines.join('\n')}\n\n`;
}

export function buildSystemPrompt(gameState, dmSettings, language = 'en', enhancedContext = null, { needsSystemEnabled = false } = {}) {
  const { campaign, character, world, quests } = gameState;

  const activeQuests = quests.active.map((q) => `- ${q.name}: ${q.description}`).join('\n') || 'None';
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
  const humorLabel = (dmSettings.narratorHumor ?? 20) < 25 ? 'completely serious' : (dmSettings.narratorHumor ?? 20) < 50 ? 'occasional dry wit' : (dmSettings.narratorHumor ?? 20) < 75 ? 'frequent humor woven into narration' : 'heavily comedic, irreverent and absurdist';
  const dramaLabel = (dmSettings.narratorDrama ?? 50) < 25 ? 'understated and subtle' : (dmSettings.narratorDrama ?? 50) < 50 ? 'measured dramatic pacing' : (dmSettings.narratorDrama ?? 50) < 75 ? 'heightened drama and tension' : 'maximally theatrical, grandiose and operatic';

  const npcs = world?.npcs || [];
  const npcSection = npcs.length > 0
    ? npcs.map((n) => `- ${n.name} (${n.role || 'unknown role'}, ${n.gender || '?'}): personality="${n.personality || '?'}", attitude=${n.attitude || 'neutral'}, location="${n.lastLocation || 'unknown'}"${n.alive === false ? ' [DEAD]' : ''}${n.notes ? ` — ${n.notes}` : ''}`).join('\n')
    : 'No NPCs encountered yet.';

  const currentLoc = world?.currentLocation || 'Unknown';
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
${needsSystemEnabled && character?.needs ? `
CHARACTER NEEDS (biological/physical needs — scale 0-100, 100=fully satisfied, 0=critical):
- Hunger: ${character.needs.hunger ?? 100}/100${(character.needs.hunger ?? 100) < 15 ? ' [CRITICAL — weak, dizzy, stomach pains]' : (character.needs.hunger ?? 100) < 30 ? ' [LOW — hungry, distracted]' : ''}
- Thirst: ${character.needs.thirst ?? 100}/100${(character.needs.thirst ?? 100) < 15 ? ' [CRITICAL — parched, cracked lips, fading]' : (character.needs.thirst ?? 100) < 30 ? ' [LOW — thirsty, dry mouth]' : ''}
- Bladder: ${character.needs.bladder ?? 100}/100${(character.needs.bladder ?? 100) <= 0 ? ' [ACCIDENT — character has lost control!]' : (character.needs.bladder ?? 100) < 10 ? ' [CRITICAL — desperate, funny walk, about to lose control]' : (character.needs.bladder ?? 100) < 30 ? ' [LOW — uncomfortable, fidgeting]' : ''}
- Hygiene: ${character.needs.hygiene ?? 100}/100${(character.needs.hygiene ?? 100) < 15 ? ' [CRITICAL — terrible stench, NPCs recoil]' : (character.needs.hygiene ?? 100) < 30 ? ' [LOW — smelly, NPCs wrinkle noses]' : ''}
- Rest: ${character.needs.rest ?? 100}/100${(character.needs.rest ?? 100) <= 0 ? ' [COLLAPSE — character passes out from exhaustion]' : (character.needs.rest ?? 100) < 15 ? ' [CRITICAL — can barely keep eyes open, stumbling]' : (character.needs.rest ?? 100) < 30 ? ' [LOW — tired, yawning, slower reactions]' : ''}

NEEDS SYSTEM RULES:
- Needs decay automatically based on hours elapsed. Realistic daily rhythm: ~3 meals, ~4 drinks, ~3 bathroom breaks, ~1 bath, ~8h sleep.
- Weave need effects naturally into the narrative when they are LOW or CRITICAL. Do NOT ignore them.
- Below 30: mild mentions (discomfort, distraction, brief references).
- Below 15: strong effects that actively impact the scene (weakness, funny walking, NPC reactions to smell, drowsiness).
- At 0 for bladder: the character wets themselves — narrate the embarrassment and NPC reactions.
- At 0 for rest: the character collapses/falls asleep involuntarily.
- When the character satisfies a need (eats, drinks, uses a toilet, bathes, sleeps), use stateChanges.needsChanges to restore it.
  Typical restoration: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet +80-100 bladder, bath +60-80 hygiene, full night sleep +70-90 rest, short nap +20-30 rest.
- Use stateChanges.needsChanges as DELTAS: {"hunger": 60} means +60 to hunger. Can be negative too.
- Always include at least one suggested action related to the most urgent need when any need is below 30.
- IMPORTANT: Always include stateChanges.timeAdvance with "hoursElapsed" (decimal) indicating how many in-game hours this action took (e.g. 0.25 for a quick action = 15 min, 0.5 for a short action = 30 min, 1 for exploration, 8 for sleeping).
` : ''}
WFRP 4e RULES FOR THE GM:
- Use the d100 percentile system. When a skill test is needed, the target number = characteristic + skill advances.
- Success Levels (SL) = (target - roll) ÷ 10, rounded toward 0. Positive SL = degrees of success, negative = degrees of failure.
- A roll of 01-05 always succeeds; 96-00 always fails.
- CRITICAL SUCCESS (roll 01-04): automatic success regardless of target number. Award bonus SL (+1 to +3 extra). Narrate an exceptionally favorable outcome — extra benefits, impressive feats, awed NPCs, found bonus loot, etc.
- CRITICAL FAILURE (roll 96-100): automatic failure regardless of target number. Apply penalty SL (-1 to -3 extra). Narrate a disastrous outcome — additional negative consequences such as injury (woundsChange), broken equipment (removeItems), angered NPCs, environmental hazards triggered, embarrassing mishaps, etc.
- IMPORTANT: When a dice roll results in FAILURE (roll > target and not 01-04), the action MUST FAIL in the narrative. The character does NOT achieve what they attempted. Never let a failed roll lead to a successful outcome. Describe how and why the action fails, then present new options.
- Fortune points can be spent to reroll or add +1 SL. Fate points cheat death. Resolve replenishes Resilience.
- Wounds represent physical damage. At 0 Wounds, the character takes Critical Wounds.
- Award XP (typically 20-50 per scene) via stateChanges.xp for good roleplay, clever solutions, and combat.
- When the character uses Fortune/Resolve, reflect it in stateChanges (fortuneChange/resolveChange as negative deltas).
- Fortune resets to Fate value after a night's rest.

NPC REGISTRY (reference for consistent characterization — use established personalities and speech patterns):
${npcSection}

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

LANGUAGE INSTRUCTION:
Write ALL narrative text, dialogue, descriptions, quest names, item names, and suggested actions in ${language === 'pl' ? 'Polish' : 'English'}.

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
14. If the character needs system is active, reflect low needs in narration and use stateChanges.needsChanges when needs are satisfied (eating, drinking, bathing, resting, using a toilet).

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

SCENE IMAGE PROMPT:
Include an "imagePrompt" field with a short ENGLISH description of the scene for AI image generation (max 200 characters). Describe the visual composition, key subjects, environment, lighting, and colors. Always write in English regardless of the narrative language. Example: "a lone warrior standing at the edge of a crumbling stone bridge over a misty chasm, torchlight, dark fantasy".`;
}

export function buildSceneGenerationPrompt(playerAction, isFirstScene = false, language = 'en', { needsSystemEnabled = false, characterNeeds = null, isCustomAction = false } = {}, dmSettings = null) {
  const langReminder = `\n\nLANGUAGE REMINDER: Write "narrative", "dialogueSegments" text, "suggestedActions", "journalEntries", "worldFacts", and quest names/descriptions in ${language === 'pl' ? 'Polish' : 'English'}. Only "soundEffect", "musicPrompt", and "imagePrompt" should remain in English.`;

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
    "transition": "dissolve | fade | arcane_wipe"
  },
  "suggestedActions": ["Action option 1", "Action option 2", "Action option 3", "Action option 4"],
  "stateChanges": {
    "journalEntries": ["Concise 1-2 sentence summary of a key event from this scene"],
    "npcs": [{"action": "introduce", "name": "NPC Name", "gender": "male", "role": "innkeeper", "personality": "jovial, loud", "attitude": "friendly", "location": "The Rusty Anchor", "notes": ""}],
    "mapChanges": [{"location": "Location Name", "modification": "Description of change", "type": "discovery"}],
    "timeAdvance": {"hoursElapsed": 0.5, "newDay": false},
    "activeEffects": [],
    "moneyChange": null,
    "currentLocation": "Location Name"${needsSystemEnabled ? ',\n    "needsChanges": null' : ''}
  },
  "diceRoll": null
}
${needsSystemEnabled ? '\nFor stateChanges.needsChanges: use when the character satisfies a biological need (eating, drinking, toilet, bathing, resting). Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger and +40 thirst. Use null if no needs changed.\n' : ''}
For stateChanges.timeAdvance: ALWAYS include "hoursElapsed" (decimal). Each action typically takes 15 min to 1 hour: quick interaction=0.25, short action/combat=0.5, exploration=0.75-1. Only resting (2-4) and sleeping (6-8) should exceed 1 hour.

For stateChanges.journalEntries: provide 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant player decisions, discoveries, or combat outcomes. Each entry should be a self-contained 1-2 sentence summary. Do NOT log trivial details.

For atmosphere: choose weather, particles, mood, and transition that match the scene's environment and tone. weather describes the environmental condition, particles adds visual flair (magic_dust for mystical places, sparks for forges/tech, embers for fire/destruction, arcane for magical events), mood sets the overall feel, and transition is the visual transition into this scene (use "fade" for the opening scene).

For musicPrompt: describe the ideal instrumental background music — mention instruments, tempo, and emotional tone. Keep under 200 characters. Example: "slow strings with harp arpeggios, mysterious and enchanting". Use null only if the scene should be silent.

For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names. Every dialogue segment MUST have a "gender" field.${langReminder}`;
  }

  const needsReminder = needsSystemEnabled ? buildUnmetNeedsBlock(characterNeeds) : '';

  return `${needsReminder}The player chose: "${playerAction}"

Resolve this action and advance the story. Determine outcomes, describe the consequences, and set up the next decision point.

DICE ROLL FREQUENCY: The dice roll frequency is set to ~${dmSettings?.testsFrequency ?? 50}%. Roll dice for approximately that proportion of actions. At high frequency (80%+), even trivial actions like stepping over a threshold or opening a door require a roll — use high target numbers (70-90+) so success is very likely but never guaranteed. Consider the character's species for modifiers: Dwarfs have lower Agility (movement/balance checks harder), Elves have lower Toughness, etc. Use the WFRP d100 system: roll d100, compare to target number (characteristic + skill advances). Calculate Success Levels (SL) = (target - roll) ÷ 10 rounded toward 0. Rolls of 01-04 are CRITICAL SUCCESS (automatic success + extra benefits). Rolls of 96-00 are CRITICAL FAILURE (automatic failure + extra penalties/consequences). IMPORTANT: When the roll indicates failure (roll > target and not 01-04), the narrative MUST reflect the action failing — the character does NOT succeed.
${isCustomAction ? `
CREATIVITY BONUS: The player wrote a CUSTOM action (not one of the suggested options). Evaluate the creativity, originality, and cleverness of their action and add a bonus to the dice target number:
- +10: Mundane custom action, just a basic alternative to the suggestions
- +20: Somewhat creative, shows some thought or personality
- +30: Creative and clever, good use of environment or character abilities
- +40: Highly creative, unexpected approach that makes narrative sense
- +50: Brilliantly creative, exceptionally imaginative action that surprises even the GM
The target number should be: characteristic + skill advances + creativityBonus. Include the bonus in diceRoll as "creativityBonus": <number 10-50>. Always award at least +10 for any custom action.
` : ''}
Respond with ONLY valid JSON in this exact format:
{
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
    "transition": "dissolve | fade | arcane_wipe"
  },
  "suggestedActions": ["Action option 1", "Action option 2", "Action option 3", "Action option 4"],
  "stateChanges": {
    "woundsChange": 0,
    "xp": 0,
    "fortuneChange": 0,
    "resolveChange": 0,
    "newItems": [],
    "removeItems": [],
    "newQuests": [],
    "completedQuests": [],
    "worldFacts": [],
    "journalEntries": ["Concise 1-2 sentence summary of a key event from this scene"],
    "statuses": null,
    "skillAdvances": null,
    "newTalents": null,
    "careerAdvance": null,
    "npcs": [{"action": "introduce|update", "name": "NPC Name", "gender": "male|female", "role": "their role", "personality": "traits", "attitude": "friendly|neutral|hostile|fearful|etc", "location": "where they are", "notes": "optional notes"}],
    "mapChanges": [{"location": "Location Name", "modification": "what changed", "type": "trap|obstacle|discovery|destruction|other"}],
    "timeAdvance": {"hoursElapsed": 0.5, "newDay": false},
    "activeEffects": [{"action": "add|remove|trigger", "id": "unique_id", "type": "trap|spell|environmental", "location": "where", "description": "what it does", "placedBy": "who placed it"}],
    "moneyChange": {"gold": 0, "silver": 0, "copper": 0},
    "currentLocation": "Current Location Name"${needsSystemEnabled ? ',\n    "needsChanges": null' : ''}
  },
  "diceRoll": null
}

For atmosphere: choose weather, particles, mood, and transition that best match the current scene's environment. Pick ONE value for each field. weather = environmental condition (clear/rain/snow/storm/fog/fire). particles = visual flair (magic_dust/sparks/embers/arcane/none). mood = overall feel (mystical/dark/peaceful/tense/chaotic). transition = how the scene visually transitions in (dissolve/fade/arcane_wipe — use arcane_wipe for magical events, dissolve for abrupt changes, fade for calm transitions).

For diceRoll: use based on the configured dice frequency (~${dmSettings?.testsFrequency ?? 50}%). At 80%+, nearly every action needs a roll. Format: {"type": "d100", "roll": <number 1-100>, "target": <number>, "sl": <number>, "skill": "<skill name>", "success": <boolean>, "criticalSuccess": <boolean>, "criticalFailure": <boolean>${isCustomAction ? ', "creativityBonus": <number 10-50>' : ''}}. Set criticalSuccess=true when roll is 01-04 (automatic success with bonus effects). Set criticalFailure=true when roll is 96-100 (automatic failure with extra penalties). When success is false, the narrative MUST describe the action failing — never let a failed roll produce a successful outcome. Use null ONLY when dice frequency is low and the action truly doesn't warrant a test.

For stateChanges: woundsChange is a DELTA (negative = damage, positive = healing). xp is a DELTA (typically +20 to +50 per scene). fortuneChange/resolveChange are DELTAS (usually negative when spent). newItems should be objects with {id, name, type, description, rarity}. newQuests should be objects with {id, name, description}. worldFacts are strings of new information. journalEntries are 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant decisions, discoveries, or combat outcomes. Each entry: 1-2 sentences, self-contained. Do NOT log trivial details. Set any field to null/empty to skip it.
ITEM VALIDATION: The character can ONLY use items currently listed in their Inventory above. If the player's action references using an item they do not possess, the action MUST fail or the narrative should reflect they don't have it. Only include items in removeItems that exist in the character's inventory.
For stateChanges.moneyChange: an object with {gold, silver, copper} DELTAS. Use negative values when the character spends money (buying, paying, bribing) and positive values when receiving money (loot, rewards, selling). The system auto-normalizes denominations. ALWAYS check the character's Money before allowing a purchase — if they cannot afford it, the purchase must fail narratively. Use null if no money changed.
For stateChanges.skillAdvances: an object mapping skill names to advance amounts, e.g. {"Melee (Basic)": 1, "Dodge": 1}. Use only when the GM narratively teaches or the character practices a skill. Use null if no skills improved.
For stateChanges.newTalents: an array of talent names gained, e.g. ["Strike Mighty Blow"]. Use null if none.
For stateChanges.careerAdvance: use when the character advances career tier or changes career. Object with fields: {tier, tierName, name, class, status}. Use null if no career change.

For stateChanges.npcs: use "introduce" for new NPCs and "update" for existing ones. Always include name and gender. Provide personality, role, attitude toward player, and current location.
For stateChanges.mapChanges: log environmental changes to locations (traps set, doors opened, items left, destruction). type is one of: trap, obstacle, discovery, destruction, other.
For stateChanges.timeAdvance: ALWAYS include "hoursElapsed" (decimal). Each action typically takes 15 min to 1 hour of in-game time: quick dialogue/interaction=0.25, short action/combat=0.5, exploration/travel=0.75-1. Only resting (2-4h) and sleeping (6-8h) should exceed 1 hour. Set newDay=true when a new day begins.
For stateChanges.activeEffects: use "add" to place new effects (traps, spells, environmental), "remove" to clear them, "trigger" to mark as triggered. Each needs a unique id.
For stateChanges.currentLocation: update whenever the player moves to a new location.
${needsSystemEnabled ? 'For stateChanges.needsChanges: use when the character satisfies a biological need (eating, drinking, using a toilet, bathing, resting). Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger and +40 thirst. Typical values: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet +80-100 bladder, bath +60-80 hygiene, full night sleep +70-90 rest, nap +20-30 rest. Use null if no needs changed.\n' : ''}
For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized or shortened). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names across scenes. Every dialogue segment MUST have a "gender" field ("male" or "female").${langReminder}`;
}

export function buildCampaignCreationPrompt(settings, language = 'en') {
  const langInstruction = language === 'pl'
    ? '\n\nIMPORTANT: Write ALL text content (name, worldDescription, hook, character backstory, narrative, quest names, quest descriptions, world facts, suggested actions) in Polish.'
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
${langInstruction}

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
      "transition": "fade"
    },
    "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
    "journalEntries": ["Concise 1-2 sentence summary of a key event from the opening scene"]
  },
  "initialQuest": {
    "name": "Main quest name",
    "description": "Brief quest description"
  },
  "initialWorldFacts": ["Fact 1 about the world", "Fact 2", "Fact 3"]
}

IMPORTANT for characterSuggestion:
- Generate realistic WFRP characteristics: each is 2d10 + species base (20 for Human). Values typically range 21-40, center around 30.
- Skills object maps skill name to number of advances (typically 3-10 for starting character). Include 6-10 career-appropriate skills.
- Include 1-3 starting talents from the career's tier 1 talent list.
- Set fate/resilience based on species (Human: fate 2, resilience 1; Dwarf: fate 0, resilience 2; Halfling: fate 0, resilience 2; Elves: fate 0, resilience 0).
- Include 2-5 starting inventory items appropriate for the career (weapons, tools, trappings).
- Set starting money based on career status tier: Brass careers get {gold:0, silver:0, copper:10-20}, Silver careers get {gold:0, silver:3-8, copper:0}, Gold careers get {gold:2-8, silver:0, copper:0}.`;
}

export function buildImagePrompt(narrative, genre, tone, imagePrompt, provider = 'dalle') {
  const isSD = provider === 'stability';

  const styleMap = isSD
    ? {
        Fantasy: 'photorealistic fantasy scene, cinematic photograph, realistic lighting, RAW photo, 8k uhd, dslr',
        'Sci-Fi': 'photorealistic sci-fi scene, cinematic photograph, futuristic, realistic neon lighting, RAW photo, 8k uhd',
        Horror: 'photorealistic horror scene, cinematic photograph, eerie realistic lighting, RAW photo, 8k uhd',
      }
    : {
        Fantasy: 'dark fantasy oil painting, medieval, magical atmosphere',
        'Sci-Fi': 'cinematic sci-fi concept art, futuristic, neon-lit',
        Horror: 'dark horror illustration, atmospheric, eerie lighting',
      };

  const toneMap = isSD
    ? {
        Dark: 'moody, desaturated colors, deep shadows, film grain',
        Epic: 'grand scale, dramatic golden-hour lighting, heroic composition, cinematic depth of field',
        Humorous: 'bright natural lighting, vivid colors, warm tones',
      }
    : {
        Dark: 'moody, desaturated, ominous shadows',
        Epic: 'grand scale, dramatic lighting, heroic composition',
        Humorous: 'whimsical, colorful, lighthearted',
      };

  const style = styleMap[genre] || styleMap.Fantasy;
  const mood = toneMap[tone] || toneMap.Epic;

  const sceneDesc = imagePrompt || narrative.substring(0, 300);

  return `${style}, ${mood}. Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting.`;
}

export function buildRecapPrompt(language = 'en') {
  const langNote = language === 'pl' ? ' Write the recap in Polish.' : '';
  return `Based on the scene history in the system context, generate a brief "Previously on..." recap summarizing the key events, decisions, and their consequences. Write it in a dramatic, narrative style (2-3 sentences).${langNote} Respond with ONLY valid JSON: {"recap": "The recap text..."}`;
}
