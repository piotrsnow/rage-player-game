import { prisma } from '../lib/prisma.js';
import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError, toClientAiError, AIServiceError } from './aiErrors.js';
import {
  CONTEXT_TOOLS_OPENAI,
  CONTEXT_TOOLS_ANTHROPIC,
  executeToolCall,
} from './aiContextTools.js';
import {
  embedText,
  buildSceneEmbeddingText,
  buildKnowledgeEmbeddingText,
  buildNPCEmbeddingText,
  buildCodexEmbeddingText,
} from './embeddingService.js';
import { writeEmbedding } from './vectorSearchService.js';

const MAX_TOOL_ROUNDS = 3;

// --- DM Settings label helpers ---

function difficultyLabel(val) {
  return val < 25 ? 'Easy' : val < 50 ? 'Normal' : val < 75 ? 'Hard' : 'Expert';
}

function narrativeLabel(val) {
  return val < 25 ? 'Predictable' : val < 50 ? 'Balanced' : val < 75 ? 'Chaotic' : 'Wild';
}

function responseLengthLabel(val) {
  return val < 33 ? 'short (2-3 sentences)' : val < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)';
}

function sliderLabel(val, labels) {
  return val < 25 ? labels[0] : val < 50 ? labels[1] : val < 75 ? labels[2] : labels[3];
}

function formatMoney(money) {
  if (!money) return '0 CP';
  const parts = [];
  if (money.gold) parts.push(`${money.gold} GC`);
  if (money.silver) parts.push(`${money.silver} SS`);
  if (money.copper) parts.push(`${money.copper} CP`);
  return parts.join(' ') || '0 CP';
}

/**
 * Build a lean system prompt from the campaign's core state and recent scenes.
 * Includes compressed game rules — AI dynamically fetches additional context via tools.
 */
