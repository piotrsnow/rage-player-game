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

// `reasoning: true` routes to the nanoReasoning tier (gpt-5.4-nano) for tasks
// where importance judgment matters and async latency is free — memory/location
// compression. `reasoning: false` routes to the fast nano tier (gpt-4.1-nano)
// for classification-shaped tasks on the critical path — quest objective check.
export async function callNano(systemPrompt, userPrompt, provider, { timeoutMs, maxTokens = 200, reasoning = false } = {}) {
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutHandle = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  timeoutHandle?.unref?.();
  const signal = controller?.signal;

  const tier = reasoning ? 'nanoReasoning' : 'nano';
  const openaiModel = config.aiModels[tier].openai;
  const anthropicModel = config.aiModels[tier].anthropic;

  try {
    // Match nano provider to the main scene provider so that choosing Chat (OpenAI)
    // never triggers Claude Haiku calls and vice versa. If the preferred provider
    // has no key configured, fall back to whichever key is available.
    if (provider === 'anthropic') {
      if (config.apiKeys.anthropic) return await callNanoAnthropic(systemPrompt, userPrompt, signal, maxTokens, anthropicModel);
      if (config.apiKeys.openai) return await callNanoOpenAI(systemPrompt, userPrompt, signal, maxTokens, openaiModel, reasoning);
      return null;
    }
    if (provider === 'openai') {
      if (config.apiKeys.openai) return await callNanoOpenAI(systemPrompt, userPrompt, signal, maxTokens, openaiModel, reasoning);
      if (config.apiKeys.anthropic) return await callNanoAnthropic(systemPrompt, userPrompt, signal, maxTokens, anthropicModel);
      return null;
    }
    // No explicit preference — keep legacy behavior (Anthropic first)
    if (config.apiKeys.anthropic) return await callNanoAnthropic(systemPrompt, userPrompt, signal, maxTokens, anthropicModel);
    if (config.apiKeys.openai) return await callNanoOpenAI(systemPrompt, userPrompt, signal, maxTokens, openaiModel, reasoning);
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

async function callNanoOpenAI(systemPrompt, userPrompt, signal, maxTokens, model, reasoning = false) {
  // Reasoning-family models (gpt-5.x, o-series) reject temperature!=1 and
  // require max_completion_tokens. Non-reasoning chat models accept both
  // field names, so we standardize on max_completion_tokens and skip
  // temperature only for reasoning tier.
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };
  if (!reasoning) body.temperature = 0;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKeys.openai}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    // Surface HTTP failures — silent `return null` lost hours of debugging
    // when `gpt-5.4-nano` rejected `temperature: 0` + `max_tokens` on every
    // post-scene call for an entire campaign.
    const errBody = await response.text().catch(() => '');
    log.warn(
      { status: response.status, model, bodyPreview: errBody.slice(0, 500) },
      'callNanoOpenAI: HTTP error',
    );
    return null;
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content);
}

async function callNanoAnthropic(systemPrompt, userPrompt, signal, maxTokens, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKeys.anthropic,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    log.warn(
      { status: response.status, model, bodyPreview: errBody.slice(0, 500) },
      'callNanoAnthropic: HTTP error',
    );
    return null;
  }
  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) return null;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

// ── RUNNING SUMMARY ──

