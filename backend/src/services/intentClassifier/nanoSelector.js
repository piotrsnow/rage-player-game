/**
 * Nano-model context selector.
 *
 * Called when the heuristic layer returns null (freeform player action).
 * Builds a compact summary of available game data, sends it through the nano
 * model, and normalizes the JSON output into the selection shape that
 * assembleContext() expects.
 */

import { config } from '../../config.js';
import { childLogger } from '../../lib/logger.js';
import { NANO_SYSTEM_PROMPT } from './nanoPrompt.js';

const log = childLogger({ module: 'intentClassifier' });

/**
 * Build a compact summary of available game data for the nano model.
 * Nano uses this to decide what to expand.
 */
export function buildAvailableSummary(coreState, { dbNpcs = [], dbQuests = [], dbCodex = [], prevScene = null } = {}) {
  const parts = [];

  const location = coreState?.world?.currentLocation || 'unknown';
  parts.push(`Location: ${location}`);

  // NPCs — ONLY those at the current location. Classifier doesn't need the
  // full campaign roster; it picks targets relevant to "here and now".
  // Fallback: if none match (e.g. lastLocation missing), show up to 6 alive
  // NPCs so the classifier isn't flying blind on a fresh scene.
  if (dbNpcs.length > 0) {
    const locNorm = String(location || '').toLowerCase().trim();
    const alive = dbNpcs.filter((n) => n.alive !== false);
    const atLocation = locNorm
      ? alive.filter((n) => String(n.lastLocation || '').toLowerCase().trim() === locNorm)
      : [];
    const pool = atLocation.length > 0 ? atLocation : alive.slice(0, 6);
    if (pool.length > 0) {
      const npcList = pool
        .slice(0, 12)
        .map((n) => {
          const role = n.role ? `, ${n.role}` : '';
          return `${n.name} (${n.attitude}${role})`;
        })
        .join('; ');
      parts.push(`NPCs here: ${npcList}`);
    }
  }

  // Quests — scoped: last 3 completed + current + next active. "Current" =
  // first active; "next" = second active (the one waiting in line). Nano
  // doesn't need the full backlog, just the slice relevant to deciding what
  // to expand for this scene.
  if (dbQuests.length > 0) {
    const active = dbQuests.filter((q) => q.status === 'active' || q.status === 'in_progress');
    const completed = dbQuests.filter((q) => q.status === 'completed');
    const lines = [];
    if (completed.length > 0) {
      const recent = completed.slice(-3).map((q) => q.name).join(', ');
      lines.push(`Completed (recent): ${recent}`);
    }
    if (active.length > 0) {
      const current = active[0];
      lines.push(`Current: ${current.name}`);
      if (active.length > 1) {
        lines.push(`Next: ${active[1].name}`);
      }
    }
    if (lines.length > 0) {
      parts.push(`Quests:\n  ${lines.join('\n  ')}`);
    }
  }

  // Codex dropped from classifier — it was a 10-entry catalog bloat. Codex
  // lookup still works downstream (expand_codex fallback via assembleContext)
  // just without classifier pre-selection.

  // Previous scene excerpt — bumped from 350 → 800 chars so the classifier
  // keeps continuity on discussion-style actions ("powiedz mi więcej…") where
  // the previous scene's framing is the signal that the player isn't taking
  // a new combat/trade action.
  if (prevScene?.narrative) {
    const excerpt = String(prevScene.narrative).slice(0, 800);
    const sceneTag = prevScene.sceneIndex != null ? `[Scene ${prevScene.sceneIndex}] ` : '';
    const actionTag = prevScene.chosenAction ? `(action: "${String(prevScene.chosenAction).slice(0, 120)}") ` : '';
    parts.push(`Previous scene: ${sceneTag}${actionTag}${excerpt}${prevScene.narrative.length > 800 ? '…' : ''}`);
  }

  return parts.join('\n');
}

/**
 * Call nano model to select which context to expand for a freeform player action.
 */
