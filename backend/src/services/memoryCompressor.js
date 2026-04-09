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

// ── NANO MODEL CALLER (provider-aware) ──

async function callNano(systemPrompt, userPrompt) {
  // Prefer Anthropic Haiku if available, fall back to OpenAI nano
  if (config.apiKeys.anthropic) {
    return callNanoAnthropic(systemPrompt, userPrompt);
  }
  if (config.apiKeys.openai) {
    return callNanoOpenAI(systemPrompt, userPrompt);
  }
  return null;
}

async function callNanoOpenAI(systemPrompt, userPrompt) {
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
  });

  if (!response.ok) return null;
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content);
}

async function callNanoAnthropic(systemPrompt, userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKeys.anthropic,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
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
export async function compressSceneToSummary(campaignId, narrative, playerAction) {
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

    const result = await callNano(RUNNING_SUMMARY_SYSTEM, userPrompt);
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
    console.error('Memory compression failed:', err.message);
  }
}

// ── LOCATION SUMMARY ──

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
export async function generateLocationSummary(campaignId, locationName, previousLocation) {
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

    // Check for existing summary
    const existing = await prisma.campaignLocationSummary.findUnique({
      where: { campaignId_locationName: { campaignId, locationName: previousLocation } },
    });

    const userPrompt = `Location: "${previousLocation}"
${existing ? `Previous summary: "${existing.summary}"\n` : ''}
Scenes at this location (${scenesAtLocation.length}):
${scenesAtLocation.join('\n\n')}`;

    const result = await callNano(LOCATION_SUMMARY_SYSTEM, userPrompt);
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
    console.error('Location summary generation failed:', err.message);
  }
}

/**
 * Fetch location summary for a location (used by assembleContext).
 */
export async function getLocationSummary(campaignId, locationName) {
  if (!locationName) return null;

  const summary = await prisma.campaignLocationSummary.findUnique({
    where: { campaignId_locationName: { campaignId, locationName } },
  });

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
Rules:
- Only include objectives where something relevant happened in the narrative.
- "addProgress": short sentence describing what was accomplished toward this objective in THIS scene. Write in the same language as the narrative.
- "completed": true ONLY if the ENTIRE objective description is fully satisfied (all parts done, not just some). Check against both the description AND accumulated progress.
- If the objective has multiple parts (e.g. "find X and deliver to Y"), it is completed only when ALL parts are done.
- If nothing relevant happened, return {"updates": []}.`;

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
export async function checkQuestObjectives(narrative, playerAction, activeQuests, existingQuestUpdates = []) {
  if (!narrative || !activeQuests?.length) return [];

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
    const result = await callNano(QUEST_CHECK_SYSTEM, userPrompt);
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
    console.error('Quest objective check failed:', err.message);
    return [];
  }
}
