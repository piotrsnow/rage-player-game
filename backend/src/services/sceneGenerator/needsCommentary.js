/**
 * Post-scene needs commentary — fires after a full scene when any character
 * need drops below 10. A nano model produces a short, snarky narrator quip
 * about the character's physical state. Pure flavor: no state changes, no
 * quest hooks, no new facts.
 */

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';

const log = childLogger({ module: 'needsCommentary' });

const NEED_KEYS = ['hunger', 'thirst', 'bladder', 'rest'];
const NEED_THRESHOLD = 10;

export function hasCriticalNeeds(characterNeeds) {
  if (!characterNeeds || typeof characterNeeds !== 'object') return false;
  return NEED_KEYS.some((k) => (characterNeeds[k] ?? 100) < NEED_THRESHOLD);
}

function buildNeedsCommentaryPrompt({ characterNeeds, characterName, recentNarratives, language }) {
  const lang = language === 'pl' ? 'po polsku' : 'in English';
  const needsLines = NEED_KEYS
    .filter((k) => (characterNeeds[k] ?? 100) < NEED_THRESHOLD)
    .map((k) => `${k}: ${characterNeeds[k] ?? 0}/100`);

  const scenesBlock = recentNarratives.length > 0
    ? recentNarratives.map((n, i) => `${i + 1}. ${n}`).join('\n')
    : '(brak)';

  const system = `Jesteś uszczypliwym komentatorem przygód RPG. Twoja rola: napisać JEDNĄ krótką, złośliwą uwagę o fizycznym stanie bohatera.

ŚCISŁE OGRANICZENIA:
1. Komentarz: 1-2 zdania, ${lang}. Ton: sarkastyczny narrator / komentator sportowy.
2. Odnoś się KONKRETNIE do potrzeb poniżej progu (głód, pragnienie, pęcherz, sen). Bądź kreatywny — nie powtarzaj się.
3. NIE dawaj rad, NIE sugeruj akcji, NIE wprowadzaj fabuły. To TYLKO uszczypliwy komentarz.
4. Output: TYLKO valid JSON: {"commentary": "string (1-2 zdania)"}`;

  const user = `Postać: ${characterName || 'Bohater'}

Krytyczne potrzeby:
${needsLines.join('\n')}

Ostatnie sceny (kontekst, żebyś wiedział co się dzieje):
${scenesBlock}

Napisz komentarz.`;

  return { system, user };
}

/**
 * Generate a snarky needs commentary. Returns the saved row data on success,
 * or null on any failure (non-throwing — callers treat this as best-effort).
 */
export async function runNeedsCommentary(campaignId, {
  characterNeeds,
  characterName = null,
  provider = 'openai',
  language = 'pl',
  userApiKeys = null,
  llmNanoTimeoutMs = 15000,
  sceneIndex = null,
  characterId = null,
} = {}) {
  if (!hasCriticalNeeds(characterNeeds)) return null;

  try {
    const recentScenes = await prisma.campaignScene.findMany({
      where: { campaignId },
      orderBy: { sceneIndex: 'desc' },
      take: 3,
      select: { narrative: true },
    });
    const recentNarratives = recentScenes
      .reverse()
      .map((s) => (s.narrative || '').slice(0, 300));

    const { system, user } = buildNeedsCommentaryPrompt({
      characterNeeds,
      characterName,
      recentNarratives,
      language,
    });

    const timeoutPromise = new Promise((_, reject) => {
      const h = setTimeout(() => {
        const err = new Error('Needs commentary timed out');
        err.code = 'NANO_TIMEOUT';
        reject(err);
      }, llmNanoTimeoutMs);
      h.unref?.();
    });

    let raw;
    try {
      const result = await Promise.race([
        callAIJson({
          provider,
          modelTier: 'nano',
          taskCategory: 'needsCommentary',
          systemPrompt: system,
          userPrompt: user,
          maxTokens: 200,
          temperature: 0.9,
          userApiKeys,
          taskType: 'needs-commentary',
          taskLabel: 'Needs commentary',
        }),
        timeoutPromise,
      ]);
      raw = result.text;
    } catch (err) {
      if (err?.code === 'NANO_TIMEOUT') {
        log.info({ campaignId }, 'Needs commentary timed out');
        return null;
      }
      throw err;
    }

    const parsed = parseJsonOrNull(raw);
    if (!parsed || typeof parsed.commentary !== 'string' || !parsed.commentary.trim()) {
      log.warn({ campaignId, raw: String(raw).slice(0, 200) }, 'Nano returned invalid needs-commentary JSON');
      return null;
    }

    const commentaryText = parsed.commentary.trim().slice(0, 500);

    const needsSnapshot = {};
    for (const k of NEED_KEYS) {
      if (characterNeeds[k] != null) needsSnapshot[k] = characterNeeds[k];
    }

    const saved = await prisma.campaignNeedsCommentary.create({
      data: {
        campaignId,
        sceneIndex: sceneIndex ?? -1,
        characterId: characterId || null,
        needsSnapshot,
        commentaryText,
      },
    });

    return {
      id: saved.id,
      commentaryText,
      needsSnapshot,
      sceneIndex: saved.sceneIndex,
      createdAt: saved.createdAt,
    };
  } catch (err) {
    log.error({ err, campaignId }, 'runNeedsCommentary failed');
    return null;
  }
}
