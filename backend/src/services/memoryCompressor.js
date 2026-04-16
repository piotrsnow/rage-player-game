/**
 * Memory Compressor — nano model extracts facts from scenes.
 *
 * Three levels of compression:
 * 1. Running summary — after each scene, extract key facts → gameStateSummary
 * 2. Location summary — when player leaves a location, summarize all events there
 * 3. Quest objective check — after each scene, track progress + detect completion
 */

import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'memoryCompressor' });

// ── NANO MODEL CALLER (provider-aware) ──

async function callNano(systemPrompt, userPrompt, provider, { timeoutMs } = {}) {
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutHandle = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  timeoutHandle?.unref?.();
  const signal = controller?.signal;

  try {
    // Match nano provider to the main scene provider so that choosing Chat (OpenAI)
    // never triggers Claude Haiku calls and vice versa. If the preferred provider
    // has no key configured, fall back to whichever key is available.
    if (provider === 'anthropic') {
      if (config.apiKeys.anthropic) return await callNanoAnthropic(systemPrompt, userPrompt, signal);
      if (config.apiKeys.openai) return await callNanoOpenAI(systemPrompt, userPrompt, signal);
      return null;
    }
    if (provider === 'openai') {
      if (config.apiKeys.openai) return await callNanoOpenAI(systemPrompt, userPrompt, signal);
      if (config.apiKeys.anthropic) return await callNanoAnthropic(systemPrompt, userPrompt, signal);
      return null;
    }
    // No explicit preference — keep legacy behavior (Anthropic first)
    if (config.apiKeys.anthropic) return await callNanoAnthropic(systemPrompt, userPrompt, signal);
    if (config.apiKeys.openai) return await callNanoOpenAI(systemPrompt, userPrompt, signal);
    return null;
  } catch (err) {
    if (err?.name === 'AbortError') {
      log.warn({ timeoutMs }, 'Nano memory call timed out');
      return null;
    }
    throw err;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function callNanoOpenAI(systemPrompt, userPrompt, signal) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKeys.openai}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    }),
    signal,
  });

  if (!response.ok) return null;
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content);
}

async function callNanoAnthropic(systemPrompt, userPrompt, signal) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKeys.anthropic,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.aiModels.nano.anthropic,
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  });

  if (!response.ok) return null;
  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) return null;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

// ── RUNNING SUMMARY ──

const RUNNING_SUMMARY_SYSTEM = `You extract key story facts from RPG scene narratives.
Given the narrative and current summary, return JSON:
{
  "new_facts": ["fact1", "fact2"],
  "remove_facts": ["outdated fact to remove"],
  "dominated": true/false
}

Rules:
- "dominated": true if the scene has NO plot impact (e.g. "I do a backflip", "I look around", "I drink beer" with no new info). Set new_facts to [] for dominated scenes.
- "dominated": false if the scene advances plot, introduces NPCs, reveals info, changes character state, or has combat/quest consequences.
- Each fact should be 1 short sentence capturing what happened and why it matters.
- Max 3 new_facts per scene.
- remove_facts: only list facts from the current summary that are now contradicted or superseded.`;

/**
 * Compress a scene narrative into running summary facts.
 * Called async after each scene generation.
 */
function isDominatedScene(narrative, playerAction) {
  if (!narrative || narrative.length < 100) return true;
  if (playerAction === '[WAIT]' || playerAction?.startsWith('[IDLE')) return true;
  // No dialogue and short narrative — likely trivial
  if (!narrative.includes('"') && narrative.length < 300) return true;
  return false;
}

