import { getBonus, formatMoney } from './gameState';
import { BESTIARY, formatBestiaryForPrompt } from '../data/wfrpBestiary';
import { FACTION_DEFINITIONS, getReputationTier } from '../data/wfrpFactions';
import { formatCriticalWoundsForPrompt } from '../data/wfrpCriticals';
import { buildUnmetNeedsBlock, buildNeedsEnforcementReminder } from './prompts';

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').replace(/\/+$/, '');
}

function parseAssistantJSON(content) {
  if (content == null) throw new Error('Empty response from local LLM');
  const trimmed = String(content).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse local LLM response as JSON');
    return JSON.parse(jsonMatch[0]);
  }
}

/**
 * @returns {Promise<{ provider: 'ollama'|'lmstudio'|'unknown', models: string[] }>}
 */
export async function detectLocalLLMProvider(endpoint) {
  const base = normalizeEndpoint(endpoint);
  if (!base) return { provider: 'unknown', models: [] };

  try {
    const r = await fetch(`${base}/api/tags`, { method: 'GET' });
    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      const models = (data.models || []).map((m) => m.name || m.model).filter(Boolean);
      return { provider: 'ollama', models };
    }
  } catch {
    /* try LM Studio */
  }

  try {
    const r = await fetch(`${base}/v1/models`, { method: 'GET' });
    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      const models = (data.data || []).map((m) => m.id).filter(Boolean);
      return { provider: 'lmstudio', models };
    }
  } catch {
    /* unknown */
  }

  return { provider: 'unknown', models: [] };
}

export async function isLocalLLMAvailable(endpoint) {
  const { provider } = await detectLocalLLMProvider(endpoint);
  return provider === 'ollama' || provider === 'lmstudio';
}

async function callOllamaChat(base, model, systemPrompt, userPrompt, maxTokens) {
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.8, num_predict: maxTokens },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Ollama API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.message?.content;
  const result = parseAssistantJSON(content);
  const usage = {
    prompt_tokens: data.prompt_eval_count ?? 0,
    completion_tokens: data.eval_count ?? 0,
    model: data.model || model,
  };
  return { result, usage };
}

