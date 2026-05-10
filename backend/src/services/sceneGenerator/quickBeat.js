/**
 * Quick beat ("mała akcja") — lightweight RP-beat handler.
 *
 * Bypasses the full scene-gen pipeline:
 *   - nano model (~1-2s vs premium 5-15s)
 *   - no postSceneWork (no embedding, no memory compression, no Living World ticks)
 *   - no imageGen
 *   - no scene index bump (writes to CampaignQuickBeat instead of CampaignScene)
 *   - no stateChanges except optional `timeAdvance` (0-0.25h, applied FE-side
 *     via the existing applyStateChangesHandler reducer when ADD_QUICK_BEAT
 *     dispatches)
 *
 * Hard escalation: any combat / travel / trade / dungeon-nav intent rejects
 * the request with `ESCALATE_TO_SCENE` so the FE can fall through to the
 * normal `generateScene` path.
 *
 * NPC whitelist: nano output that names an NPC not present in the current
 * scene roster gets stripped client-side; we never let nano invent characters.
 */

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { callAIJson, parseJsonOrNull } from '../aiJsonCall.js';
import { detectCombatIntent } from '../../../../shared/domain/combatIntent.js';
import { parseMovementIntent } from '../../../../shared/domain/movementIntent.js';
import {
  detectTravelIntent,
  detectDungeonNavigateIntent,
} from '../intentClassifier.js';
import { loadCampaignState } from './campaignLoader.js';

const log = childLogger({ module: 'quickBeat' });

const QUICK_BEAT_LIMIT = 5;

