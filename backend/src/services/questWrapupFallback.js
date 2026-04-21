// Nano-LLM fallback that fills `dialogueIfQuestTargetCompleted` when premium
// omits it but the scene resolved a quest objective (or full quest). Keeps
// the player from ever jumping to a new objective without a narrative beat.
//
// Returns { text, speakerType, speakerName } or null on total failure.

import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'questWrapupFallback' });

const SPEAKER_TYPES = new Set(['narrator', 'npc', 'companion']);

function normalize(str) {
  return String(str || '').toLowerCase().replace(/\s+/g, '_');
}

/**
 * Decide who voices the wrap-up. Priority: quest-giver NPC present → companion
 * in party → narrator voice.
 *
 * @param {{ questGiverId?: string|null, sceneNpcs?: Array, companions?: Array }} ctx
 * @returns {{ type: 'narrator'|'npc'|'companion', name?: string, role?: string, personality?: string }}
 */
export function pickWrapupSpeaker({ questGiverId = null, sceneNpcs = [], companions = [] } = {}) {
  const giverSlug = normalize(questGiverId);
  if (giverSlug && Array.isArray(sceneNpcs)) {
    const match = sceneNpcs.find((n) => n?.name && (normalize(n.name) === giverSlug || normalize(n.id) === giverSlug));
    if (match) {
      return { type: 'npc', name: match.name, role: match.role || null, personality: match.personality || null };
    }
  }
  if (Array.isArray(companions) && companions.length > 0) {
    const comp = companions.find((c) => c?.name);
    if (comp) return { type: 'companion', name: comp.name, role: comp.role || null, personality: null };
  }
  return { type: 'narrator' };
}

/**
 * Hardcoded minimal wrap-up used when nano is unavailable or times out.
 * Bland but always present — never leaves the player with a silent objective flip.
 */
export function buildDeterministicWrapup({ completedObjective, nextObjective, language = 'pl' }) {
  const done = completedObjective?.description || completedObjective?.name || '';
  const next = nextObjective?.description || nextObjective?.name || '';
  if (language === 'pl') {
    const parts = [];
    if (done) parts.push(`${done} — zakończone.`);
    if (next) parts.push(`Kolejny cel: ${next}.`);
    if (parts.length === 0) return null;
    return { text: parts.join(' '), speakerType: 'narrator', speakerName: null };
  }
  const parts = [];
  if (done) parts.push(`${done} — done.`);
  if (next) parts.push(`Next goal: ${next}.`);
  if (parts.length === 0) return null;
  return { text: parts.join(' '), speakerType: 'narrator', speakerName: null };
}