// Unified post-scene extractor. One nano call replaces what used to be two:
// compressSceneToSummary (player-POV facts + journal + world facts + codex +
// knowledge + needs) and updateDmMemoryFromScene (GM-POV memory + hooks).
//
// `new_facts` / `journal` / `memoryEntries` all ended up capturing the same
// beats in practice — collapsed into one `memory` list with importance tag.
// GM-perspective notes with status lifecycle (planned/introduced/waiting/
// resolved) remain in a separate `gmNotes` list because status matters for
// dmAgent lifecycle. Hooks are still side-channel.
const RUNNING_SUMMARY_SYSTEM = `You extract PLOT-RELEVANT signals from RPG scene narratives.

Return JSON:
{
  "dominated": true/false,
  "memory": [{"text":"...","importance":"minor|major"}],
  "removeMemory": ["outdated fact text"],
  "gmNotes": [{"summary":"...","status":"planned|introduced|waiting|resolved","plannedFor":"when/where it matters"|null}],
  "hookAdditions": [{"kind":"quest|intrigue|reveal|encounter","summary":"...","idealTiming":"..."|null,"priority":"low|normal|high"}],
  "resolvedHookIds": ["uuid-from-pending-hooks"],
  "worldFacts": [""],
  "codexFragments": [{"id":"snake_case","name":"","category":"person|place|artifact|event|creature|concept","fragment":{"content":"","source":"NPC name","aspect":"history|description|location|weakness|rumor|technical|political"},"tags":[]}],
  "knowledgeEvents": [{"summary":"","importance":"low|medium|high","tags":[]}],
  "knowledgeDecisions": [{"choice":"","consequence":""}],
  "needsRestoration": {"hunger":50} or null
}

BUCKET ROUTING — each fact picks EXACTLY ONE bucket. Do NOT echo the same beat across multiple buckets. When a fact could fit several, pick the MOST SPECIFIC one below and skip the others:

1. \`hookAdditions\` — the scene OPENED a new narrative thread that needs follow-up later. Max 2.
2. \`resolvedHookIds\` — an existing pending hook was DELIVERED on this scene. Copy ids verbatim from the "Pending hooks" list.
3. \`knowledgeDecisions\` — an inflection-point CHOICE the player made with a stated consequence.
4. \`codexFragments\` — concrete LORE explicitly stated by an NPC in dialogue (history, weakness, political fact, rumor).
5. \`worldFacts\` — concrete world info (place names, geography, political structure) NOT spoken by an NPC and NOT plot-pivotal — i.e. context only.
6. \`knowledgeEvents\` — story-pivotal moment that doesn't fit codex/decision but matters for semantic recall later.
7. \`memory\` — fallback for any other "WHO did WHAT with WHAT RESULT" beat. Importance 'major' = plot-pivotal, 'minor' = flavor-useful.

THE ONE ALLOWED OVERLAP: \`gmNotes\` may mirror a \`memory\` beat — same event, GM-framing (planned/introduced/waiting/resolved). Do not duplicate gmNotes content into any other bucket.

Examples of correct routing:
- "Taelor told Cedric to seek Liryana about a rune fragment" — opens a thread → \`hookAdditions\` (summary: "Talk to Liryana about the rune fragment"). The act of receiving the lead → \`memory\` (importance: major). gmNote: "[introduced] Taelor jako źródło wskazówek". NOTHING in worldFacts/codex/knowledgeEvents/knowledgeDecisions — the hook already captures it.
- "Liryana lives at Zielarnia pod Kopułą" said by Taelor — \`codexFragments\` (NPC-revealed lore about a person). NOT also worldFacts.
- "Cedric chose to go to Liryana before the ruins" — that's a \`knowledgeDecision\` (consequence: gets a lead first). NOT also memory of the same beat.
- "Grimwald defeated 3 bandits on the road to Brost" — \`memory\` only.

MEMORY rules:
- FACT: "Grimwald learned from Marta that Barbara lives in Czarnokorzeń"
- FACT: "Marta refused to reveal how she knows about Barbara" (blocked info still counts)
- NOT A FACT: "People at the fire flinched" (atmosphere)
- NOT A FACT: "Grimwald asked about Mazak" (player action without answer = nothing happened)
- Max 5 entries per scene. If nothing happened, return [].

GM NOTES rules:
- Only things the narrator INTENTIONALLY set up, introduced, or delivered on.
- status values: 'planned' (set up for later), 'introduced' (just made canonical), 'waiting' (pending seed), 'resolved' (paid off).
- Max 3 entries per scene.

OTHER:
- hookAdditions: do NOT include an id — the database assigns one.
- needsRestoration: positive deltas IF character ate (+50-70 hunger), drank (+40-60 thirst), slept (+80-100 rest), bathed (+80 hygiene). null if none.

Rules:
- dominated: true if scene has NO new information, NO state change, NO NPC reveals, NO combat result. A dramatic question with no answer = dominated.
- removeMemory: only memory entries contradicted/superseded by this scene.
- Polish language where content is Polish. Keep entries ≤ 120 chars each.
- Empty array / null when nothing fits — do not fabricate.`;

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

/**
 * Compress a scene narrative into running summary facts AND extract state
 * changes (journal, knowledge, world facts, codex, needs restoration).
 * Called async after each scene generation. Returns extracted state for
 * the caller to process.
 */