async function callLMStudioChat(base, model, systemPrompt, userPrompt, maxTokens) {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `LM Studio API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const result = parseAssistantJSON(content);
  const usage = {
    prompt_tokens: data.usage?.prompt_tokens ?? 0,
    completion_tokens: data.usage?.completion_tokens ?? 0,
    model: data.model || model,
  };
  return { result, usage };
}

/**
 * @returns {Promise<{ result: object, usage: { prompt_tokens: number, completion_tokens: number, model: string } }>}
 */
export async function callLocalLLM(endpoint, model, systemPrompt, userPrompt, maxTokens = 2000) {
  const base = normalizeEndpoint(endpoint);
  if (!base) throw new Error('Local LLM endpoint is required');

  const { provider } = await detectLocalLLMProvider(base);
  if (provider === 'ollama') {
    return callOllamaChat(base, model, systemPrompt, userPrompt, maxTokens);
  }
  if (provider === 'lmstudio') {
    return callLMStudioChat(base, model, systemPrompt, userPrompt, maxTokens);
  }
  throw new Error('Could not reach Ollama (/api/tags) or LM Studio (/v1/models) at this endpoint');
}

function compactDmSummary(dmSettings) {
  const d = dmSettings || {};
  const diff = d.difficulty < 25 ? 'Easy' : d.difficulty < 50 ? 'Normal' : d.difficulty < 75 ? 'Hard' : 'Expert';
  const narr = d.narrativeStyle < 25 ? 'Predictable' : d.narrativeStyle < 50 ? 'Balanced' : d.narrativeStyle < 75 ? 'Chaotic' : 'Wild';
  const len = d.responseLength < 33 ? 'short' : d.responseLength < 66 ? 'medium' : 'long';
  const tests = d.testsFrequency ?? 50;
  return `Difficulty ${diff}, narrative ${narr}, response ${len}, ~${tests}% actions need d100 tests. Voice: poeticism ${d.narratorPoeticism ?? 50}, grit ${d.narratorGrittiness ?? 30}, detail ${d.narratorDetail ?? 50}, humor ${d.narratorHumor ?? 20}, drama ${d.narratorDrama ?? 50}.`;
}

export function buildReducedSystemPrompt(gameState, dmSettings, language = 'en', enhancedContext = null, { needsSystemEnabled = false } = {}) {
  const { campaign, character, world, quests } = gameState;

  const activeQuests = (quests?.active || [])
    .map((q) => {
      let line = `- ${q.name}: ${q.description?.slice(0, 120) || ''}`;
      if (q.objectives?.length) {
        const objs = q.objectives.slice(0, 4).map((o) => `${o.completed ? '✓' : '○'} ${o.description?.slice(0, 80) || ''}`);
        line += `\n  ${objs.join('; ')}`;
      }
      return line;
    })
    .join('\n') || 'None';

  const worldFacts = (world?.facts || []).slice(-8).join(' | ') || 'None';
  const journal = (world?.eventHistory || []).length
    ? world.eventHistory.slice(-8).map((e, i) => `${i + 1}. ${e}`).join('\n')
    : 'None';

  const inventory = character?.inventory?.map((i) => i.name).join(', ') || 'Empty';
  const moneyDisplay = character?.money ? formatMoney(character.money) : '0 CP';
  const statuses = character?.statuses?.join(', ') || 'None';

  const npcs = world?.npcs || [];
  const npcSection = npcs.length
    ? npcs.slice(0, 12).map((n) => `${n.name}${n.alive === false ? ' [DEAD]' : ''}: ${n.role || '?'}, ${n.attitude || 'neutral'} @ ${n.lastLocation || '?'}`).join('\n')
    : 'None';

  const currentLoc = world?.currentLocation || 'Unknown';

  const npcsHere = npcs.filter((n) => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  const npcsHereSection = npcsHere.length > 0
    ? npcsHere.map((n) => n.name).join(', ')
    : 'None';
  const mapState = world?.mapState || [];
  const mapSection = mapState.length
    ? mapState.slice(0, 10).map((loc) => {
        const cur = loc.name?.toLowerCase() === currentLoc?.toLowerCase() ? ' *' : '';
        return `- ${loc.name}${cur}${loc.description ? `: ${loc.description.slice(0, 80)}` : ''}`;
      }).join('\n')
    : 'None';

  const timeState = world?.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
  const h = Math.floor(timeState.hour ?? 6);
  const m = Math.round(((timeState.hour ?? 6) - h) * 60);
  const timeSection = `D${timeState.day} ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${timeState.timeOfDay}, ${timeState.season}`;

  const activeEffects = (world?.activeEffects || []).filter((e) => e.active !== false);
  const effectsSection = activeEffects.length
    ? activeEffects.slice(0, 6).map((e) => `- ${e.type}: ${e.description?.slice(0, 100) || ''} @ ${e.location || '?'}`).join('\n')
    : 'None';

  const chars = character?.characteristics || {};
  const adv = character?.advances || {};
  const charCompact = ['ws', 'bs', 's', 't', 'i', 'ag', 'dex', 'int', 'wp', 'fel']
    .map((key) => {
      const val = chars[key] || 0;
      const bonus = getBonus(val);
      const a = adv[key] || 0;
      return `${key.toUpperCase()}:${val}(+${bonus}${a ? ` +${a}adv` : ''})`;
    })
    .join(' ');

  const skillList = character?.skills && Object.keys(character.skills).length
    ? Object.entries(character.skills)
        .slice(0, 20)
        .map(([name, advances]) => `${name}+${advances}`)
        .join(', ')
    : 'None';

  const careerInfo = character?.career
    ? `${character.career.name} T${character.career.tier} ${character.career.status || ''}`
    : 'Unknown';

  let sceneHistory;
  if (enhancedContext) {
    const parts = [];
    if (enhancedContext.compressedHistory) {
      parts.push(`Archive: ${enhancedContext.compressedHistory.slice(0, 1200)}`);
    }
    if (enhancedContext.mediumScenes?.length) {
      parts.push(
        enhancedContext.mediumScenes
          .slice(-4)
          .map((s) => `#${s.index}: ${(s.summary || '').slice(0, 150)}`)
          .join('\n'),
      );
    }
    if (enhancedContext.fullScenes?.length) {
      parts.push(
        enhancedContext.fullScenes
          .slice(-2)
          .map((s) => `#${s.index}: ${(s.narrative || '').slice(0, 400)}`)
          .join('\n\n'),
      );
    }
    sceneHistory = parts.join('\n---\n') || 'Start.';
  } else {
    const scenes = gameState.scenes || [];
    sceneHistory =
      scenes
        .slice(-4)
        .map((s, i) => `${i + 1}. ${(s.narrative || '').slice(0, 150)}…`)
        .join('\n') || 'Start.';
  }

  const critBlock =
    character?.criticalWounds?.length > 0
      ? `${formatCriticalWoundsForPrompt(character.criticalWounds)}\nReflect injuries in play; healCriticalWound in stateChanges when treated.\n`
      : '';

  const needsBlock =
    needsSystemEnabled && character?.needs
      ? `Needs (0–100): H ${character.needs.hunger ?? 100} T ${character.needs.thirst ?? 100} B ${character.needs.bladder ?? 100} Hy ${character.needs.hygiene ?? 100} R ${character.needs.rest ?? 100}. Update needsChanges deltas when eating/drinking/rest/etc. Low (<30): -10 to related tests.\n`
      : '';

  const factionLines = (() => {
    const factions = gameState?.world?.factions;
    if (!factions || Object.keys(factions).length === 0) return '';
    return Object.entries(factions)
      .slice(0, 8)
      .map(([id, rep]) => {
        const def = FACTION_DEFINITIONS[id];
        const tier = getReputationTier(rep);
        return `${def?.name || id}: ${rep} (${tier})`;
      })
      .join('; ');
  })();

  const lang = language === 'pl' ? 'Polish' : 'English';

  return `You are the GM for WFRP 4e campaign "${campaign?.name || 'Campaign'}".

${compactDmSummary(dmSettings)}
World: ${(campaign?.worldDescription || '').slice(0, 400)}
Hook: ${(campaign?.hook || '').slice(0, 300)}

PC: ${character?.name || '?'} (${character?.species || 'Human'}) — ${careerInfo}
XP ${character?.xp || 0} (spent ${character?.xpSpent || 0}) | Wounds ${character?.wounds ?? 0}/${character?.maxWounds ?? 0} | M ${character?.movement ?? 4} | Fate ${character?.fate ?? 0} Fortune ${character?.fortune ?? 0}
Chars: ${charCompact}
Skills: ${skillList}
Talents: ${(character?.talents || []).slice(0, 12).join(', ') || 'None'}
Inv: ${inventory} | Money: ${moneyDisplay} | Status: ${statuses}
${critBlock}${needsBlock}
Loc: ${currentLoc}
Map:\n${mapSection}
Time: ${timeSection}
Effects:\n${effectsSection}
NPCs:\n${npcSection}
NPCs here: ${npcsHereSection}
Facts: ${worldFacts}
Journal:\n${journal}
Quests:\n${activeQuests}
${factionLines ? `Factions: ${factionLines}\n` : ''}
History:\n${sceneHistory}

Rules (short): d100, target = characteristic + skill advances; SL = (target−roll)/10 toward 0; 01–04 crit success, 96–00 crit fail; failed roll = failed action in fiction. Fortune/Fate/Resolve as usual. XP +20–50 sometimes. Money: GC/SS/CP (1GC=10SS=100CP). combatUpdate in stateChanges when a fight starts.
Feasibility: impossible actions (target not present, physically impossible) = auto-fail, diceRoll=null. Trivial actions (walking, sitting, picking up nearby object) = auto-succeed, diceRoll=null. Only roll for uncertain outcomes. Only suggest actions involving NPCs/features present at current location.
NPC disposition modifiers for social/trade/persuasion tests: >=30:+15, >=15:+10, >=5:+5, neutral:0, <=-5:-5, <=-15:-10, <=-30:-15. Include "dispositionBonus" in diceRoll when applicable.

Bestiary sample:\n${formatBestiaryForPrompt(Object.values(BESTIARY).slice(0, 5))}

Output valid JSON only (no markdown). All player-facing text in ${lang}. Include stateChanges.timeAdvance.hoursElapsed every scene; stateChanges.currentLocation when moving; questUpdates when objectives met.`;
}