export async function compressSceneToSummary(campaignId, narrative, playerAction, provider, { timeoutMs } = {}) {
  if (isDominatedScene(narrative, playerAction)) {
    return;
  }

  try {
    // Load current summary
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { coreState: true },
    });
    if (!campaign) return;

    const coreState = JSON.parse(campaign.coreState);
    const currentSummary = coreState.gameStateSummary || [];

    const userPrompt = `Player action: "${playerAction || 'N/A'}"

Narrative:
${(narrative || '').slice(0, 1000)}

Current summary (${currentSummary.length} facts):
${currentSummary.map((f, i) => `${i + 1}. ${f}`).join('\n') || '(empty)'}`;

    const result = await callNano(RUNNING_SUMMARY_SYSTEM, userPrompt, provider, { timeoutMs });
    if (!result) return;

    if (result.dominated) {
      // Trivial scene — don't update summary
      return;
    }

    // Apply updates
    let updated = [...currentSummary];

    // Remove superseded facts
    if (result.remove_facts?.length) {
      const toRemove = new Set(result.remove_facts.map(f => f.toLowerCase()));
      updated = updated.filter(f => !toRemove.has(f.toLowerCase()));
    }

    // Add new facts
    if (result.new_facts?.length) {
      for (const fact of result.new_facts) {
        if (typeof fact === 'string' && fact.trim()) {
          updated.push(fact.trim());
        }
      }
    }

    // Cap at 15 most recent facts
    if (updated.length > 15) {
      updated = updated.slice(-15);
    }

    // Save back to coreState
    coreState.gameStateSummary = updated;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { coreState: JSON.stringify(coreState) },
    });
  } catch (err) {
    log.error({ err }, 'Memory compression failed');
  }
}

// ── LOCATION SUMMARY ──