// Hard markers that should never be a quick beat — they all imply scene-level
// state changes (combat, scene transitions, idle world events, etc).
const HARD_MARKER_REGEX = /^\[(ATTACK|INITIATE COMBAT|TALK|WAIT|CONTINUE|IDLE_WORLD_EVENT|FIRST_SCENE|Combat resolved)/i;

const TRADE_REGEX = /\b(kupuj[eę]?|kupi[eęć]?|zakup(?:uj)?[eęia]?|sprzedaj[eę]?|sprzeda(?:j|ć)?|handluj[eę]?|targuj[eę]?|kupcem|sklepie|buy|sell|haggle|trade|shop|merchant|purchase|barter)\b/iu;

const REST_REGEX = /\b(śpi[eę]|rozbijam ob[oó]z|odpoczywam d[lł]u[gż]|long rest|d[lł]ugi odpoczynek|sleep)\b/iu;

/**
 * Decide whether the player action MUST go through the full scene pipeline.
 * Returns { escalate: boolean, reason?: string }.
 */
export function shouldEscalateQuickBeat(playerAction, entityTags = null) {
  if (!playerAction || typeof playerAction !== 'string') {
    return { escalate: true, reason: 'empty_action' };
  }
  const trimmed = playerAction.trim();
  if (!trimmed) return { escalate: true, reason: 'empty_action' };

  if (HARD_MARKER_REGEX.test(trimmed)) {
    return { escalate: true, reason: 'system_marker' };
  }

  // Spell entity tag → casting → not a quick beat.
  if (Array.isArray(entityTags)) {
    for (const tag of entityTags) {
      if (tag?.kind === 'spell') return { escalate: true, reason: 'spell_cast' };
    }
  }

  if (detectCombatIntent(trimmed)) return { escalate: true, reason: 'combat' };
  if (detectTravelIntent(trimmed)) return { escalate: true, reason: 'travel_named' };
  if (parseMovementIntent(trimmed)) return { escalate: true, reason: 'travel_vector' };
  if (detectDungeonNavigateIntent(trimmed)) return { escalate: true, reason: 'dungeon_nav' };
  if (TRADE_REGEX.test(trimmed)) return { escalate: true, reason: 'trade' };
  if (REST_REGEX.test(trimmed)) return { escalate: true, reason: 'long_rest' };

  // Quick beats are short by definition. 400 chars is a generous ceiling
  // ("rozglądam się dookoła i zwracam uwagę na detale w pomieszczeniu" ~70).
  if (trimmed.length > 400) {
    return { escalate: true, reason: 'too_long' };
  }

  return { escalate: false };
}

/**
 * Count consecutive quick beats since the last full scene for this campaign.
 * Used both for the FE streak indicator and the BE-side rate limit.
 */
export async function countConsecutiveQuickBeats(campaignId) {
  const lastScene = await prisma.campaignScene.findFirst({
    where: { campaignId },
    orderBy: { sceneIndex: 'desc' },
    select: { createdAt: true },
  });
  const where = { campaignId };
  if (lastScene?.createdAt) {
    where.createdAt = { gt: lastScene.createdAt };
  }
  return prisma.campaignQuickBeat.count({ where });
}

function buildQuickBeatPrompt({
  currentLocation,
  presentNpcs,
  lastSceneSnippet,
  recentBeats,
  characterName,
  playerAction,
  language,
}) {
  const lang = language === 'pl' ? 'po polsku' : 'in English';
  const npcList = presentNpcs.length > 0
    ? presentNpcs.map((n) => `- ${n.name}${n.role ? ` (${n.role})` : ''}${n.gender ? ` [${n.gender}]` : ''}`).join('\n')
    : '(brak NPC w obecnej scenie)';
  const beatsList = recentBeats.length > 0
    ? recentBeats.map((b) => `- gracz: "${b.playerAction}" → "${b.narrationText}"${b.npcReply ? ` (${b.npcSpeaker}: "${b.npcReply}")` : ''}`).join('\n')
    : '(żadnych)';

  const system = `Jesteś AI Game Masterem prowadzącym RPG. Twoja rola TERAZ: napisać krótki RP-beat reagujący na drobną akcję gracza (tzw. "mała akcja").

ŚCISŁE OGRANICZENIA:
1. Narracja: 1-3 zdania, ${lang}, w 3. osobie. ŻADNYCH dialogów w narration — opis tego co widzi/czuje gracz.
2. Możesz dorzucić KRÓTKĄ odpowiedź NPC (jedno zdanie) jeśli ma sens — TYLKO z listy obecnych NPC poniżej. NIGDY nie wymyślaj nowych postaci.
3. NIE wprowadzaj nowych lokacji, NIE rozpoczynaj walki/handlu/podróży, NIE oferuj questów, NIE zmieniaj stanu fabuły.
4. ŻADNYCH rzutów kostką — to jest mała akcja, nie test umiejętności.
5. timeAdvance: 0 (akcja niemal natychmiastowa) albo 0.05-0.25 (krótkie czynności typu wypicie kufla, rozglądnięcie się).
6. Output: TYLKO valid JSON o schemacie poniżej. Bez prefiksów, bez markdown.

SCHEMA:
{
  "narration": "string (1-3 zdania)",
  "npcSpeaker": "string|null (imię z listy poniżej lub null jeśli żaden NPC nie reaguje)",
  "npcReply": "string|null (jedno zdanie jeśli npcSpeaker jest podany, inaczej null)",
  "timeAdvance": 0 | 0.05 | 0.1 | 0.15 | 0.2 | 0.25
}`;

  const user = `Obecna lokacja: ${currentLocation || '(nieznana)'}
Postać gracza: ${characterName || 'Bohater'}

Obecni NPC (whitelist — możesz przywołać tylko tych):
${npcList}

Ostatnia pełna scena (kontekst, NIE kontynuuj jej dosłownie):
"${lastSceneSnippet || '(brak)'}"

Ostatnie quick-beats w tej scenie (chronologicznie):
${beatsList}

Akcja gracza (mała akcja): "${playerAction}"`;

  return { system, user };
}

/**
 * Pick top-N NPCs likely present in the current scene. We look at the
 * dbNpcs roster (campaign sandbox) for those whose `lastLocation` matches
 * the current location. Cap at 8 so the prompt stays short.
 */
function pickPresentNpcs(dbNpcs, currentLocation) {
  if (!Array.isArray(dbNpcs) || dbNpcs.length === 0) return [];
  const here = (currentLocation || '').toLowerCase().trim();
  const present = dbNpcs.filter((n) =>
    n.alive !== false
    && (!here || (n.lastLocation || '').toLowerCase().trim() === here),
  );
  return present.slice(0, 8).map((n) => ({
    name: n.name,
    role: n.role || null,
    gender: n.gender || null,
  }));
}

/**
 * Run a quick-beat handler. Emits SSE-style events via `onEvent`:
 *   { type: 'escalate', reason }   — caller must fall back to full scene
 *   { type: 'complete', data }     — saved beat row + payload
 *   { type: 'error', error, code } — failure
 */
export async function runQuickBeat(campaignId, playerAction, options = {}, onEvent) {
  const {
    provider = 'openai',
    language = 'pl',
    userApiKeys = null,
    llmNanoTimeoutMs = 15000,
    entityTags = null,
    characterId = null,
  } = options;

  try {
    const escalation = shouldEscalateQuickBeat(playerAction, entityTags);
    if (escalation.escalate) {
      onEvent({ type: 'escalate', reason: escalation.reason });
      return;
    }

    const consecutive = await countConsecutiveQuickBeats(campaignId);
    if (consecutive >= QUICK_BEAT_LIMIT) {
      onEvent({ type: 'escalate', reason: 'streak_limit' });
      return;
    }

    const {
      coreState,
      activeCharacterId,
      dbNpcs,
    } = await loadCampaignState(campaignId);

    const currentLocation = coreState.world?.currentLocation || '';
    const presentNpcs = pickPresentNpcs(dbNpcs, currentLocation);
    const characterName = coreState.character?.name || null;

    // Pull last full scene + last 3 beats since it for context.
    const lastScene = await prisma.campaignScene.findFirst({
      where: { campaignId },
      orderBy: { sceneIndex: 'desc' },
      select: { sceneIndex: true, narrative: true, createdAt: true },
    });
    const parentSceneIndex = lastScene?.sceneIndex ?? -1;
    const lastSceneSnippet = (lastScene?.narrative || '').slice(0, 600);
    const recentBeats = lastScene
      ? await prisma.campaignQuickBeat.findMany({
        where: { campaignId, createdAt: { gt: lastScene.createdAt } },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { playerAction: true, narrationText: true, npcSpeaker: true, npcReply: true },
      })
      : [];
    recentBeats.reverse();

    const { system, user: userPrompt } = buildQuickBeatPrompt({
      currentLocation,
      presentNpcs,
      lastSceneSnippet,
      recentBeats,
      characterName,
      playerAction,
      language,
    });

    // callAIJson doesn't accept an AbortSignal; race against a timeout so
    // a hung provider can't park the request indefinitely. On timeout we
    // surface NANO_TIMEOUT — the FE shows a soft toast and the player can
    // retry; we never silently fall through to a full scene.
    const timeoutPromise = new Promise((_, reject) => {
      const handle = setTimeout(() => {
        const err = new Error('Quick beat timed out');
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
          userPrompt,
          maxTokens: 220,
          temperature: 0.8,
          userApiKeys,
          taskType: 'quick-beat',
          taskLabel: 'Quick beat',
        }),
        timeoutPromise,
      ]);
      raw = result.text;
    } catch (err) {
      if (err?.code === 'NANO_TIMEOUT') {
        onEvent({ type: 'error', error: 'Quick beat timed out', code: 'NANO_TIMEOUT' });
        return;
      }
      throw err;
    }

    const parsed = parseJsonOrNull(raw);
    if (!parsed || typeof parsed.narration !== 'string') {
      log.warn({ campaignId, raw: String(raw).slice(0, 200) }, 'Nano returned invalid quick-beat JSON');
      onEvent({ type: 'error', error: 'AI returned invalid response', code: 'BAD_RESPONSE' });
      return;
    }

    // Whitelist enforcement — strip NPC reply if speaker not present.
    const npcByLowerName = new Map(presentNpcs.map((n) => [n.name.toLowerCase(), n]));
    let npcSpeaker = typeof parsed.npcSpeaker === 'string' ? parsed.npcSpeaker.trim() : null;
    let npcReply = typeof parsed.npcReply === 'string' ? parsed.npcReply.trim() : null;
    let npcSpeakerGender = null;
    const matchedNpc = npcSpeaker ? npcByLowerName.get(npcSpeaker.toLowerCase()) : null;
    if (npcSpeaker && !matchedNpc) {
      log.info({ campaignId, npcSpeaker }, 'Stripping unknown NPC from quick beat');
      npcSpeaker = null;
      npcReply = null;
    } else if (matchedNpc) {
      // Use the canonical name + gender from the campaign roster so TTS voice
      // picking + dialogueSegments shape stay consistent with normal scenes.
      npcSpeaker = matchedNpc.name;
      npcSpeakerGender = matchedNpc.gender === 'female' ? 'female' : 'male';
    }
    if (!npcSpeaker || !npcReply) {
      npcSpeaker = null;
      npcReply = null;
      npcSpeakerGender = null;
    }

    const narrationText = parsed.narration.trim().slice(0, 600);
    const rawTime = Number(parsed.timeAdvance);
    const timeAdvance = Number.isFinite(rawTime) && rawTime >= 0 && rawTime <= 0.25
      ? Math.round(rawTime * 100) / 100
      : 0;

    // timeAdvance is applied client-side via the existing reducer
    // (applyStateChangesHandler/timeAndNeeds.js writes draft.world.timeState).
    // We just persist + return it; FE dispatches { timeAdvance: { hoursElapsed } }
    // when handling the ADD_QUICK_BEAT message.
    const saved = await prisma.campaignQuickBeat.create({
      data: {
        campaignId,
        parentSceneIndex,
        characterId: characterId || activeCharacterId || null,
        playerAction,
        narrationText,
        npcSpeaker,
        npcReply,
        timeAdvance: timeAdvance || null,
      },
    });

    onEvent({
      type: 'complete',
      data: {
        id: saved.id,
        playerAction,
        narration: narrationText,
        npcSpeaker,
        npcSpeakerGender,
        npcReply,
        timeAdvance,
        parentSceneIndex,
        createdAt: saved.createdAt,
        characterId: saved.characterId,
        consecutiveCount: consecutive + 1,
        consecutiveLimit: QUICK_BEAT_LIMIT,
      },
    });
  } catch (err) {
    log.error({ err, campaignId }, 'runQuickBeat failed');
    onEvent({
      type: 'error',
      error: err?.message || 'Quick beat failed',
      code: err?.code || 'QUICK_BEAT_ERROR',
    });
  }
}

export const QUICK_BEAT_CONSECUTIVE_LIMIT = QUICK_BEAT_LIMIT;