export async function compressSceneToSummary(campaignId, narrative, playerAction, provider, { timeoutMs, sceneIndex, wrapupText = null } = {}) {
  if (isDominatedScene(narrative, playerAction)) {
    log.info({ campaignId, sceneIndex, playerAction }, 'compressSceneToSummary SKIP (dominated)');
    return null;
  }


  try {
    log.info({ campaignId, sceneIndex, narrativeLen: narrative?.length }, 'compressSceneToSummary START');
    // Load current summary
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { coreState: true },
    });
    if (!campaign) return null;

    const coreState = (campaign.coreState && typeof campaign.coreState === 'object')
      ? campaign.coreState
      : {};
    const currentSummary = coreState.gameStateSummary || [];
    // Back-compat: summary can be legacy string[] or new [{fact, sceneIndex}].
    // Normalize for prompt display and remove-match.
    const factText = (item) => (typeof item === 'string' ? item : item?.fact || '');

    // Include codex summary so nano avoids duplicate fragments
    const codexSummary = (coreState.world?.codexSummary || [])
      .slice(0, 5)
      .map(e => `${e.name}: known=${(e.knownAspects || []).join(',')}`)
      .join('; ');

    // Include active quest names + current objectives for context
    const activeQuests = coreState.quests?.active || [];
    const questContext = activeQuests.slice(0, 3).map(q => {
      const remaining = (q.objectives || []).filter(o => !o.completed);
      const nextObj = remaining.length > 0 ? remaining[0].description : 'all done';
      return `${q.name}: ${nextObj}`;
    }).join('; ');

    // Premium's `dialogueIfQuestTargetCompleted` is a short epilogue played
    // after dialogueSegments — it closes a resolved objective AND often
    // teases the next one ("Mireia zgodziła się opowiedzieć o Jaskini
    // Szeptów"). CampaignScene schema doesn't persist it, so without folding
    // it in here the teaser dies. Appended AFTER the 1000-char narrative
    // slice so a long narrative can't crowd it out.
    const narrativeBlock = wrapupText
      ? `${(narrative || '').slice(0, 1000)}\n\n[Quest wrap-up / next-objective teaser]: ${wrapupText}`
      : (narrative || '').slice(0, 1000);
    const userPrompt = `Player action: "${playerAction || 'N/A'}"

Narrative:
${narrativeBlock}

Current summary (${currentSummary.length} facts):
${currentSummary.map((f, i) => `${i + 1}. ${factText(f)}`).join('\n') || '(empty)'}${questContext ? `\n\nActive quests (next objective): ${questContext}` : ''}${codexSummary ? `\nKnown codex (do not duplicate): ${codexSummary}` : ''}`;

    // Reasoning tier + bumped maxTokens: 5.4-nano spends thinking tokens
    // before JSON output AND we now emit more fields (memory + gmNotes +
    // hooks + world/codex/knowledge/needs). 1800 leaves headroom against
    // mid-JSON truncation.
    const result = await callNano(RUNNING_SUMMARY_SYSTEM, userPrompt, provider, { timeoutMs, maxTokens: 1800, reasoning: true });
    if (!result) {
      log.warn({ campaignId, sceneIndex }, 'compressSceneToSummary: nano returned null');
      return null;
    }

    if (result.dominated) {
      log.info({ campaignId, sceneIndex }, 'compressSceneToSummary: dominated flag set by nano');
      return null;
    }

    // ── Apply MEMORY updates to gameStateSummary ──
    let updated = [...currentSummary];
    const memoryEntries = Array.isArray(result.memory) ? result.memory : [];

    if (result.removeMemory?.length) {
      const toRemove = new Set(result.removeMemory.map((t) => (typeof t === 'string' ? t.toLowerCase() : '')));
      updated = updated.filter((item) => !toRemove.has(factText(item).toLowerCase()));
    }

    for (const m of memoryEntries) {
      const text = typeof m === 'string' ? m : m?.text;
      if (typeof text !== 'string' || !text.trim()) continue;
      // Tag with sceneIndex so worldBlock's buildRecentContextBlock can exclude
      // facts from the last scene (shown in full narrative form — no need to
      // duplicate as compressed fact). `importance` carried through for any
      // future use (e.g., "keep major facts longer than minor in FIFO 15").
      updated.push({
        fact: text.trim(),
        sceneIndex: typeof sceneIndex === 'number' ? sceneIndex : null,
        importance: m?.importance === 'major' ? 'major' : 'minor',
      });
    }

    if (updated.length > 15) {
      updated = updated.slice(-15);
    }
    coreState.gameStateSummary = updated;

    // ── World facts (append to coreState.world.worldFacts) ──
    const worldFactsList = Array.isArray(result.worldFacts) ? result.worldFacts : [];
    if (worldFactsList.length) {
      if (!coreState.world) coreState.world = {};
      if (!coreState.world.worldFacts) coreState.world.worldFacts = [];
      for (const wf of worldFactsList) {
        if (typeof wf === 'string' && wf.trim()) {
          coreState.world.worldFacts.push(wf.trim());
        }
      }
    }

    // ── Journal: derived from first 'major' memory entry if none explicit ──
    // The merged prompt no longer emits a standalone `journal` field — player-
    // POV significance lives in memory[importance='major']. Pick the first one
    // as the journal bullet for this scene (back-compat with existing journal
    // display + CampaignKnowledge flow).
    const majorMemory = memoryEntries.find((m) => m?.importance === 'major' && typeof m?.text === 'string' && m.text.trim());
    if (majorMemory) {
      if (!coreState.journalEntries) coreState.journalEntries = [];
      coreState.journalEntries.push(majorMemory.text.trim());
    }

    // ── Character needs ──
    const needsRestoration = result.needsRestoration && typeof result.needsRestoration === 'object'
      ? result.needsRestoration
      : null;
    if (needsRestoration) {
      const char = coreState.character;
      if (char?.needs) {
        for (const [key, delta] of Object.entries(needsRestoration)) {
          if (key in char.needs && typeof delta === 'number' && delta > 0) {
            char.needs[key] = Math.min(100, (char.needs[key] ?? 0) + delta);
          }
        }
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { coreState },
    });

    // ── DM agent: persist gmNotes + hooks. Fire-and-forget: dmAgent updates
    // are soft signals and shouldn't block the scene commit. Errors are
    // logged by updateDmAgent itself.
    const gmNotes = Array.isArray(result.gmNotes) ? result.gmNotes : [];
    const hookAdditions = Array.isArray(result.hookAdditions) ? result.hookAdditions : [];
    const resolvedHookIds = Array.isArray(result.resolvedHookIds) ? result.resolvedHookIds : [];
    if (gmNotes.length || hookAdditions.length || resolvedHookIds.length) {
      // Lazy import — keeps the existing circular-free dep shape. dmMemoryService
      // clamps + persists via the same path as the old updateDmMemoryFromScene.
      import('./livingWorld/dmMemoryService.js').then(({ updateDmAgent }) =>
        updateDmAgent(campaignId, { memoryEntries: gmNotes, hookAdditions, resolvedHookIds })
      ).catch((err) => log.warn({ err: err?.message, campaignId }, 'dmAgent persist failed (non-fatal)'));
    }

    const knowledgeEventsList = Array.isArray(result.knowledgeEvents) ? result.knowledgeEvents : [];
    const knowledgeDecisionsList = Array.isArray(result.knowledgeDecisions) ? result.knowledgeDecisions : [];
    const codexFragmentsList = Array.isArray(result.codexFragments) ? result.codexFragments : [];

    log.info({
      campaignId,
      sceneIndex,
      facts: updated.length,
      newMemory: memoryEntries.length,
      removed: result.removeMemory?.length || 0,
      worldFacts: worldFactsList.length,
      gmNotes: gmNotes.length,
      hooks: hookAdditions.length,
      resolvedHooks: resolvedHookIds.length,
      knowledge: knowledgeEventsList.length + knowledgeDecisionsList.length,
      codex: codexFragmentsList.length,
    }, 'compressSceneToSummary DONE');

    // Return extracted state for further processing (knowledge, codex) by
    // postSceneWork's phase 6 fan-out into CampaignKnowledge + CampaignCodex.
    return {
      knowledgeUpdates: (knowledgeEventsList.length || knowledgeDecisionsList.length)
        ? { events: knowledgeEventsList, decisions: knowledgeDecisionsList }
        : null,
      codexUpdates: codexFragmentsList,
    };
  } catch (err) {
    log.error({ err }, 'Memory compression failed');
    return null;
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
      const sc = (scene.stateChanges && typeof scene.stateChanges === 'object') ? scene.stateChanges : {};
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

    // Reasoning tier — location summary is synthesis + unresolved-thread
    // detection; async, no latency concern.
    const result = await callNano(LOCATION_SUMMARY_SYSTEM, userPrompt, provider, { timeoutMs, maxTokens: 500, reasoning: true });
    if (!result?.summary) return;

    const data = {
      summary: result.summary,
      keyNpcs: result.key_npcs || [],
      unresolvedHooks: result.unresolved_hooks || [],
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

  const keyNpcs = Array.isArray(summary.keyNpcs) ? summary.keyNpcs : [];
  const hooks = Array.isArray(summary.unresolvedHooks) ? summary.unresolvedHooks : [];

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
    // Fast nano tier — quest check is semi-blocking (200-500ms budget before
    // final SSE event). Classification-shaped task; non-reasoner is the right
    // trade-off. Pre-filter (narrativeMentionsAnyQuest) guards against false positives.
    const result = await callNano(QUEST_CHECK_SYSTEM, userPrompt, provider, { timeoutMs, maxTokens: 300, reasoning: false });
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