function buildLeanSystemPrompt(coreState, recentScenes, language = 'pl', {
  dmSettings = {},
  needsSystemEnabled = false,
  characterNeeds = null,
  sceneCount = 0,
} = {}) {
  const cs = coreState;
  const campaign = cs.campaign || {};
  const character = cs.character || {};
  const world = cs.world || {};
  const quests = cs.quests || {};

  const sections = [];

  // ── CAMPAIGN & DM SETTINGS ──
  const poeticism = sliderLabel(dmSettings.narratorPoeticism ?? 50, ['dry', 'moderate', 'poetic', 'lyrical']);
  const grittiness = sliderLabel(dmSettings.narratorGrittiness ?? 30, ['lighthearted', 'grounded', 'gritty', 'brutal']);
  const detail = sliderLabel(dmSettings.narratorDetail ?? 50, ['minimal', 'balanced', 'rich', 'lavish']);
  const humor = sliderLabel(dmSettings.narratorHumor ?? 20, ['serious', 'dry wit', 'frequent humor', 'comedic']);
  const drama = sliderLabel(dmSettings.narratorDrama ?? 50, ['understated', 'measured', 'heightened', 'theatrical']);

  sections.push(
    `You are the Game Master for "${campaign.name || 'Unnamed'}", a WFRP 4th Edition RPG.
Genre: ${campaign.genre || 'Fantasy'} | Tone: ${campaign.tone || 'Dark'} | Style: ${campaign.style || 'Hybrid'}
Difficulty: ${difficultyLabel(dmSettings.difficulty ?? 50)} | Narrative chaos: ${narrativeLabel(dmSettings.narrativeStyle ?? 50)}
Response length: ${responseLengthLabel(dmSettings.responseLength ?? 50)}
Narrator voice: poeticism=${poeticism}, grittiness=${grittiness}, detail=${detail}, humor=${humor}, drama=${drama}
${dmSettings.narratorCustomInstructions ? `Extra narrator instructions: ${dmSettings.narratorCustomInstructions}` : ''}
World: ${campaign.worldDescription || 'A dark fantasy world.'}
${campaign.hook ? `Hook: ${campaign.hook}` : ''}`,
  );

  // ── CHARACTER STATE ──
  const charLines = [`PC: ${character.name || 'Unknown'} (${character.species || 'Human'})`];
  if (character.career) charLines.push(`Career: ${character.career.name || ''} (${character.career.tierName || ''}), Status: ${character.career.status || ''}`);
  if (character.characteristics) {
    const c = character.characteristics;
    charLines.push(`Stats: WS:${c.ws||0} BS:${c.bs||0} S:${c.s||0} T:${c.t||0} I:${c.i||0} Ag:${c.ag||0} Dex:${c.dex||0} Int:${c.int||0} WP:${c.wp||0} Fel:${c.fel||0}`);
  }
  charLines.push(`Wounds: ${character.wounds ?? 0}/${character.maxWounds ?? 0} | Fate: ${character.fate ?? 0} Fortune: ${character.fortune ?? 0} | Resilience: ${character.resilience ?? 0} Resolve: ${character.resolve ?? 0}`);
  charLines.push(`XP: ${character.xp || 0} total, ${(character.xp || 0) - (character.xpSpent || 0)} available`);
  if (character.skills && Object.keys(character.skills).length > 0) {
    charLines.push(`Skills: ${Object.entries(character.skills).map(([k, v]) => `${k}+${v}`).join(', ')}`);
  }
  if (character.talents?.length) {
    const talents = Array.isArray(character.talents)
      ? character.talents.map(t => typeof t === 'string' ? t : t.name || t).join(', ')
      : '';
    if (talents) charLines.push(`Talents: ${talents}`);
  }
  if (character.inventory?.length) {
    charLines.push(`Inventory: ${character.inventory.map((i) => typeof i === 'string' ? i : `${i.name} (${i.type})`).join(', ')}`);
  }
  charLines.push(`Money: ${formatMoney(character.money)}`);
  if (character.statuses?.length) charLines.push(`Statuses: ${character.statuses.join(', ')}`);
  if (character.criticalWounds?.length) {
    charLines.push(`Critical Wounds: ${character.criticalWounds.map(w => typeof w === 'string' ? w : w.description || w.name).join('; ')}`);
  }
  sections.push(charLines.join('\n'));

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
  // NPCs at current location (brief)
  const npcs = world.npcs || [];
  const currentLoc = world.currentLocation || '';
  const npcsHere = npcs.filter(n => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  if (npcsHere.length > 0) {
    worldLines.push(`NPCs here: ${npcsHere.map(n => `${n.name} (${n.role || '?'}, ${n.attitude || 'neutral'}, dsp:${n.disposition || 0})`).join(', ')}`);
  }
  if (worldLines.length) sections.push(worldLines.join('\n'));

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
      sections.push(npcLines.join('\n'));
    }
  }

  // ── KEY PLOT FACTS ──
  const keyPlotFacts = world.keyPlotFacts || [];
  if (keyPlotFacts.length > 0) {
    sections.push(`Key plot facts:\n${keyPlotFacts.map(f => `- ${f}`).join('\n')}`);
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
    sections.push(codexLines.join('\n'));
  }

  // ── NEEDS SYSTEM ──
  if (needsSystemEnabled && characterNeeds) {
    const needNames = ['hunger', 'thirst', 'bladder', 'hygiene', 'rest'];
    const critNeeds = needNames.filter(k => (characterNeeds[k] ?? 100) < 10);
    if (critNeeds.length > 0) {
      const critLines = critNeeds.map(k => `${k}: ${characterNeeds[k] ?? 0}/100 CRITICAL`);
      sections.push(`NEEDS CRISIS: ${critLines.join(', ')}
Narrate crisis effects (weakness, funny walk, stench, drowsiness). Apply -10 to related tests. At least 1 suggestedAction must address the most urgent need.`);
    } else {
      sections.push('Needs system active. All needs OK (>=10). Use stateChanges.needsChanges DELTAS when character eats/drinks/rests/bathes/toilets. Typical: meal +50-70 hunger, drink +40-60 thirst, sleep at inn→all 100.');
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
        const allDone = q.objectives.every(o => o.completed);
        for (const obj of q.objectives) {
          line += `\n  [${obj.completed ? 'X' : ' '}] ${obj.description}`;
        }
        if (allDone) line += '\n  ALL DONE — ready to turn in';
      }
      questLines.push(line);
    }
    sections.push(questLines.join('\n'));
  }

  // ── RECENT SCENES ──
  if (recentScenes.length > 0) {
    const sceneLines = ['Recent History:'];
    for (const scene of recentScenes) {
      const action = scene.chosenAction ? `Player: ${scene.chosenAction}\n` : '';
      const narrative = (scene.narrative || '').length > 500
        ? scene.narrative.slice(0, 500) + '...'
        : scene.narrative;
      sceneLines.push(`[Scene ${scene.sceneIndex}] ${action}${narrative}`);
    }
    sections.push(sceneLines.join('\n\n'));
  }

  // ── CORE GAME RULES (compressed) ──
  sections.push(
    `CORE RULES:
- Dice/skill checks: resolved by game engine BEFORE your response. User prompt has the result (skill, SL, success/failure). Narrate accordingly. DO NOT include "diceRoll" in response.
- SL scaling: crit success=spectacular bonus, SL+3=decisive, SL 0-2=success+complication, SL -1/-2=fail+opportunity, SL≤-3=hard fail+consequence, crit fail=catastrophic lasting consequence.
- Consequences: risky actions generate reputation/disposition/resource/wound/rumor consequences. Criminal acts accumulate heat (guards, bounties, higher prices).
- NPC disposition: engine calculates bonuses. Reflect attitude in narration (≥15=friendly, ≤-15=hostile). Trust builds slow, breaks fast.
- Currency: 1GC=10SS=100CP. stateChanges.moneyChange for deltas. Engine validates affordability. Check character Money before purchases.
- Award 20-50 XP/scene via stateChanges.xp.
- The Old World is grim and perilous. Death is real. Consequences are lasting.`,
  );

  // ── SCENE PACING ──
  sections.push(
    `SCENE PACING — return "scenePacing" in every response. Match prose to type:
combat: staccato, 1-2 para | chase: breathless, fragments | stealth: sparse, tense
exploration: atmospheric, 2-3 para | dialogue: minimal narration, NPCs drive scene
travel_montage: 2-3 sentences, skip to arrival | rest: slow, 1-2 para
celebration: lively, sensory | dramatic: theatrical, tension | dream: surreal, symbolic
Max 2 consecutive exploration/travel/rest without a complication. Travel without interaction → travel_montage.`,
  );

  // ── NARRATIVE RULES ──
  sections.push(
    `NARRATIVE RULES:
- Vary density by scene type. Action=short/punchy. Exploration=concrete senses. Dialogue=character voice.
- Avoid: stacked adjectives, abstract feelings, uniform NPC voice, tax-collector clichés.
- Each NPC has a unique speech pattern (phrases, vocabulary, rhythm). Identify speaker from dialogue alone.
- NPCs present MUST speak in direct dialogue segments, never just described indirectly.
- Humor never deflates real stakes. Even at high humor: failures hurt mechanically.
- Keep narration ~25% shorter than default. Cut filler, repeated atmosphere, redundant transitions.`,
  );

  // ── DIALOGUE FORMAT ──
  sections.push(
    `DIALOGUE FORMAT:
dialogueSegments: [{type:"narration",text:""}, {type:"dialogue",character:"NPC Name",gender:"male"|"female",text:""}]
Narration segments = VERBATIM full narrative text (not summarized). Never embed quoted speech in narration — always split into dialogue segments. Every dialogue segment needs "gender" field. Use consistent NPC names.`,
  );

  // ── SUGGESTED ACTIONS ──
  sections.push(
    `SUGGESTED ACTIONS:
Return exactly 3 suggestedActions in PC voice (1st person, e.g. "I examine the door"). At least 2 grounded + up to 1 chaotic/humorous. Exactly 1 must be direct speech ("I say: \"...\""). Reference concrete scene NPCs/objects/locations by name. Never use vague filler. Never repeat recent actions.`,
  );

  // ── STATE CHANGES RULES ──
  sections.push(
    `MANDATORY stateChanges RULES:
- timeAdvance: ALWAYS include {hoursElapsed: decimal}. Quick=0.25, action/combat=0.5, exploration=0.75-1, rest=2-4, sleep=6-8.
- questUpdates: after writing narrative, cross-check ALL active quest objectives. Mark completed ones: [{questId, objectiveId, completed:true}].
- Quest completion: ONLY add to completedQuests when ALL objectives done AND player talked to turn-in NPC in this scene. Never auto-complete.
- newItems: for ANY item acquired in narrative — never narrate pickup without {id,name,type,description,rarity} in newItems. Rarity: common/uncommon (early), rare (mid), exotic (late+consequences). For weapons/armor: name MUST match get_equipment_catalog exactly.
- removeItems: only items in character's inventory.
- moneyChange: {gold,silver,copper} deltas for purchases (negative) and income (positive). Engine validates.
- npcs: {action:"introduce"|"update", name, gender, role, personality, attitude, location, dispositionChange, factionId, relationships:[{npcName,type}]}. dispositionChange scales with SL: crit success +3-5, marginal success +1-2, marginal fail -1-2, crit fail -5-8.
- combatUpdate: {active:true, enemies:[{name, characteristics:{ws,bs,s,t,i,ag,dex,int,wp,fel}, wounds, maxWounds, skills:{}, traits:[], armour:{head,body,arms,legs}, weapons:[]}], reason}. Include ONLY when combat starts. BEFORE creating enemies: call get_bestiary to get stat templates and get_equipment_catalog for valid weapon/armor names. Weapons[] and armour{} MUST use exact names from the catalog.
- dialogueUpdate: {active:true, npcs:[{name, attitude, goal}], reason}. Include when 2+ NPC structured dialogue starts.
- codexUpdates: [{id, name, category, fragment:{content,source,aspect}, tags}] when player learns lore.
- knowledgeUpdates: {events:[{summary, importance, tags}], decisions:[{choice, consequence}]} for key story moments.
- journalEntries: 1-3 concise summaries of important events only.
- currentLocation: update when player moves.
- factionChanges: {faction_id: delta} when actions affect a faction. IDs: merchants_guild, thieves_guild, temple_sigmar, temple_morr, military, noble_houses, chaos_cults, witch_hunters, wizards_college, peasant_folk.
- worldFacts: strings of new information for world state.
- woundsChange: delta (negative=damage, positive=healing).
- fortuneChange/resolveChange: deltas when spent (usually negative).
${needsSystemEnabled ? '- needsChanges: DELTAS when character eats/drinks/rests/bathes/toilets. {hunger,thirst,bladder,hygiene,rest}.' : ''}
- campaignEnd: {status:"completed"|"failed", epilogue:"2-3 para"} — only for definitive campaign conclusions.`,
  );

  // ── ACTION FEASIBILITY ──
  sections.push(
    `ACTION RULES:
- Impossible (target not present): narrate failure. Trivial (unlocked door, walking): auto-success.
- Routine (eating, resting, looking): auto-success${needsSystemEnabled ? ', apply needsChanges' : ''}.
- Uncertain: engine resolves checks. Narrate the result from user prompt.
- Item validation: character can ONLY use items in their Inventory. Fail if item not possessed.
- Item/money acquisition: if narrative says character gains anything, stateChanges MUST match. No exceptions.`,
  );

  // ── CODEX RULES ──
  sections.push(
    `CODEX RULES:
- Each NPC reveals ONE fragment per interaction. Never dump lore — drip-feed it.
- Aspect depends on NPC role: scholars/wizards→history/technical/political, peasants→rumor (may be inaccurate), soldiers/guards→location/weakness, merchants→technical/description, nobles→political/history.
- Some knowledge (especially weaknesses) requires the RIGHT source NPC — not everyone knows everything.
- The "ALREADY DISCOVERED" section above lists what the player has previously uncovered. Do NOT repeat known aspects — reveal NEW information only.
- Call get_codex_entry() to check full fragment details before adding codexUpdates to existing entries.
- Use relatedEntries to link connected codex items (weapon→creator, place→faction, etc.).
- Max 10 fragments per entry.`,
  );

  // ── MANDATORY TOOL PROTOCOL ──
  sections.push(
    `MANDATORY TOOL PROTOCOL:
MUST call before generating narrative:
1. Combat start → get_bestiary() + get_equipment_catalog()
2. First visit at new location → get_location_history()
3. Player references past events (not in Recent History) → search_campaign_memory()
4. Player asks about lore/artifacts → get_codex_entry()
5. Adding codexUpdates to existing entry → get_codex_entry() to check existing fragments
6. Item reward or loot with weapons/armor → get_equipment_catalog()
SHOULD call when beneficial:
7. Extended NPC dialogue (3+ rounds) → get_npc_details() for personality/speech patterns
8. Quest-related scenes → get_quest_details() for full objective details
DO NOT call tools for:
- Basic narration without NPC interaction
- Actions in current location (use inline discoveries above)
- NPCs already listed in "Key NPCs" section above
IMPORTANT: Weapon/armor names in combatUpdate.enemies and stateChanges.newItems MUST exactly match names from get_equipment_catalog.`,
  );

  // ── PRE-FLIGHT CHECKLIST ──
  sections.push(
    `BEFORE GENERATING RESPONSE, check:
- Am I at a new location? → call get_location_history()
- Is an NPC speaking that I have no details for? → call get_npc_details()
- Does the player reference old events not in Recent History? → call search_campaign_memory()
- Is combat starting? → call get_bestiary() + get_equipment_catalog()
- Am I adding codexUpdates for an existing entry? → call get_codex_entry() first`,
  );

  // ── RESPONSE FORMAT ──
  sections.push(
    `RESPONSE: Return ONLY valid JSON:
{
  "narrative": "string (required)",
  "scenePacing": "exploration|combat|chase|stealth|dialogue|travel_montage|celebration|rest|dramatic|dream|cutscene",
  "dialogueSegments": [{"type":"narration|dialogue","text":"","character":"","gender":"male|female"}],
  "suggestedActions": ["exactly 3 actions"],
  "atmosphere": {"weather":"clear|rain|snow|storm|fog|fire","particles":"none|magic_dust|sparks|embers|arcane","mood":"peaceful|tense|dark|mystical|chaotic","lighting":"natural|night|dawn|bright|rays|candlelight|moonlight","transition":"dissolve|fade|arcane_wipe"},
  "stateChanges": {timeAdvance:{hoursElapsed:0.5}, npcs:[], journalEntries:[], currentLocation:"", ...},
  "imagePrompt": "short ENGLISH scene description for image gen (max 200 chars)",
  "soundEffect": "short English sound description or null",
  "musicPrompt": "instruments, tempo, mood (max 200 chars) or null",
  "questOffers": [],
  "cutscene": null,
  "dilemma": null
}
${language === 'pl' ? 'Write ALL narrative, dialogue, suggestedActions, quest text in Polish. Only imagePrompt/soundEffect/musicPrompt in English.' : 'Write all text in English.'}`,
  );

  return sections.join('\n\n');
}