export function buildReducedScenePrompt(
  playerAction,
  isFirstScene = false,
  language = 'en',
  { needsSystemEnabled = false, characterNeeds = null, isCustomAction = false, preRolledDice = null, skipDiceRoll = false, momentumBonus = 0 } = {},
  dmSettings = null,
) {
  const lang = language === 'pl' ? 'Polish' : 'English';
  const testsPct = dmSettings?.testsFrequency ?? 50;

  const reducedStateJson = `{
  "narrative": "prose in ${lang}, 1–3 short paragraphs",
  "suggestedActions": ["opt1", "opt2", "opt3", "opt4"],
  "diceRoll": null,
  "stateChanges": {
    "woundsChange": 0,
    "xp": 0,
    "newItems": [],
    "removeItems": [],
    "newQuests": [],
    "completedQuests": [],
    "questUpdates": [],
    "timeAdvance": { "hoursElapsed": 0.5, "newDay": false },
    "currentLocation": "stay or new name"${needsSystemEnabled ? ',\n    "needsChanges": { "hunger": 0, "thirst": 0, "bladder": 0, "hygiene": 0, "rest": 0 }' : ''}
  }
}`;

  if (isFirstScene) {
    return `Opening scene. Set tone and hook. JSON only, no extra keys beyond schema.

${reducedStateJson}

Optional stateChanges: journalEntries (1–2 strings), npcs (brief introduce), mapChanges, moneyChange, activeEffects, combatUpdate if fight starts.
timeAdvance.hoursElapsed: ~0.25–1 for opening.
Write narrative and suggestedActions in ${lang}.`;
  }

  const needsReminder = needsSystemEnabled ? buildUnmetNeedsBlock(characterNeeds) : '';

  return `${needsReminder}Player action: "${playerAction}"
Quoted text in the action = PC speech (work into narrative).

Feasibility first: impossible=auto-fail (diceRoll=null), trivial=auto-succeed (diceRoll=null). Then resolve with WFRP d100 when uncertain (~${testsPct}% of actions need a roll).
${skipDiceRoll ? 'DICE ROLL OVERRIDE: This action does NOT require a dice roll. Set diceRoll to null.' : (preRolledDice ? `Use roll=${preRolledDice} in diceRoll; do not invent another roll.` : '')}
${isCustomAction ? 'Custom action: add creativityBonus 10–40 to base target; set diceRoll.baseTarget, creativityBonus, target (effective).' : ''}
${momentumBonus !== 0 ? `Momentum ${momentumBonus > 0 ? '+' : ''}${momentumBonus} adjusts target once; set diceRoll.momentumBonus.` : ''}

JSON only — no dialogueSegments, soundEffect, musicPrompt, atmosphere, or imagePrompt.

${reducedStateJson}

diceRoll when needed: {"type":"d100","roll",${isCustomAction ? '"baseTarget","creativityBonus",' : ''}${momentumBonus !== 0 ? '"momentumBonus",' : ''}"target","sl","skill","success","criticalSuccess","criticalFailure"}
Keep stateChanges focused: woundsChange, xp, items, quests (new/completed/questUpdates), timeAdvance, currentLocation${needsSystemEnabled ? ', needsChanges when relevant' : ''}. You may add short journalEntries, npcs, moneyChange, combatUpdate if needed.

${needsSystemEnabled ? buildNeedsEnforcementReminder(characterNeeds) : ''}
All narrative and suggestedActions in ${lang}.`;
}