export async function selectContextWithNano(playerAction, availableSummary, { provider = 'openai', timeoutMs } = {}) {
  const userPrompt = `Player action: "${playerAction}"\n\nAvailable data:\n${availableSummary}`;

  const controller = timeoutMs ? new AbortController() : null;
  const timeoutHandle = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  timeoutHandle?.unref?.();
  const signal = controller?.signal;

  try {
    if (provider === 'anthropic' && config.apiKeys.anthropic) {
      return await callNanoAnthropic(userPrompt, signal);
    }
    if (config.apiKeys.openai) {
      return await callNanoOpenAI(userPrompt, signal);
    }
    return fallbackSelection(playerAction);
  } catch (err) {
    if (err?.name === 'AbortError') {
      log.warn({ timeoutMs }, 'Nano context selector timed out, using fallback');
    } else {
      log.warn({ err }, 'Nano context selector failed, using fallback');
    }
    return fallbackSelection(playerAction);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function callNanoOpenAI(userPrompt, signal) {
  const apiKey = config.apiKeys.openai;
  if (!apiKey) throw new Error('No OpenAI API key for nano model');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.aiModels.nano.openai,
      messages: [
        { role: 'system', content: NANO_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 250,
      response_format: { type: 'json_object' },
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nano model API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty nano model response');

  const parsed = JSON.parse(content);
  return normalizeSelection(parsed);
}

async function callNanoAnthropic(userPrompt, signal) {
  const apiKey = config.apiKeys.anthropic;
  if (!apiKey) throw new Error('No Anthropic API key for nano model');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.aiModels.nano.anthropic,
      max_tokens: 250,
      system: NANO_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic nano model API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('Empty Anthropic nano model response');

  // Haiku may wrap in markdown code blocks — extract the first JSON object.
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Anthropic nano response');

  const parsed = JSON.parse(jsonMatch[0]);
  return normalizeSelection(parsed);
}

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'veryHard', 'extreme'];

function normalizeSelection(raw) {
  const result = {
    expand_npcs: Array.isArray(raw.expand_npcs) ? raw.expand_npcs.filter((n) => typeof n === 'string') : [],
    expand_quests: Array.isArray(raw.expand_quests) ? raw.expand_quests.filter((n) => typeof n === 'string') : [],
    expand_location: raw.expand_location === true,
    expand_codex: Array.isArray(raw.expand_codex) ? raw.expand_codex.filter((n) => typeof n === 'string') : [],
    needs_memory_search: raw.needs_memory_search === true,
    memory_query: typeof raw.memory_query === 'string' ? raw.memory_query : null,
    roll_skill: typeof raw.roll_skill === 'string' ? raw.roll_skill : null,
    roll_difficulty: VALID_DIFFICULTIES.includes(raw.roll_difficulty) ? raw.roll_difficulty : null,
    combat_enemies: null,
    clear_combat: false,
    quest_offer_likely: false,
  };

  if (raw.combat_enemies && typeof raw.combat_enemies === 'object') {
    result.combat_enemies = {
      location: typeof raw.combat_enemies.location === 'string' ? raw.combat_enemies.location : null,
      budget: typeof raw.combat_enemies.budget === 'number' ? raw.combat_enemies.budget : 4,
      maxDifficulty: typeof raw.combat_enemies.maxDifficulty === 'string' ? raw.combat_enemies.maxDifficulty : 'low',
      count: typeof raw.combat_enemies.count === 'number' ? Math.min(8, Math.max(1, raw.combat_enemies.count)) : 1,
      race: typeof raw.combat_enemies.race === 'string' ? raw.combat_enemies.race : null,
    };
  }
  result.clear_combat = raw.clear_combat === true;
  result.quest_offer_likely = raw.quest_offer_likely === true;

  return result;
}

/**
 * Safe fallback when nano model is unavailable.
 * Expands location + does a memory search on the action text.
 */
function fallbackSelection(playerAction) {
  return {
    expand_npcs: [],
    expand_quests: [],
    expand_location: true,
    expand_codex: [],
    needs_memory_search: true,
    memory_query: playerAction,
    roll_skill: null,
    roll_difficulty: null,
  };
}
