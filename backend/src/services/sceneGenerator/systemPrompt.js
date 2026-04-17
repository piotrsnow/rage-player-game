import { BESTIARY_RACES } from '../../data/equipment/index.js';
import { SKILL_BY_NAME } from '../diceResolver.js';
import {
  difficultyLabel,
  narrativeLabel,
  responseLengthLabel,
  sliderLabel,
  formatMoney,
} from './labels.js';

const BESTIARY_RACES_STR = BESTIARY_RACES.join(', ');
const ATTR_SHORT = { sila: 'SIL', inteligencja: 'INT', charyzma: 'CHA', zrecznosc: 'ZRC', wytrzymalosc: 'WYT', szczescie: 'SZC' };

/**
 * Build a lean system prompt from the campaign's core state and recent scenes.
 * Returns { staticPrefix, dynamicSuffix, combined } so callers can either emit
 * a flat string (OpenAI) or an Anthropic cache-enabled system blocks array.
 */
export function buildLeanSystemPrompt(coreState, recentScenes, language = 'pl', {
  dmSettings = {},
  needsSystemEnabled = false,
  characterNeeds = null,
  sceneCount = 0,
  intentResult = {},
} = {}) {
  const cs = coreState;
  const intent = intentResult._intent || 'freeform';
  const campaign = cs.campaign || {};
  const character = cs.character || {};
  const world = cs.world || {};
  const quests = cs.quests || {};

  // ═══════════════════════════════════════════════════════════════
  // STATIC SECTIONS — identical across scenes within a session.
  // Placed FIRST so both Anthropic (explicit cache_control) and
  // OpenAI (automatic prefix caching) can cache this prefix.
  // ═══════════════════════════════════════════════════════════════
  const staticSections = [];

  // ── CORE GAME RULES (compressed) ──
  staticSections.push(
    `CORE RULES:
- Dice/skill checks: may be engine-resolved (see user prompt) or self-resolved using pre-rolled d50 values.
- If engine-resolved: narrate the provided result. DO NOT recalculate.
- If pre-rolled d50 values are available and action has genuine risk: pick the correct skill from PC Skills below (format: skill:level→ATTR:value). Calculate total = base + attribute_value + skill_level. Compare vs difficulty threshold. If luckySuccess → auto-success. Unlisted skills = level 0; use Attributes line for base value.
- Include results in diceRolls array (max 3) — format in RESPONSE section.
- Margin scaling: lucky success=fortunate twist, margin 15+=decisive success, margin 0-14=success (low margin may add complication), margin -1 to -14=failure with opportunity, margin≤-15=hard fail+consequence.
- Consequences: risky actions generate reputation/disposition/resource/wound/rumor consequences. Criminal acts accumulate heat (guards, bounties, higher prices).
- NPC disposition: engine calculates bonuses. Reflect attitude in narration (≥15=friendly, ≤-15=hostile). Trust builds slow, breaks fast.
- Currency: 1GC=10SS=100CP. stateChanges.moneyChange for purchase costs (negative deltas). For income/loot use stateChanges.rewards with type:'money'. Engine validates affordability.
- Character XP is NOT awarded per scene. It cascades automatically from skill level-ups and from completed quest rewards (quest.reward.xp). Do not emit stateChanges.xp.
- The world is grim and perilous. Death is real. Consequences are lasting.
- creativityBonus (TOP-LEVEL, int 0-10): ONLY for player_input_kind=custom (suggested/auto=ALWAYS 0).
  0=none | 1-3=detail/environment use | 4-6=clever tactic | 7-9=brilliant combo | 10=genius.
  Quality > length. Adds to skill check total.`,
  );

  // ── SCENE PACING ──
  staticSections.push(
    `SCENE PACING — return "scenePacing" in every response. Match prose to type:
combat: staccato, 1-2 para | chase: breathless, fragments | stealth: sparse, tense
exploration: atmospheric, 2-3 para | dialogue: minimal narration, NPCs drive scene
travel_montage: 2-3 sentences, skip to arrival | rest: slow, 1-2 para
celebration: lively, sensory | dramatic: theatrical, tension | dream: surreal, symbolic
Max 2 consecutive exploration/travel/rest without a complication. Travel without interaction → travel_montage.`,
  );

  // ── NARRATIVE RULES ──
  staticSections.push(
    `NARRATIVE RULES:
- Vary density by scene type. Action=short/punchy. Exploration=concrete senses. Dialogue=character voice.
- Avoid: stacked adjectives, abstract feelings, uniform NPC voice, tax-collector clichés.
- Each NPC has a unique speech pattern (phrases, vocabulary, rhythm). Identify speaker from dialogue alone.
- NPCs present MUST speak in direct dialogue segments, never just described indirectly.
- Humor never deflates real stakes. Even at high humor: failures hurt mechanically.
- Keep narration ~25% shorter than default. Cut filler, repeated atmosphere, redundant transitions.`,
  );

  // ── DIALOGUE FORMAT ──
  staticSections.push(
    `DIALOGUE FORMAT:
dialogueSegments: [{type:"narration",text:""}, {type:"dialogue",character:"NPC Name",gender:"male"|"female",text:""}]
dialogueSegments is the SOLE source of scene prose. Narration segments hold all descriptive text; dialogue segments hold spoken lines. Never embed quoted speech in narration — always split into dialogue segments. Every dialogue segment needs "gender" field. Use consistent NPC names.`,
  );

  // ── SUGGESTED ACTIONS ──
  staticSections.push(
    `SUGGESTED ACTIONS:
Return exactly 3 suggestedActions in PC voice (1st person, e.g. ${language === 'pl' ? '"Oglądam drzwi"' : '"I examine the door"'}). At least 2 grounded + up to 1 chaotic/humorous. Exactly 1 must be direct speech (${language === 'pl' ? '"Mówię: \\"...\\""' : '"I say: \\"...\\"."'}). Reference concrete scene NPCs/objects/locations by name. Never use vague filler. Never repeat recent actions.${language === 'pl' ? ' CRITICAL: All suggestedActions must be in Polish. NEVER use English "I say:", "I ask", "I tell". Use "Mówię:", "Pytam:", "Krzyczę:". Do NOT prefix with "I".' : ''}`,
  );

  // ── STATE CHANGES RULES ──
  staticSections.push(
    `MANDATORY stateChanges RULES:
- timeAdvance: ALWAYS include {hoursElapsed: decimal}. Quick=0.25, action/combat=0.5, exploration=0.75-1, rest=2-4, sleep=6-8.
- questUpdates: after writing dialogueSegments, cross-check ALL active quest objectives. Mark completed ones: [{questId, objectiveId, completed:true}].
- Quest completion: ONLY add to completedQuests when ALL objectives done AND player talked to turn-in NPC in this scene. Never auto-complete.
- rewards: for standard loot/drops/found items/money. Array of [{type, rarity?, category?, quantity?, context?}]. type: 'material'|'weapon'|'armour'|'shield'|'gear'|'medical'|'money'|'potion'. rarity: 'common'|'uncommon'|'rare'. category: materials only ('metal'|'wood'|'fabric'|'herb'|'liquid'|'misc'). quantity: 'one'|'few'|'some'|'many'. context: 'loot'|'quest_reward'|'found'|'gift'. Do NOT specify item names — just type and tier.
- newItems: ONLY unique quest/story items (MacGuffins, keys, letters, artifacts). {id, name, type, description}. Standard loot → use rewards.
- removeItems: only items in character's inventory.
- moneyChange: {gold,silver,copper} NEGATIVE deltas for purchases only. For income/loot use rewards with type:'money'.
- npcs: {action:"introduce"|"update", name, gender, role, personality, attitude, location, dispositionChange, relationships:[{npcName,type}]}. dispositionChange scales with margin: lucky/great success +3-5, success +1-2, failure -1-2, hard failure -3-5.
- currentLocation: update when player moves.
- skillsUsed: ["SkillName"] — skills the PC used in this action. Max 3.
- actionDifficulty: "easy"|"medium"|"hard"|"veryHard"|"extreme".`,
  );

  // ── ACTION FEASIBILITY ──
  staticSections.push(
    `ACTION RULES:
- Impossible (target not present): narrate failure. Trivial (unlocked door, walking): auto-success.
- Routine (eating, resting, looking): auto-success.
- Uncertain: engine resolves checks. Narrate the result from user prompt.
- Item validation: character can ONLY use items in their Inventory. Fail if item not possessed.
- Item/money acquisition: if dialogueSegments say character gains anything, stateChanges MUST match. No exceptions.`,
  );

  // ── RESPONSE FORMAT ──
  // FIELD ORDER MATTERS for streaming UX:
  // 1. diceRolls first — frontend detects rolls early and starts dice animation
  //    in parallel with the rest of the response.
  // 2. dialogueSegments next — scene prose starts streaming immediately, so the
  //    typewriter / TTS can begin before the model finishes the rest of the JSON.
  // 3. stateChanges LAST — the backend applies state changes only after the
  //    `complete` event (parseAIResponse → resolveAndApplyRewards →
  //    applyCharacterStateChanges → Prisma write), so nothing downstream benefits
  //    from having them mid-stream. Emitting them last also improves quality:
  //    the model rolls mechanics AFTER it has written the prose, so rewards /
  //    journal / questUpdates stay consistent with what was actually narrated.
  staticSections.push(
    `RESPONSE: Return ONLY valid JSON in this field order:
{
  "creativityBonus": 0,
  "diceRolls": [{"skill":"","difficulty":"","success":true}],
  "npcsIntroduced": [{"name":"","gender":"male|female|unknown","speechStyle":"1-sentence description of how this NPC talks"}],
  "dialogueSegments": [{"type":"narration|dialogue","text":"","character":"","gender":"male|female"}],
  "scenePacing": "exploration|combat|chase|stealth|dialogue|travel_montage|celebration|rest|dramatic|dream|cutscene",
  "suggestedActions": ["exactly 3 actions"],
  "atmosphere": {"weather":"clear|rain|snow|storm|fog|fire","particles":"none|magic_dust|sparks|embers|arcane","mood":"peaceful|tense|dark|mystical|chaotic","lighting":"natural|night|dawn|bright|rays|candlelight|moonlight","transition":"dissolve|fade|arcane_wipe"},
  "imagePrompt": "short ENGLISH scene description for image gen (max 200 chars)",
  "soundEffect": "short English sound description or null",
  "musicPrompt": "instruments, tempo, mood (max 200 chars) or null",
  "questOffers": [],
  "cutscene": null,
  "dilemma": null,
  "stateChanges": {timeAdvance:{hoursElapsed:0.5}, npcs:[], currentLocation:"", ...}
}
diceRolls is TOP-LEVEL — NOT inside stateChanges.
npcsIntroduced: one entry per NEW speaking NPC (not already in NPCs section). Omit or [] if none.
stateChanges: cross-check rewards/quests against narrated prose.
${language === 'pl' ? 'Write ALL dialogueSegments text, suggestedActions, quest text in Polish. Only imagePrompt/soundEffect/musicPrompt in English.' : 'Write all text in English.'}`,
  );

  // ── WORLD SETTING (campaign-constant, safe to cache) ──
  const worldDesc = campaign.worldDescription || 'A dark fantasy world.';
  staticSections.push(`World: ${worldDesc}${campaign.hook ? `\nHook: ${campaign.hook}` : ''}`);

  // ═══════════════════════════════════════════════════════════════
  // DYNAMIC SECTIONS — change per scene (character, world, quests).
  // Placed AFTER static prefix so caching works.
  // ═══════════════════════════════════════════════════════════════
  const dynamicSections = [];

  // ── CONDITIONAL RULES (intent-driven) ──
  const COMBAT_INTENTS = new Set(['combat', 'stealth', 'freeform', 'idle', 'first_scene']);
  const LORE_INTENTS = new Set(['talk', 'search', 'persuade', 'freeform', 'first_scene']);
  const conditionalRules = [];

  if (COMBAT_INTENTS.has(intent)) {
    conditionalRules.push(
      `COMBAT stateChanges:\n` +
      `- combatUpdate: {active:true, enemyHints:{location,budget,maxDifficulty,count,race}, reason}. ` +
      `budget: 1-2 trivial, 3-7 medium, 8-12 hard, 13-20 deadly. race: optional (${BESTIARY_RACES_STR}). ` +
      `Fallback: {active:true, enemies:[{name}], reason}.\n` +
      `- pendingThreat: {race,budget,maxDifficulty,count,description} for tension without combat.\n` +
      `- woundsChange: delta (negative=damage, positive=healing).`,
    );
  }

  if (LORE_INTENTS.has(intent)) {
    conditionalRules.push(
      `CODEX RULES:\n` +
      `- Each NPC reveals ONE fragment per interaction. Drip-feed, never dump.\n` +
      `- Aspect by NPC role: scholars→history/technical, peasants→rumor, soldiers→location/weakness, merchants→description, nobles→political.\n` +
      `- DO NOT repeat already-discovered aspects — reveal NEW only. Max 10 fragments/entry.`,
    );
  }

  const loc = (world.currentLocation || '').toLowerCase();
  const magicalCtx = /jaskini|dungeon|ruin|wież|tower|crypt|temple|świątyni|portal|magiczn|arcane|nekromant|podziemn/.test(loc);
  if (magicalCtx) {
    conditionalRules.push(
      `MANA CRYSTALS: rare consumable → +1 max mana OR +1 attribute (cap 25). ` +
      `newItems type:"manaCrystal". Drop rarely (~1/20 rare loot) in magical/dungeon contexts only. ` +
      `Attributes grow ONLY via crystals.`,
    );
  }

  if (intent === 'talk' || intent === 'first_scene') {
    conditionalRules.push(
      `canTrain: in npcs stateChange, 1-3 skill names NPC can teach. ` +
      `Only experienced, friendly NPCs. Not merchants/peasants/hostile.`,
    );
  }

  const mainQuest = (quests.active || []).find(q => q.type === 'main');
  const allMainDone = mainQuest?.objectives?.length > 0 && mainQuest.objectives.every(o => o.completed);
  if (allMainDone) {
    conditionalRules.push(
      `MAIN QUEST COMPLETED. Focus on: side quests, character growth, loose ends, exploration. ` +
      `No major plot progression. The world reacts to the hero's success.`,
    );
  }

  if (conditionalRules.length > 0) {
    dynamicSections.push(`Conditional rules:\n${conditionalRules.join('\n')}`);
  }

  // ── CAMPAIGN & DM SETTINGS ──
  const poeticism = sliderLabel(dmSettings.narratorPoeticism ?? 50, ['dry', 'moderate', 'poetic', 'lyrical']);
  const grittiness = sliderLabel(dmSettings.narratorGrittiness ?? 30, ['lighthearted', 'grounded', 'gritty', 'brutal']);
  const detail = sliderLabel(dmSettings.narratorDetail ?? 50, ['minimal', 'balanced', 'rich', 'lavish']);
  const humor = sliderLabel(dmSettings.narratorHumor ?? 20, ['serious', 'dry wit', 'frequent humor', 'comedic']);
  const drama = sliderLabel(dmSettings.narratorDrama ?? 50, ['understated', 'measured', 'heightened', 'theatrical']);

  dynamicSections.push(
    `You are the Game Master for "${campaign.name || 'Unnamed'}", an RPGon custom RPG.
System: d50 + attribute (1-25) + skill (0-25) + momentum (±10) vs difficulty threshold (20/35/50/65/80). Szczescie gives X% auto-success. Mana for spells (1-5 cost). 9 spell trees with progression.
Genre: ${campaign.genre || 'Fantasy'} | Tone: ${campaign.tone || 'Dark'} | Style: ${campaign.style || 'Hybrid'}
Difficulty: ${difficultyLabel(dmSettings.difficulty ?? 50)} | Narrative chaos: ${narrativeLabel(dmSettings.narrativeStyle ?? 50)}
Response length: ${responseLengthLabel(dmSettings.responseLength ?? 50)}

NARRATOR VOICE — applies ONLY to dialogueSegments where type="narration":
- poeticism=${poeticism}, grittiness=${grittiness}, detail=${detail}, humor=${humor}, drama=${drama}
${dmSettings.narratorCustomInstructions ? `- Extra narrator instructions: ${dmSettings.narratorCustomInstructions}` : ''}
These parameters shape the narrator's prose style. They MUST NOT affect how NPCs speak.

NPC DIALOGUE STYLE — applies ONLY to dialogueSegments where type="dialogue":
- Each NPC's speech derives from their own personality and notes fields below — NOT from narrator sliders.
- Overall flavor follows the campaign tone "${campaign.tone || 'Dark'}" (Dark=grim/terse/weighted, Epic=grand/formal/heroic, Humorous=witty/playful/irreverent).
- A peasant does not sound like a scholar. Match vocabulary and register to role/personality/notes.
- Narrator poeticism/drama/humor DO NOT apply here — NPCs have their own voices.`,
  );

  // ── CHARACTER STATE ──
  const charLines = [`PC: ${character.name || 'Unknown'} (${character.species || 'Human'})`];
  const a = character.attributes || {};
  const mana = character.mana || { current: 0, max: 0 };
  charLines.push(`Wounds: ${character.wounds ?? 0}/${character.maxWounds ?? 0} | Mana: ${mana.current}/${mana.max}`);
  charLines.push(`Level: ${character.characterLevel || 1}`);
  if (character.skills && Object.keys(character.skills).length > 0) {
    const skillEntries = Object.entries(character.skills)
      .filter(([, v]) => (typeof v === 'object' ? v.level : v) > 0)
      .map(([name, v]) => {
        const level = typeof v === 'object' ? v.level : v;
        const skill = SKILL_BY_NAME[name];
        const attrKey = skill?.attribute;
        const attrVal = attrKey ? (a[attrKey] || 0) : '?';
        const short = ATTR_SHORT[attrKey] || '?';
        return `${name}:${level}→${short}:${attrVal}`;
      });
    if (skillEntries.length) charLines.push(`Skills (skill:level→ATTR:value): ${skillEntries.join(', ')}`);
  }
  charLines.push(`Attributes: SIL:${a.sila||0} INT:${a.inteligencja||0} CHA:${a.charyzma||0} ZRC:${a.zrecznosc||0} WYT:${a.wytrzymalosc||0} SZC:${a.szczescie||0}`);
  if (character.spells?.known?.length) {
    charLines.push(`Known spells: ${character.spells.known.join(', ')}`);
  }
  if (character.inventory?.length) {
    charLines.push(`Inventory: ${character.inventory.map((i) => {
      if (typeof i === 'string') return i;
      const base = `${i.name} (${i.type})`;
      return i.description ? `${base} — ${i.description}` : base;
    }).join(', ')}`);
  }
  charLines.push(`Money: ${formatMoney(character.money)}`);
  if (character.statuses?.length) charLines.push(`Statuses: ${character.statuses.join(', ')}`);
  dynamicSections.push(charLines.join('\n'));

  // ── WORLD STATE ──
  const worldLines = [];
  if (world.currentLocation) worldLines.push(`Location: ${world.currentLocation}`);
  if (world.timeState) {
    const ts = world.timeState;
    const h = Math.floor(ts.hour ?? 6);
    const m = Math.round(((ts.hour ?? 6) - h) * 60);
    worldLines.push(`Time: Day ${ts.day || 1}, ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} (${ts.timeOfDay || 'morning'}), Season: ${ts.season || 'unknown'}`);
  }
  if (world.factions && typeof world.factions === 'object') {
    const factionEntries = Object.entries(world.factions);
    if (factionEntries.length > 0) {
      worldLines.push(`Factions: ${factionEntries.map(([id, rep]) => `${id}(${rep})`).join(', ')}`);
    }
  }
  const npcs = world.npcs || [];
  const currentLoc = world.currentLocation || '';
  const npcsHere = npcs.filter(n => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  if (npcsHere.length > 0) {
    worldLines.push(`NPCs here: ${npcsHere.map(n => `${n.name} (${n.role || '?'}, ${n.attitude || 'neutral'}, dsp:${n.disposition || 0})`).join(', ')}`);
  }
  if (worldLines.length) dynamicSections.push(worldLines.join('\n'));

  // ── KNOWN NPC SUMMARY (top NPCs by disposition magnitude) ──
  if (npcs.length > 0) {
    const knownNpcs = npcs
      .filter(n => n.alive !== false)
      .sort((a, b) => Math.abs(b.disposition || 0) - Math.abs(a.disposition || 0))
      .slice(0, 8);
    if (knownNpcs.length > 0) {
      const npcLines = ['Key NPCs (disposition):'];
      for (const n of knownNpcs) {
        npcLines.push(`- ${n.name} (${n.attitude || 'neutral'}, dsp:${n.disposition || 0}) — ${n.role || '?'}${n.lastLocation ? ', ' + n.lastLocation : ''}`);
      }
      dynamicSections.push(npcLines.join('\n'));
    }
  }

  // ── KEY PLOT FACTS ──
  const keyPlotFacts = world.keyPlotFacts || [];
  if (keyPlotFacts.length > 0) {
    dynamicSections.push(`Key plot facts:\n${keyPlotFacts.map(f => `- ${f}`).join('\n')}`);
  }

  // ── CODEX SUMMARY (already discovered by player) ──
  const codexSummary = world.codexSummary || [];
  if (codexSummary.length > 0) {
    const codexLines = [`ALREADY DISCOVERED BY PLAYER (DO NOT REPEAT — reveal NEW aspects only):`];
    codexLines.push(`${codexSummary.length} entries total.`);
    for (const entry of codexSummary.slice(0, 10)) {
      let line = `- ${entry.name} [${entry.category}]: known = ${entry.knownAspects.join(', ') || 'none'}`;
      if (entry.canReveal.length > 0) {
        line += ` → can still reveal: ${entry.canReveal.join(', ')}`;
      } else {
        line += ' → fully known';
      }
      codexLines.push(line);
    }
    dynamicSections.push(codexLines.join('\n'));
  }

  // ── NEEDS SYSTEM (crisis only — restoration handled by nano post-scene) ──
  if (needsSystemEnabled && characterNeeds) {
    const needNames = ['hunger', 'thirst', 'bladder', 'hygiene', 'rest'];
    const critNeeds = needNames.filter(k => (characterNeeds[k] ?? 100) < 10);
    if (critNeeds.length > 0) {
      const critLines = critNeeds.map(k => `${k}: ${characterNeeds[k] ?? 0}/100 CRITICAL`);
      dynamicSections.push(`NEEDS CRISIS: ${critLines.join(', ')}
Narrate crisis effects (weakness, funny walk, stench, drowsiness). Apply -10 to related tests. At least 1 suggestedAction must address the most urgent need.`);
    }
  }

  // ── ACTIVE QUESTS ──
  if (quests.active?.length) {
    const questLines = ['Active Quests:'];
    for (const q of quests.active.slice(0, 5)) {
      let line = `- ${q.name} [${q.type || 'side'}]: ${q.description || ''}`;
      if (q.completionCondition) line += ` | Goal: ${q.completionCondition}`;
      if (q.questGiverId) line += ` | Giver: ${q.questGiverId}`;
      const turnIn = q.turnInNpcId || q.questGiverId;
      if (turnIn && turnIn !== q.questGiverId) line += ` | Turn in: ${turnIn}`;
      if (q.objectives?.length) {
        const done = q.objectives.filter(o => o.completed);
        const remaining = q.objectives.filter(o => !o.completed);
        if (done.length > 0 && remaining.length > 0) {
          line += `\n  (${done.length}/${q.objectives.length} completed)`;
        }
        for (const obj of remaining) {
          line += `\n  [ ] ${obj.description}`;
        }
        if (remaining.length === 0) line += '\n  COMPLETED';
      }
      questLines.push(line);
    }
    dynamicSections.push(questLines.join('\n'));
  }

  // ── RECENT CONTEXT ──
  // Two layers: earlier scenes live as compressed gameStateSummary facts (nano
  // extracts plot-relevant items with a 15-fact cap); the immediate previous
  // scene is attached in full so the model has direct tonal/dialog continuity
  // with what just happened. Facts from the last scene are filtered out — the
  // full narrative already carries that info, no need to duplicate as compression.
  // No truncation on the last scene; ~500-1500 chars typical, within budget.
  const lastScene = recentScenes.length > 0 ? recentScenes[recentScenes.length - 1] : null;
  const lastSceneIndex = lastScene?.sceneIndex ?? null;
  const gameStateSummary = cs.gameStateSummary;
  if (gameStateSummary?.length > 0) {
    // Back-compat: legacy string facts have no sceneIndex metadata — always
    // include (can't filter). Objects with matching sceneIndex are dropped.
    const factText = (item) => (typeof item === 'string' ? item : item?.fact || '');
    const factSceneIdx = (item) => (typeof item === 'string' ? null : item?.sceneIndex ?? null);
    const filtered = gameStateSummary.filter((item) => {
      const idx = factSceneIdx(item);
      return idx === null || lastSceneIndex === null || idx !== lastSceneIndex;
    });
    if (filtered.length > 0) {
      dynamicSections.push(`Recent Story Facts:\n${filtered.map((f, i) => `${i + 1}. ${factText(f)}`).join('\n')}`);
    }
  }
  if (lastScene) {
    const action = lastScene.chosenAction ? `Player: ${lastScene.chosenAction}\n` : '';
    dynamicSections.push(`Last Scene:\n[Scene ${lastScene.sceneIndex}] ${action}${lastScene.narrative || ''}`);
  }

  const staticPrefix = staticSections.join('\n\n');
  const dynamicSuffix = dynamicSections.join('\n\n');
  return { staticPrefix, dynamicSuffix, combined: staticPrefix + '\n\n' + dynamicSuffix };
}

/**
 * Convert split prompt parts into Anthropic system blocks with cache_control.
 * Static prefix gets cached (ephemeral, 5-min TTL); dynamic suffix is fresh per request.
 */
export function buildAnthropicSystemBlocks(staticPrefix, dynamicSuffix) {
  const blocks = [
    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
  ];
  if (dynamicSuffix) {
    blocks.push({ type: 'text', text: dynamicSuffix });
  }
  return blocks;
}