function buildNanoPrompt({ completedObjective, nextObjective, speaker, narratorStyle, language }) {
  const lang = language === 'pl' ? 'Polish' : 'English';
  const langPL = language === 'pl';

  const speakerLine = speaker.type === 'npc'
    ? `NPC "${speaker.name}"${speaker.role ? ` (${speaker.role})` : ''}${speaker.personality ? ` — ${speaker.personality}` : ''}`
    : speaker.type === 'companion'
    ? `towarzysz "${speaker.name}"${speaker.role ? ` (${speaker.role})` : ''}`
    : (langPL ? 'narrator (głos zewnętrzny, 2-osoba)' : 'narrator (external voice, 2nd person)');

  const situation = langPL
    ? `Gracz właśnie ukończył cel: "${completedObjective?.description || completedObjective?.name || 'cel'}".`
      + (nextObjective
        ? `\nKolejny cel w tym queście: "${nextObjective.description || nextObjective.name}"${nextObjective.locationHint ? ` (lokacja: ${nextObjective.locationHint})` : ''}.`
        : '\nTo był ostatni cel tego questa.')
    : `The player just completed the objective: "${completedObjective?.description || completedObjective?.name || 'goal'}".`
      + (nextObjective
        ? `\nNext objective in this quest: "${nextObjective.description || nextObjective.name}"${nextObjective.locationHint ? ` (location: ${nextObjective.locationHint})` : ''}.`
        : '\nThat was the last objective of this quest.');

  const task = langPL
    ? `Napisz 1-3 zdania (po polsku) które:
(a) zamykają fabularnie zakończony cel,
(b) ${nextObjective ? 'naturalnie zapowiadają kolejny cel — gracz ma zrozumieć CZEMU tam idzie' : 'domykają wątek bez wprowadzania nowego hooka'},
(c) ${speaker.type === 'narrator' ? 'w 2-osobie narratorskiej' : `w stylu mówcy "${speaker.name}" — jego głos, jego stosunek do gracza`}.`
    : `Write 1-3 sentences (in English) that:
(a) close the narrative beat of the completed objective,
(b) ${nextObjective ? 'naturally set up the next objective — the player must understand WHY they now need to go there' : 'close the thread without inventing a new hook'},
(c) ${speaker.type === 'narrator' ? 'in 2nd-person narrator voice' : `in the voice of speaker "${speaker.name}" — their tone, their stance toward the player`}.`;

  const system = `You are a narrator for a dark-fantasy tabletop RPG. You write short, grounded, in-character wrap-ups. Respond with ONLY valid JSON.`;

  const user = `${narratorStyle ? `NARRATION STYLE:\n${narratorStyle}\n\n` : ''}SPEAKER: ${speakerLine}

SITUATION:
${situation}

TASK:
${task}

Output ONLY valid JSON:
{"text": "1-3 sentences in ${lang}", "speakerType": "${speaker.type}", "speakerName": ${speaker.name ? `"${speaker.name}"` : 'null'}}`;

  return { system, user };
}

/**
 * Main entry — produce a wrap-up object or deterministic fallback.
 *
 * @param {object} input
 * @param {object} input.completedObjective - { description, name, id }
 * @param {object|null} input.nextObjective - same shape, null if none
 * @param {object} input.speaker - from pickWrapupSpeaker
 * @param {string|null} [input.narratorStyle] - human-readable narrator style block
 * @param {string} [input.language='pl']
 * @param {string} [input.provider='openai']
 * @param {object|null} [input.userApiKeys]
 * @param {number} [input.timeoutMs=3000]
 * @returns {Promise<{text,speakerType,speakerName}|null>}
 */
export async function generateWrapupFallback({
  completedObjective,
  nextObjective = null,
  speaker,
  narratorStyle = null,
  language = 'pl',
  provider = 'openai',
  userApiKeys = null,
  timeoutMs = 3000,
} = {}) {
  if (!completedObjective) return null;

  const fallback = () => buildDeterministicWrapup({ completedObjective, nextObjective, language });

  try {
    const prompts = buildNanoPrompt({ completedObjective, nextObjective, speaker, narratorStyle, language });

    // Race nano against explicit timeout — never block the scene 'complete' event.
    const callPromise = callAIJson({
      provider,
      modelTier: 'nano',
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      maxTokens: 250,
      temperature: 0.7,
      userApiKeys,
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('nano wrap-up timeout')), timeoutMs)
    );
    const { text } = await Promise.race([callPromise, timeoutPromise]);

    const parsed = parseJsonOrNull(text);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.text !== 'string' || !parsed.text.trim()) {
      log.warn({ text: (text || '').slice(0, 200) }, 'nano wrap-up returned unparseable payload; using deterministic');
      return fallback();
    }
    const speakerType = SPEAKER_TYPES.has(parsed.speakerType) ? parsed.speakerType : speaker.type;
    const resolvedName = typeof parsed.speakerName === 'string' && parsed.speakerName.trim()
      ? parsed.speakerName.trim()
      : (speaker.name || null);
    return {
      text: parsed.text.trim().slice(0, 600),
      speakerType,
      speakerName: speakerType === 'narrator' ? null : resolvedName,
    };
  } catch (err) {
    log.warn({ err: err?.message }, 'nano wrap-up failed; using deterministic fallback');
    return fallback();
  }
}