// ── USER PROMPT BUILDER ──

function detectCombatIntent(action) {
  if (!action || typeof action !== 'string') return false;
  return /\b(atak|walcz|bijat|zabij|uderzam|rzucam się|wyzywam|attack|fight|strike|kill|charge|challenge|initiate combat|hit him|hit her|stab|slash)\b/i.test(action);
}

function buildUserPrompt(playerAction, {
  resolvedMechanics = null,
  dialogue = null,
  dialogueCooldown = 0,
  isFirstScene = false,
  needsSystemEnabled = false,
  characterNeeds = null,
  language = 'pl',
  sceneCount = 0,
} = {}) {
  if (isFirstScene) {
    return `Generate the opening scene. Set the stage with an atmospheric description. Introduce the setting, hint at adventure hooks, and include at least one NPC who speaks in direct dialogue. This is scene 1 — keep it concise (1-2 short paragraphs).
Include stateChanges: timeAdvance, currentLocation, npcs (introduce at least 1), journalEntries.`;
  }

  const parts = [];

  // Needs crisis reminder
  if (needsSystemEnabled && characterNeeds) {
    const critNeeds = ['hunger','thirst','bladder','hygiene','rest'].filter(k => (characterNeeds[k] ?? 100) < 10);
    if (critNeeds.length > 0) {
      parts.push(`⚠ NEEDS CRISIS: ${critNeeds.join(', ')} critically low. Narrate effects. At least 1 suggestedAction must address the most urgent need.`);
    }
  }

  // Special action types
  const isIdleWorldEvent = playerAction?.startsWith('[IDLE_WORLD_EVENT');
  const isContinue = playerAction === '[CONTINUE]';
  const isWait = playerAction === '[WAIT]';
  const isPostCombat = playerAction?.startsWith('[Combat resolved:');
  const isSurrender = isPostCombat && playerAction.includes('surrendered');
  const isTruce = isPostCombat && playerAction.includes('forced a truce');
  const isPostCombatDefeat = isPostCombat && (playerAction.includes('LOST') || playerAction.includes('did NOT win'));
  const isPostDialogue = playerAction?.startsWith('[Dialogue ended:');
  const isDialogueActive = dialogue?.active;
  const isDialogueInitiation = playerAction?.startsWith('[INITIATE DIALOGUE');
  const isGeneralCombatInitiation = playerAction?.startsWith('[INITIATE COMBAT]');
  const attackNpcMatch = playerAction?.match(/^\[ATTACK:\s*(.+?)\]$/);
  const talkNpcMatch = playerAction?.match(/^\[TALK:\s*(.+?)\]$/);

  // Action block
  if (isIdleWorldEvent) {
    parts.push(`IDLE WORLD EVENT — no player action. Something happens in the world: atmospheric event, NPC activity, overheard rumor, or foreshadowing. Keep SHORT (1-2 para). No combat. Minimal stateChanges. timeAdvance 0.25-0.5h.`);
  } else if (isWait) {
    parts.push(`PLAYER WAITS — passive observation. Do not narrate player initiative. Something develops: NPCs act, news arrives, opportunity/threat emerges. Include modest timeAdvance.`);
  } else if (isContinue) {
    parts.push(`PLAYER CONTINUES — advance the plot without specific player action. Push the scene forward, introduce next beat.`);
  } else if (isPostCombat) {
    parts.push(`${playerAction}\n\nPOST-COMBAT: Narrate aftermath. Do NOT include combatUpdate. Describe battlefield, wounds, loot. No new combat this scene.`);
    if (isPostCombatDefeat) {
      parts.push(`DEFEAT: Player LOST. Narrate consequences — capture, rescue, item loss, humiliation. Never frame as victory.`);
    }
    if (isSurrender) {
      parts.push(`SURRENDER: Player yielded. Enemies are in control. Consequences MANDATORY: imprisonment, item confiscation, money loss, reputation damage, or new obligation. Guards→arrest, Bandits→rob, Intelligent→capture/ransom.`);
    }
    if (isTruce) {
      parts.push(`TRUCE: Player forced ceasefire from strength. Enemies concede. Player keeps belongings. Narrate enemies backing off. Player is dominant — suggest: interrogate, loot fallen, press advantage.`);
    }
  } else if (isPostDialogue) {
    parts.push(`${playerAction}\n\nPOST-DIALOGUE: Return to normal narration. Reflect conversation outcome. Do NOT include dialogueUpdate.`);
  } else {
    // Extract action vs speech
    const speechMatch = playerAction?.match(/(?:mówię|mówi|say|tell|shout|speak|krzyczę)[:\s]*["""](.+?)["""]/i)
      || playerAction?.match(/["""](.+?)["""]/);
    if (speechMatch) {
      const speechText = speechMatch[1];
      const actionText = playerAction.replace(speechMatch[0], '').trim();
      parts.push(`Player ACTION: ${actionText || playerAction}`);
      parts.push(`Player SPEECH (include as dialogue segment with PC name): "${speechText}"`);
    } else {
      parts.push(`Player action: ${playerAction}`);
    }
  }

  // Dialogue mode
  if (isDialogueActive) {
    const npcGoals = (dialogue.npcs || []).map(n => `${n.name} (${n.attitude}): ${n.goal || 'conversation'}`).join(', ');
    parts.push(`DIALOGUE MODE — Round ${dialogue.round}/${dialogue.maxRounds}. NPCs: ${npcGoals}
Narrator SILENT — only NPCs speak. All dialogueSegments must be type "dialogue". suggestedActions = in-character PC speech lines.${dialogue.round >= dialogue.maxRounds ? ' LAST ROUND — wrap up, include dialogueUpdate:{active:false}.' : ''}`);
  } else if (isDialogueInitiation) {
    const npcListMatch = playerAction.match(/\[INITIATE DIALOGUE:\s*(.+?)\]/);
    parts.push(`INITIATE DIALOGUE MODE with ${npcListMatch ? npcListMatch[1] : 'nearby NPCs'}. Include dialogueUpdate:{active:true, npcs:[{name,attitude,goal}]}.`);
  } else if (talkNpcMatch) {
    parts.push(`Player wants to talk to "${talkNpcMatch[1]}". If 2+ NPCs available, consider dialogueUpdate. Otherwise narrate conversation normally.`);
  } else if (dialogueCooldown > 0 && !isPostCombat) {
    // silently skip dialogue intent
  }

  // Combat intent
  if (!isPostCombat && !isIdleWorldEvent && !isWait) {
    if (isGeneralCombatInitiation) {
      parts.push(`COMBAT INITIATED. Analyze NPCs present — hostile ones become enemies. MUST include combatUpdate with full stat blocks. Use get_npc_details tool for NPC stats if needed.`);
    } else if (attackNpcMatch) {
      parts.push(`PLAYER ATTACKS "${attackNpcMatch[1]}". This NPC MUST be in combatUpdate.enemies regardless of attitude. Check for allies who join. MUST include combatUpdate.`);
    } else if (detectCombatIntent(playerAction)) {
      parts.push(`COMBAT INTENT DETECTED. MUST include combatUpdate in stateChanges with enemies and stat blocks.`);
    }
  }

  // Resolved mechanics
  if (resolvedMechanics?.diceRoll) {
    const r = resolvedMechanics.diceRoll;
    const outcomeLabel = r.criticalSuccess ? 'CRITICAL SUCCESS' : r.criticalFailure ? 'CRITICAL FAILURE' : r.success ? 'SUCCESS' : 'FAILURE';
    parts.push(`SKILL CHECK (engine-resolved, DO NOT recalculate):
Skill: ${r.skill || '?'} | Target: ${r.target} | Roll: ${r.roll} | SL: ${r.sl >= 0 ? '+' : ''}${r.sl} | Result: ${outcomeLabel}
Narrate consistently: ${r.success ? 'the action SUCCEEDS' : 'the action FAILS'}. Scale intensity with SL magnitude.`);
  } else if (!isPostCombat && !isIdleWorldEvent) {
    parts.push('No skill check for this action.');
  }

  // Dilemma opportunity
  if (sceneCount > 0 && sceneCount % 7 === 0) {
    parts.push('Consider presenting a moral dilemma if the narrative supports it — include "dilemma" field with 2-4 choices.');
  }

  return parts.join('\n\n');
}

