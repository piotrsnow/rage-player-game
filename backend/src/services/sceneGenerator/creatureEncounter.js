/**
 * Creature encounter — lightweight narration of a magical creature appearing.
 *
 * Uses a nano model call (similar to quickBeat) to produce 2-3 sentences of
 * flavour text. No stateChanges, no postSceneWork, no scene-index bump.
 */

import { childLogger } from '../../lib/logger.js';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';
import { loadCampaignState } from './campaignLoader.js';
import { MAGICAL_CREATURES, pickCreature } from '../../../../shared/domain/rpgCreatures.js';

const log = childLogger({ module: 'creatureEncounter' });

function buildCreaturePrompt({ currentLocation, creatureName, behaviorHints, timeOfDay }) {
  const system = `Jesteś AI Game Masterem. Opisz w 2-3 zdaniach krótkie spotkanie z magiczną istotą. Istota może być urocza, zabawna lub groźna. Gracz jeszcze nie reaguje — opisz tylko pojawienie się istoty i jej zachowanie. Output: TYLKO valid JSON: { "narration": "string" }`;

  const hintsText = Array.isArray(behaviorHints) && behaviorHints.length > 0
    ? behaviorHints.join(', ')
    : '';

  const user = `Obecna lokacja: ${currentLocation || '(nieznana)'}. Istota: ${creatureName}. Wskazówki: ${hintsText}. Pora dnia: ${timeOfDay || 'dzień'}. Napisz 2-3 zdania po polsku.`;

  return { system, user };
}

/**
 * Generate a creature encounter narration. Emits SSE-style events via `onEvent`:
 *   { type: 'complete', data }  — narration + creature metadata
 *   { type: 'error', error, code }
 */
export async function generateCreatureEncounter(campaignId, opts = {}, onEvent) {
  const {
    provider = 'openai',
    language = 'pl',
    userApiKeys = null,
    llmNanoTimeoutMs = 15000,
    creatureId = null,
    creatureName: creatureNameOverride = null,
    environments: envOverride = null,
  } = opts;

  try {
    const { coreState } = await loadCampaignState(campaignId);
    const currentLocation = coreState.world?.currentLocation || '';
    const timeOfDay = coreState.world?.timeState?.timeOfDay || 'dzień';

    let creature;
    if (creatureId) {
      creature = MAGICAL_CREATURES.find((c) => c.id === creatureId) || null;
    }
    if (!creature) {
      creature = pickCreature(currentLocation);
    }

    const creatureName = creatureNameOverride || creature.namePl;
    const behaviorHints = creature.behaviorHints;

    const { system, user } = buildCreaturePrompt({
      currentLocation,
      creatureName,
      behaviorHints,
      timeOfDay,
    });

    const timeoutPromise = new Promise((_, reject) => {
      const handle = setTimeout(() => {
        const err = new Error('Creature encounter timed out');
        err.code = 'NANO_TIMEOUT';
        reject(err);
      }, llmNanoTimeoutMs);
      handle.unref?.();
    });

    let raw;
    try {
      const result = await Promise.race([
        callAIJson({
          provider,
          modelTier: 'nano',
          systemPrompt: system,
          userPrompt: user,
          maxTokens: 200,
          temperature: 0.9,
          userApiKeys,
          taskType: 'creature-encounter',
          taskLabel: 'Creature encounter',
        }),
        timeoutPromise,
      ]);
      raw = result.text;
    } catch (err) {
      if (err?.code === 'NANO_TIMEOUT') {
        onEvent({ type: 'error', error: 'Creature encounter timed out', code: 'NANO_TIMEOUT' });
        return;
      }
      throw err;
    }

    const parsed = parseJsonOrNull(raw);
    if (!parsed || typeof parsed.narration !== 'string') {
      log.warn({ campaignId, raw: String(raw).slice(0, 200) }, 'Nano returned invalid creature encounter JSON');
      onEvent({ type: 'error', error: 'AI returned invalid response', code: 'BAD_RESPONSE' });
      return;
    }

    onEvent({
      type: 'complete',
      data: {
        creatureId: creature.id,
        creatureName,
        narration: parsed.narration.trim().slice(0, 600),
        fleePenalty: creature.fleePenalty,
        icon: creature.icon,
        temperament: creature.temperament,
        size: creature.size,
      },
    });
  } catch (err) {
    log.error({ err, campaignId }, 'generateCreatureEncounter failed');
    onEvent({
      type: 'error',
      error: err?.message || 'Creature encounter failed',
      code: err?.code || 'CREATURE_ENCOUNTER_ERROR',
    });
  }
}
