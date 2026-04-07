import { formatMoney } from './gameState';
import { gameData } from './gameDataService';
import { FACTION_DEFINITIONS, getReputationTier } from '../data/rpgFactions';
import { buildUnmetNeedsBlock, buildNeedsEnforcementReminder } from './prompts';
import { extractActionParts, extractDialogueParts, hasDialogue } from './actionParser';
// RPGon: no critical wounds or talents
import { formatResolvedCheck } from './mechanics/index';

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
  const custom = (d.narratorCustomInstructions || '').trim();
  return `Difficulty ${diff}, narrative ${narr}, response ${len}, ~${tests}% actions need d50 tests. Voice: poeticism ${d.narratorPoeticism ?? 50}, grit ${d.narratorGrittiness ?? 30}, detail ${d.narratorDetail ?? 50}, humor ${d.narratorHumor ?? 20}, drama ${d.narratorDrama ?? 50}.${custom ? ` Player narrator instructions: ${custom}.` : ''} Avoid repetitive tax/tax-collector metaphors unless directly relevant to the scene.`;
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

  const attrs = character?.attributes || {};
  const charCompact = ['sila', 'inteligencja', 'charyzma', 'zrecznosc', 'wytrzymalosc', 'szczescie']
    .map((key) => {
      const val = attrs[key] || 0;
      return `${key.toUpperCase()}:${val}`;
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

  const critBlock = '';

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

  return `You are the GM for RPGon campaign "${campaign?.name || 'Campaign'}".

${compactDmSummary(dmSettings)}
World: ${(campaign?.worldDescription || '').slice(0, 400)}
Hook: ${(campaign?.hook || '').slice(0, 300)}

PC: ${character?.name || '?'} (${character?.species || 'Human'}) — ${careerInfo}
XP ${character?.xp || 0} (spent ${character?.xpSpent || 0}) | Wounds ${character?.wounds ?? 0}/${character?.maxWounds ?? 0} | M ${character?.movement ?? 4} | Mana ${character?.mana?.current ?? 0}/${character?.mana?.max ?? 0}
Attrs: ${charCompact}
Skills: ${skillList}
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

Rules (short): d50 system. Roll d50, total = roll + attribute + skill + bonuses vs threshold. Margin = total - threshold; margin >= 0 = success. Roll 1 = critical success, roll 50 = critical failure. Attributes: sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, szczescie (1-25). Skills level 0-25. XP +20–50 sometimes. Money: GC/SS/CP (1GC=10SS=100CP). combatUpdate in stateChanges when a fight starts. EVERY diceRoll MUST include "attribute" (sila/inteligencja/charyzma/zrecznosc/wytrzymalosc/szczescie), "attributeValue" (raw stat 1-25), and "skillLevel" (level, 0 if untrained). For speech, persuasion, bargaining, bluffing, charming, greeting, and asking questions, default to charyzma. If you cannot determine a valid RPGon attribute, set diceRoll to null.
Feasibility: impossible actions (target not present, physically impossible) = auto-fail, diceRoll=null. Trivial actions (walking, sitting, picking up nearby object) = auto-succeed, diceRoll=null. Only roll for uncertain outcomes. Only suggest actions involving NPCs/features present at current location.
NPC disposition modifiers for social/trade/persuasion tests: >=30:+15, >=15:+10, >=5:+5, neutral:0, <=-5:-5, <=-15:-10, <=-30:-15. Include "dispositionBonus" in diceRoll when applicable.

Bestiary sample:\n${gameData.formatBestiaryForPrompt(Object.values(gameData.bestiary).slice(0, 5))}

Output valid JSON only (no markdown). All player-facing text in ${lang}. Include stateChanges.timeAdvance.hoursElapsed every scene; stateChanges.currentLocation when moving; questUpdates when objectives met.`;
}

export function buildReducedScenePrompt(
  playerAction,
  isFirstScene = false,
  language = 'en',
  { needsSystemEnabled = false, characterNeeds = null, isCustomAction = false, fromAutoPlayer = false, resolvedMechanics = null } = {},
  dmSettings = null,
) {
  const lang = language === 'pl' ? 'Polish' : 'English';

  const reducedStateJson = `{
  "narrative": "prose in ${lang}, 1–3 short paragraphs",
  "dialogueSegments": [
    { "type": "narration", "text": "..." },
    { "type": "dialogue", "character": "NPC name", "gender": "male|female", "text": "..." }
  ],
  "suggestedActions": ["opt1", "opt2", "opt3"],
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
Write narrative and suggestedActions in ${lang}. Return exactly 3 suggestedActions; exactly 1 must be a direct PC dialogue line (what the player character says aloud). Up to 1 may be absurd/chaotic but still actionable in-scene.`;
  }

  const needsReminder = needsSystemEnabled ? buildUnmetNeedsBlock(characterNeeds) : '';

  const playerHasDialogue = hasDialogue(playerAction);
  const actionLine = playerHasDialogue
    ? `Player ACTION: ${extractActionParts(playerAction)}\nPlayer DIALOGUE (exact PC speech): ${extractDialogueParts(playerAction)}`
    : `Player action: "${playerAction}"`;

  return `${needsReminder}${actionLine}
${playerHasDialogue ? 'DIALOGUE line = exact PC speech — include verbatim in narrative.' : 'Quoted text in the action = PC speech (work into narrative).'}

SKILL CHECK (resolved by game engine):
${formatResolvedCheck(resolvedMechanics?.diceRoll)}
${resolvedMechanics?.diceRoll ? 'Narrate consistent with the outcome above. DO NOT include "diceRoll" in your response.' : 'No dice check. DO NOT include "diceRoll" in your response.'}

JSON only — no soundEffect, musicPrompt, atmosphere, or imagePrompt.
Always include dialogueSegments:
- Split narrative into ordered chunks.
- Use type "dialogue" for spoken lines and type "narration" for non-spoken prose.
- Keep segment text verbatim (no paraphrase).
- For every dialogue segment include character and gender ("male" or "female").

${reducedStateJson}

Keep stateChanges focused: woundsChange, xp, items, quests (new/completed/questUpdates), timeAdvance, currentLocation${needsSystemEnabled ? ', needsChanges when relevant' : ''}. You may add short journalEntries, npcs, moneyChange, combatUpdate if needed.

${needsSystemEnabled ? buildNeedsEnforcementReminder(characterNeeds, language) : ''}
All narrative and suggestedActions in ${lang}. Return exactly 3 suggestedActions; exactly 1 must be a direct PC dialogue line (what the player character says aloud). Up to 1 may be absurd/chaotic but still actionable in-scene.`;
}