/**
 * Call OpenAI API with tools support.
 */
async function callOpenAI(messages, { tools = [], model, temperature = 0.8, maxTokens = 4096 } = {}) {
  const apiKey = requireServerApiKey('openai', 'OpenAI');

  const body = {
    model: model || 'gpt-5.4',
    messages,
    temperature,
    max_completion_tokens: maxTokens,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  } else {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await parseProviderError(response, 'openai');
  }

  return await response.json();
}

/**
 * Call Anthropic API with tools support.
 */
async function callAnthropic(messages, { tools = [], model, temperature = 0.8, maxTokens = 4096, system = null } = {}) {
  const apiKey = requireServerApiKey('anthropic', 'Anthropic');

  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages,
    temperature,
  };

  if (system) body.system = system;
  if (tools.length > 0) body.tools = tools;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await parseProviderError(response, 'anthropic');
  }

  return await response.json();
}

/**
 * Generate a scene using AI with tool-use loop.
 * AI gets a lean base context and can dynamically fetch more via tools.
 */
export async function generateScene(campaignId, playerAction, {
  provider = 'openai',
  model,
  language = 'pl',
  dmSettings = {},
  resolvedMechanics = null,
  needsSystemEnabled = false,
  characterNeeds = null,
  dialogue = null,
  dialogueCooldown = 0,
  isFirstScene = false,
  isCustomAction = false,
  fromAutoPlayer = false,
  sceneCount = 0,
} = {}) {
  // 1. Load campaign core state + normalized data + codex + knowledge
  const [campaign, dbNpcs, dbQuests, dbCodex, dbKnowledge] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { coreState: true, characterState: true },
    }),
    prisma.campaignNPC.findMany({ where: { campaignId } }),
    prisma.campaignQuest.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } }),
    prisma.campaignCodex.findMany({
      where: { campaignId },
      select: { codexKey: true, name: true, category: true, fragments: true },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    }),
    prisma.campaignKnowledge.findMany({
      where: { campaignId, importance: { in: ['high', 'critical'] } },
      select: { summary: true, importance: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  if (!campaign) throw new Error('Campaign not found');
  const coreState = JSON.parse(campaign.coreState);

  // Inject characterState
  const charState = JSON.parse(campaign.characterState || '{}');
  if (Object.keys(charState).length > 0) coreState.character = charState;

  // Inject normalized NPCs
  if (dbNpcs.length > 0) {
    if (!coreState.world) coreState.world = {};
    coreState.world.npcs = dbNpcs.map((n) => ({
      name: n.name, gender: n.gender, role: n.role,
      personality: n.personality, attitude: n.attitude, disposition: n.disposition,
      alive: n.alive, lastLocation: n.lastLocation, factionId: n.factionId,
      notes: n.notes, relationships: JSON.parse(n.relationships || '[]'),
    }));
  }

  // Inject normalized quests
  if (dbQuests.length > 0) {
    const active = [];
    const completed = [];
    for (const q of dbQuests) {
      const quest = {
        id: q.questId, name: q.name, type: q.type, description: q.description,
        completionCondition: q.completionCondition, questGiverId: q.questGiverId,
        turnInNpcId: q.turnInNpcId, locationId: q.locationId,
        prerequisiteQuestIds: JSON.parse(q.prerequisiteQuestIds || '[]'),
        objectives: JSON.parse(q.objectives || '[]'),
        reward: q.reward ? JSON.parse(q.reward) : null,
      };
      if (q.status === 'completed') completed.push({ ...quest, completedAt: q.completedAt });
      else active.push(quest);
    }
    coreState.quests = { active, completed };
  }

  // Inject codex summary for inline context
  if (dbCodex.length > 0) {
    if (!coreState.world) coreState.world = {};
    const ASPECT_TYPES = ['history', 'description', 'location', 'weakness', 'rumor', 'technical', 'political'];
    coreState.world.codexSummary = dbCodex.map((c) => {
      const fragments = JSON.parse(c.fragments || '[]');
      const knownAspects = [...new Set(fragments.map(f => f.aspect).filter(Boolean))];
      const canReveal = ASPECT_TYPES.filter(a => !knownAspects.includes(a));
      return { name: c.name, category: c.category, knownAspects, canReveal };
    });
  }

  // Inject key plot facts for inline context
  if (dbKnowledge.length > 0) {
    if (!coreState.world) coreState.world = {};
    coreState.world.keyPlotFacts = dbKnowledge.map(k => k.summary);
  }

  // 2. Load recent scenes
  const recentScenes = await prisma.campaignScene.findMany({
    where: { campaignId },
    orderBy: { sceneIndex: 'desc' },
    take: 5,
  });
  recentScenes.reverse(); // chronological order

  // 3. Build prompts
  const systemPrompt = buildLeanSystemPrompt(coreState, recentScenes, language, {
    dmSettings,
    needsSystemEnabled,
    characterNeeds,
    sceneCount,
  });

  const userPrompt = buildUserPrompt(playerAction, {
    resolvedMechanics,
    dialogue,
    dialogueCooldown,
    isFirstScene,
    needsSystemEnabled,
    characterNeeds,
    language,
    sceneCount,
  });

  // 4. Run tool-use loop
  let sceneResult;
  if (provider === 'openai') {
    sceneResult = await runOpenAIToolLoop(campaignId, systemPrompt, userPrompt, model);
  } else {
    sceneResult = await runAnthropicToolLoop(campaignId, systemPrompt, userPrompt, model);
  }

  // 5. Save scene to database
  const lastScene = recentScenes[recentScenes.length - 1];
  const newSceneIndex = lastScene ? lastScene.sceneIndex + 1 : 0;

  const savedScene = await prisma.campaignScene.create({
    data: {
      campaignId,
      sceneIndex: newSceneIndex,
      narrative: sceneResult.narrative || '',
      chosenAction: playerAction,
      suggestedActions: JSON.stringify(sceneResult.suggestedActions || []),
      dialogueSegments: JSON.stringify(sceneResult.dialogueSegments || []),
      imagePrompt: sceneResult.imagePrompt || null,
      soundEffect: sceneResult.soundEffect || null,
      diceRoll: sceneResult.diceRoll ? JSON.stringify(sceneResult.diceRoll) : null,
      stateChanges: sceneResult.stateChanges ? JSON.stringify(sceneResult.stateChanges) : null,
      scenePacing: sceneResult.scenePacing || 'exploration',
    },
  });

  // 6. Generate embedding async (fire and forget)
  generateSceneEmbedding(savedScene).catch((err) =>
    console.error('Failed to generate scene embedding:', err.message),
  );

  // 7. Process stateChanges - update normalized collections
  if (sceneResult.stateChanges) {
    processStateChanges(campaignId, sceneResult.stateChanges).catch((err) =>
      console.error('Failed to process state changes:', err.message),
    );
  }

  return {
    scene: sceneResult,
    sceneIndex: newSceneIndex,
    sceneId: savedScene.id,
  };
}

/**
 * OpenAI tool-use loop.
 */
async function runOpenAIToolLoop(campaignId, systemPrompt, userPrompt, model) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    const tools = isLastRound ? [] : CONTEXT_TOOLS_OPENAI;

    const response = await callOpenAI(messages, { tools, model });
    const choice = response.choices?.[0];

    if (!choice) throw new Error('No response from OpenAI');

    // If AI finished (no tool calls), parse JSON
    if (choice.finish_reason === 'stop' || !choice.message.tool_calls?.length) {
      return parseAIResponse(choice.message.content);
    }

    // Process tool calls
    messages.push(choice.message);

    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = await executeToolCall(campaignId, tc.function.name, args);
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  // Fallback: force response without tools
  const response = await callOpenAI(messages, { tools: [] });
  return parseAIResponse(response.choices[0].message.content);
}

/**
 * Anthropic tool-use loop.
 */
async function runAnthropicToolLoop(campaignId, systemPrompt, userPrompt, model) {
  const messages = [{ role: 'user', content: userPrompt }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    const tools = isLastRound ? [] : CONTEXT_TOOLS_ANTHROPIC;

    const response = await callAnthropic(messages, { tools, system: systemPrompt, model });

    if (response.stop_reason === 'end_turn' || !response.content?.some((c) => c.type === 'tool_use')) {
      // Extract text content
      const textBlock = response.content?.find((c) => c.type === 'text');
      if (textBlock) return parseAIResponse(textBlock.text);
      throw new Error('No text response from Anthropic');
    }

    // Process tool calls
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const result = await executeToolCall(campaignId, block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Fallback
  const response = await callAnthropic(messages, { tools: [], system: systemPrompt });
  const textBlock = response.content?.find((c) => c.type === 'text');
  if (textBlock) return parseAIResponse(textBlock.text);
  throw new Error('No response from Anthropic after tool loop');
}

/**
 * Parse AI response text as JSON, with basic cleanup.
 */
function parseAIResponse(text) {
  if (!text) throw new Error('Empty AI response');

  // Try to extract JSON from markdown code blocks
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());

    // Ensure required fields have defaults
    return {
      narrative: parsed.narrative || '',
      suggestedActions: parsed.suggestedActions || ['Look around', 'Move forward', 'Wait'],
      stateChanges: parsed.stateChanges || {},
      dialogueSegments: parsed.dialogueSegments || [],
      scenePacing: parsed.scenePacing || 'exploration',
      diceRoll: parsed.diceRoll || null,
      atmosphere: parsed.atmosphere || { weather: 'clear', mood: 'peaceful', lighting: 'natural' },
      sceneGrid: parsed.sceneGrid || null,
      imagePrompt: parsed.imagePrompt || null,
      soundEffect: parsed.soundEffect || null,
      musicPrompt: parsed.musicPrompt || null,
      questOffers: parsed.questOffers || [],
      cutscene: parsed.cutscene || null,
      dilemma: parsed.dilemma || null,
    };
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\nResponse: ${text.slice(0, 500)}`);
  }
}

/**
 * Generate and store embedding for a saved scene (async, fire-and-forget).
 */
async function generateSceneEmbedding(scene) {
  const embeddingText = buildSceneEmbeddingText(scene);
  if (!embeddingText) return;

  const embedding = await embedText(embeddingText);
  if (embedding) {
    await writeEmbedding('CampaignScene', scene.id, embedding, embeddingText);
  }
}

/**
 * Process stateChanges from AI response - update normalized collections.
 */
async function processStateChanges(campaignId, stateChanges) {
  // Update NPCs
  if (stateChanges.npcs?.length) {
    for (const npcChange of stateChanges.npcs) {
      if (!npcChange.name) continue;

      const npcId = npcChange.name.toLowerCase().replace(/\s+/g, '_');

      try {
        const existing = await prisma.campaignNPC.findUnique({
          where: { campaignId_npcId: { campaignId, npcId } },
        });

        if (existing) {
          const updateData = {};
          if (npcChange.attitude) updateData.attitude = npcChange.attitude;
          if (npcChange.disposition != null) updateData.disposition = npcChange.disposition;
          if (npcChange.alive != null) updateData.alive = npcChange.alive;
          if (npcChange.lastLocation) updateData.lastLocation = npcChange.lastLocation;
          if (npcChange.factionId) updateData.factionId = npcChange.factionId;
          if (npcChange.relationships) {
            updateData.relationships = JSON.stringify(npcChange.relationships);
          }

          if (Object.keys(updateData).length > 0) {
            const updated = await prisma.campaignNPC.update({
              where: { id: existing.id },
              data: updateData,
            });
            // Re-embed
            const embText = buildNPCEmbeddingText(updated);
            const emb = await embedText(embText);
            if (emb) writeEmbedding('CampaignNPC', updated.id, emb, embText);
          }
        } else if (npcChange.action === 'introduce' || !existing) {
          const created = await prisma.campaignNPC.create({
            data: {
              campaignId,
              npcId,
              name: npcChange.name,
              gender: npcChange.gender || 'unknown',
              role: npcChange.role || null,
              personality: npcChange.personality || null,
              attitude: npcChange.attitude || 'neutral',
              disposition: npcChange.disposition ?? 0,
              factionId: npcChange.factionId || null,
              relationships: JSON.stringify(npcChange.relationships || []),
              relatedQuestIds: JSON.stringify(npcChange.relatedQuestIds || []),
            },
          });
          // Embed new NPC
          const embText = buildNPCEmbeddingText(created);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignNPC', created.id, emb, embText);
        }
      } catch (err) {
        console.error(`Failed to process NPC change for ${npcChange.name}:`, err.message);
      }
    }
  }

  // Update knowledge base entries
  if (stateChanges.knowledgeUpdates) {
    const ku = stateChanges.knowledgeUpdates;
    const entries = [];

    if (ku.events?.length) {
      for (const e of ku.events) {
        entries.push({ entryType: 'event', summary: e.summary || e, content: JSON.stringify(e), importance: e.importance, tags: JSON.stringify(e.tags || []) });
      }
    }
    if (ku.decisions?.length) {
      for (const d of ku.decisions) {
        entries.push({ entryType: 'decision', summary: `${d.choice} -> ${d.consequence}`, content: JSON.stringify(d), importance: d.importance, tags: JSON.stringify(d.tags || []) });
      }
    }

    for (const entry of entries) {
      try {
        const created = await prisma.campaignKnowledge.create({
          data: { campaignId, ...entry },
        });
        const embText = buildKnowledgeEmbeddingText(created);
        const emb = await embedText(embText);
        if (emb) writeEmbedding('CampaignKnowledge', created.id, emb, embText);
      } catch (err) {
        console.error('Failed to save knowledge entry:', err.message);
      }
    }
  }

  // Update codex entries
  if (stateChanges.codexUpdates?.length) {
    for (const cu of stateChanges.codexUpdates) {
      if (!cu.id || !cu.name) continue;

      try {
        const existing = await prisma.campaignCodex.findUnique({
          where: { campaignId_codexKey: { campaignId, codexKey: cu.id } },
        });

        if (existing) {
          const existingFragments = JSON.parse(existing.fragments || '[]');
          if (cu.fragment) existingFragments.push(cu.fragment);

          const updated = await prisma.campaignCodex.update({
            where: { id: existing.id },
            data: {
              fragments: JSON.stringify(existingFragments),
              tags: JSON.stringify(cu.tags || JSON.parse(existing.tags || '[]')),
            },
          });
          const embText = buildCodexEmbeddingText(updated);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignCodex', updated.id, emb, embText);
        } else {
          const created = await prisma.campaignCodex.create({
            data: {
              campaignId,
              codexKey: cu.id,
              name: cu.name,
              category: cu.category || 'concept',
              tags: JSON.stringify(cu.tags || []),
              fragments: JSON.stringify(cu.fragment ? [cu.fragment] : []),
              relatedEntries: JSON.stringify(cu.relatedEntries || []),
            },
          });
          const embText = buildCodexEmbeddingText(created);
          const emb = await embedText(embText);
          if (emb) writeEmbedding('CampaignCodex', created.id, emb, embText);
        }
      } catch (err) {
        console.error(`Failed to process codex update for ${cu.id}:`, err.message);
      }
    }
  }
}