// Normalize a location name for fuzzy dedup. Strips common Polish geo
// qualifiers ("Studnia w dolnym rynku w Vey" → "studnia dolnym rynku") so
// variants of the same place collapse to one canonical record.
function normalizeLocationName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\s+(w|we|na|pod|przy|obok|koło|kolo|do)\s+[a-ząćęłńóśźż][\wąćęłńóśźż-]*\.?/gi, ' ')
    .replace(/[.,;:!?"„"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Find an existing location record whose name fuzzy-matches the given one.
// Prefers exact normalized match; falls back to substring containment so
// "Studnia w dolnym rynku" and "Studnia w dolnym rynku w Vey" collapse.
async function findExistingLocationRecord(campaignId, locationName) {
  const norm = normalizeLocationName(locationName);
  if (!norm) return null;

  const all = await prisma.campaignLocationSummary.findMany({
    where: { campaignId },
    select: { id: true, locationName: true, summary: true, keyNpcs: true, unresolvedHooks: true, sceneCount: true, lastVisitScene: true },
  });

  let partialMatch = null;
  for (const rec of all) {
    const recNorm = normalizeLocationName(rec.locationName);
    if (!recNorm) continue;
    if (recNorm === norm) return rec;
    if (!partialMatch && (recNorm.includes(norm) || norm.includes(recNorm))) {
      partialMatch = rec;
    }
  }
  return partialMatch;
}

const LOCATION_SUMMARY_SYSTEM = `You summarize all events that happened at a specific RPG location.
Given the location name and scene summaries, return JSON:
{
  "summary": "2-4 sentence summary of everything important that happened here",
  "key_npcs": ["NPC names encountered here"],
  "unresolved_hooks": ["plot hooks that remain open"]
}

Be concise. Focus on plot-relevant events, NPC interactions, and unresolved threads.`;

/**
 * Generate/update a location summary when the player leaves a location.
 * Called async when stateChanges.currentLocation changes.
 */
export async function generateLocationSummary(campaignId, locationName, previousLocation, provider, { timeoutMs } = {}) {
  if (!previousLocation || previousLocation === locationName) return;

  try {
    // Find scenes at the previous location
    const scenes = await prisma.campaignScene.findMany({
      where: { campaignId },
      orderBy: { sceneIndex: 'asc' },
      select: { narrative: true, chosenAction: true, sceneIndex: true, stateChanges: true },
    });

    // Filter scenes that happened at this location
    const scenesAtLocation = [];
    let currentLoc = '';
    for (const scene of scenes) {
      const sc = scene.stateChanges ? JSON.parse(scene.stateChanges) : {};
      if (sc.currentLocation) currentLoc = sc.currentLocation;

      if (currentLoc.toLowerCase().includes(previousLocation.toLowerCase()) ||
          previousLocation.toLowerCase().includes(currentLoc.toLowerCase())) {
        const actionSummary = scene.chosenAction ? `Action: ${scene.chosenAction}. ` : '';
        const narrativeSummary = (scene.narrative || '').slice(0, 200);
        scenesAtLocation.push(`[Scene ${scene.sceneIndex}] ${actionSummary}${narrativeSummary}`);
      }
    }

    if (scenesAtLocation.length === 0) return;

    // Fuzzy lookup: collapses "Studnia w dolnym rynku" and "Studnia w dolnym
    // rynku w Vey" into a single record so the compressor doesn't grow a
    // zoo of synonyms.
    const existing = await findExistingLocationRecord(campaignId, previousLocation);
    if (existing && existing.locationName !== previousLocation) {
      log.debug({ canonical: existing.locationName, incoming: previousLocation }, 'Location dedup: merged into existing record');
    }

    const canonicalName = existing?.locationName || previousLocation;

    const userPrompt = `Location: "${canonicalName}"
${existing ? `Previous summary: "${existing.summary}"\n` : ''}
Scenes at this location (${scenesAtLocation.length}):
${scenesAtLocation.join('\n\n')}`;

    const result = await callNano(LOCATION_SUMMARY_SYSTEM, userPrompt, provider, { timeoutMs });
    if (!result?.summary) return;

    const data = {
      summary: result.summary,
      keyNpcs: JSON.stringify(result.key_npcs || []),
      unresolvedHooks: JSON.stringify(result.unresolved_hooks || []),
      sceneCount: scenesAtLocation.length,
      lastVisitScene: scenes[scenes.length - 1]?.sceneIndex || 0,
    };

    if (existing) {
      await prisma.campaignLocationSummary.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.campaignLocationSummary.create({
        data: {
          campaignId,
          locationName: previousLocation,
          ...data,
        },
      });
    }
  } catch (err) {
    log.error({ err }, 'Location summary generation failed');
  }
}

/**
 * Fetch location summary for a location (used by assembleContext). Uses the
 * same fuzzy lookup as the writer so a drifted name on read still hits the
 * canonical record.
 */
export async function getLocationSummary(campaignId, locationName) {
  if (!locationName) return null;

  const summary = await findExistingLocationRecord(campaignId, locationName);

  if (!summary) return null;

  const keyNpcs = JSON.parse(summary.keyNpcs || '[]');
  const hooks = JSON.parse(summary.unresolvedHooks || '[]');

  const lines = [
    `Previous visits summary (${summary.sceneCount} scenes):`,
    summary.summary,
  ];
  if (keyNpcs.length > 0) lines.push(`Key NPCs: ${keyNpcs.join(', ')}`);
  if (hooks.length > 0) lines.push(`Unresolved: ${hooks.join('; ')}`);

  return lines.join('\n');
}

// ── QUEST OBJECTIVE PROGRESS CHECK ──

const QUEST_CHECK_SYSTEM = `You track quest objective progress in an RPG scene.
Given the narrative and unchecked objectives (with their current progress), return JSON:
{
  "updates": [
    {"questId": "id", "objectiveId": "id", "addProgress": "what was accomplished in this scene", "completed": true/false}
  ]
}
Strict rules:
- An objective progresses ONLY if its SPECIFIC target is explicitly mentioned in the narrative:
  * NPC by proper name (e.g. "Borin" — not generic "karczmarz" or "bandyta")
  * Location by proper name (e.g. "Grobowiec Zapomnianych" — not generic "grobowiec")
  * Specific item/object named in the objective text
- Random combat, unrelated NPCs, travel, or scenery changes do NOT count as progress — even if they vaguely match a keyword.
- If the narrative only shares a topic with the objective (e.g. objective mentions "walka z bandytami" and player fights unrelated bandits), return NO update.
- When unsure, return {"updates": []}. Err on the side of silence.
- "addProgress": short sentence describing what was accomplished in THIS scene. Write in the same language as the narrative.
- "completed": true ONLY if the ENTIRE objective description is fully satisfied (all parts done, not just some). Check against both the description AND accumulated progress.
- If the objective has multiple parts (e.g. "find X and deliver to Y"), it is completed only when ALL parts are done.
- If nothing relevant happened, return {"updates": []}.`;

// Presfilter: return true only when the narrative contains at least one
// strong textual marker for any active quest (quest title, proper-noun token
// from the description, or a listed NPC name). If no marker hits, we skip
// the nano call entirely — cheaper AND prevents unrelated-combat false
// positives where the model was eagerly marking progress.
function narrativeMentionsAnyQuest(narrative, activeQuests) {
  if (!narrative || !activeQuests?.length) return false;
  const text = narrative.toLowerCase();

  for (const quest of activeQuests) {
    if (quest.name && text.includes(quest.name.toLowerCase())) return true;
    if (quest.title && text.includes(quest.title.toLowerCase())) return true;
    if (quest.questGiverId && text.includes(String(quest.questGiverId).toLowerCase())) return true;
    if (quest.turnInNpcId && text.includes(String(quest.turnInNpcId).toLowerCase())) return true;

    for (const obj of quest.objectives || []) {
      const desc = (obj.description || '').toLowerCase();
      // Pick proper-noun-ish tokens (length >= 4, starts with letter) from the
      // objective description. Heuristic but good enough to beat pure keyword
      // overlap from generic verbs like "walka"/"znajdz".
      const tokens = desc.split(/\s+/).filter((t) => t.length >= 4 && /^[a-ząćęłńóśźż]/.test(t));
      for (const tok of tokens) {
        if (text.includes(tok)) return true;
      }
    }
  }
  return false;
}

/**
 * Check quest objectives against scene narrative.
 * Returns additional questUpdates that the large model may have missed.
 * Called semi-blocking before the complete event (awaited, ~200-500ms).
 *
 * @param {string} narrative - Scene narrative text
 * @param {string} playerAction - Player's action text
 * @param {Array} activeQuests - Active quests with objectives
 * @param {Array} existingQuestUpdates - questUpdates already produced by the large model
 * @returns {Array} Additional quest updates [{questId, objectiveId, addProgress, completed}]
 */
export async function checkQuestObjectives(narrative, playerAction, activeQuests, existingQuestUpdates = [], provider, { timeoutMs } = {}) {
  if (!narrative || !activeQuests?.length) return [];

  // Presfilter: bail out entirely if no quest marker appears in the narrative.
  // Prevents nano from eagerly progressing quests off random tavern brawls.
  if (!narrativeMentionsAnyQuest(narrative, activeQuests)) return [];

  // Build set of objectives already marked completed by the large model
  const alreadyCompleted = new Set(
    existingQuestUpdates
      .filter(u => u.completed)
      .map(u => `${u.questId}/${u.objectiveId}`)
  );

  // Collect unchecked objectives across all active quests
  const unchecked = [];
  for (const quest of activeQuests) {
    if (!quest.objectives?.length) continue;
    for (const obj of quest.objectives) {
      if (obj.completed) continue;
      if (alreadyCompleted.has(`${quest.id}/${obj.id}`)) continue;
      unchecked.push({
        questId: quest.id,
        objectiveId: obj.id,
        description: obj.description,
        progress: obj.progress || '',
      });
    }
  }

  // Short-circuit: no unchecked objectives → no API call
  if (unchecked.length === 0) return [];

  const objectiveLines = unchecked.map(o => {
    const progressLine = o.progress ? `\n  Progress so far: "${o.progress}"` : '\n  Progress so far: (none)';
    return `- [${o.questId}/${o.objectiveId}] "${o.description}"${progressLine}`;
  }).join('\n');

  const userPrompt = `Player action: "${playerAction || 'N/A'}"

Narrative:
${(narrative || '').slice(0, 800)}

Unchecked objectives:
${objectiveLines}`;

  try {
    const result = await callNano(QUEST_CHECK_SYSTEM, userPrompt, provider, { timeoutMs });
    if (!result?.updates?.length) return [];

    // Validate and normalize updates — only return valid ones matching known objectives
    const knownIds = new Set(unchecked.map(o => `${o.questId}/${o.objectiveId}`));
    return result.updates
      .filter(u => u.questId && u.objectiveId && knownIds.has(`${u.questId}/${u.objectiveId}`))
      .map(u => ({
        questId: u.questId,
        objectiveId: u.objectiveId,
        addProgress: typeof u.addProgress === 'string' ? u.addProgress.slice(0, 200) : '',
        completed: !!u.completed,
        source: 'nano',
      }));
  } catch (err) {
    log.error({ err }, 'Quest objective check failed');
    return [];
  }
}
