import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { callNano } from '../memoryCompressor.js';
import { resolveLocationByName } from '../livingWorld/worldStateService.js';
import { wrapPlayerInput } from '../../../../shared/domain/playerInputSanitizer.js';

const log = childLogger({ module: 'sceneStateAuditor' });

const SYSTEM_PROMPT = `Jesteś audytorem spójności stanu gry RPG. Dostajesz transkrypt sceny i stan wyemitowany przez AI.
Twoim zadaniem jest sprawdzenie czy stateChanges (lokacja, NPC) są spójne z tym co NAPRAWDĘ dzieje się w narracji.

Zwróć JSON:
{
  "locationOk": boolean,
  "correctedLocation": string | null,
  "locationReason": string | null,
  "npcCorrections": [
    { "name": string, "field": "attitude"|"alive"|"disposition", "correctedValue": any, "reason": string }
  ]
}

Zasady:
- locationOk=true jeśli emitowana lokacja zgadza się z narracją LUB brak zmiany lokacji.
- correctedLocation = poprawna nazwa lokacji jeśli locationOk=false. Użyj prevLocation jeśli narracja opisuje że gracz zostaje w miejscu. null jeśli locationOk=true.
- npcCorrections: puste jeśli brak problemów. Koryguj TYLKO oczywiste niespójności (NPC zabity w narracji ale alive=true, albo NPC wrogi w narracji ale attitude=friendly). NIE koryguj subtelnych różnic.
- Jeśli nie jesteś pewien — locationOk=true i puste npcCorrections. Lepiej nie korygować niż korygować błędnie.
- Max 5 npcCorrections.`;

function buildUserPrompt({ sceneTranscript, playerAction, prevLocationName, emittedLocation, emittedNpcs, campaignNpcs }) {
  const truncatedTranscript = sceneTranscript.length > 1500
    ? '…' + sceneTranscript.slice(-1500)
    : sceneTranscript;

  const npcList = campaignNpcs
    .slice(0, 10)
    .map((n) => `${n.name}: attitude=${n.attitude}, alive=${n.alive}, disposition=${n.disposition}`)
    .join('\n');

  const emittedNpcStr = (emittedNpcs || [])
    .slice(0, 10)
    .map((n) => `${n.name}: attitude=${n.attitude ?? '?'}, alive=${n.alive ?? '?'}, disposition=${n.disposition ?? '?'}`)
    .join('\n');

  return `PLAYER ACTION: ${wrapPlayerInput(playerAction || '(brak)')}

PREV LOCATION: ${prevLocationName || '(brak)'}
EMITTED LOCATION: ${emittedLocation || '(brak zmiany)'}

TRANSCRIPT:
${truncatedTranscript}

EMITTED NPC CHANGES:
${emittedNpcStr || '(brak)'}

CAMPAIGN NPCs (current state):
${npcList || '(brak)'}`;
}

/**
 * Post-scene nano audit — reads the transcript and verifies that emitted
 * stateChanges (location, NPC) are consistent with the actual narration.
 *
 * @returns {{ correctedLocation, locationReason, npcCorrections[] }} | null
 */
export async function auditSceneState({
  sceneTranscript,
  stateChanges,
  playerAction,
  currentLocationName,
  campaignNpcs,
  provider,
  timeoutMs,
}) {
  if (!sceneTranscript || sceneTranscript.length < 80) return null;

  const emittedLocation = stateChanges?.currentLocation ?? null;
  const emittedNpcs = Array.isArray(stateChanges?.npcs) ? stateChanges.npcs : [];

  // Skip audit when there's nothing suspicious to check
  if (!emittedLocation && emittedNpcs.length === 0) return null;

  const userPrompt = buildUserPrompt({
    sceneTranscript,
    playerAction,
    prevLocationName: currentLocationName,
    emittedLocation,
    emittedNpcs,
    campaignNpcs: campaignNpcs || [],
  });

  try {
    const raw = await callNano(SYSTEM_PROMPT, userPrompt, provider, {
      timeoutMs,
      maxTokens: 300,
      taskCategory: 'sceneAudit',
      taskType: 'scene_state_audit',
      taskLabel: 'Post-scene state audit',
    });
    if (!raw) return null;

    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const locationOk = parsed.locationOk !== false;
    const correctedLocation = !locationOk && typeof parsed.correctedLocation === 'string'
      ? parsed.correctedLocation.trim() || null
      : null;
    const locationReason = !locationOk && typeof parsed.locationReason === 'string'
      ? parsed.locationReason.trim() || null
      : null;

    const npcCorrections = Array.isArray(parsed.npcCorrections)
      ? parsed.npcCorrections
          .filter((c) => c && typeof c.name === 'string' && typeof c.field === 'string')
          .filter((c) => ['attitude', 'alive', 'disposition'].includes(c.field))
          .slice(0, 5)
      : [];

    if (!correctedLocation && npcCorrections.length === 0) return null;

    return { correctedLocation, locationReason, npcCorrections };
  } catch (err) {
    log.warn({ err: err?.message }, 'Scene state audit failed (non-fatal)');
    return null;
  }
}

/**
 * Apply audit corrections to DB and write a one-shot payload for FE polling.
 */
export async function applyAndPushCorrections(campaignId, sceneId, corrections) {
  const { correctedLocation, locationReason, npcCorrections = [] } = corrections;
  const appliedCorrections = { location: null, npcs: [] };

  // Location correction
  if (correctedLocation) {
    try {
      const ref = await resolveLocationByName(correctedLocation, { campaignId });
      if (ref?.row?.id) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            currentLocationName: correctedLocation,
            currentLocationId: ref.location.id,
            currentX: null,
            currentY: null,
          },
        });
        appliedCorrections.location = {
          correctedLocation,
          locationReason,
          id: ref.location.id,
        };
        log.info(
          { campaignId, sceneId, correctedLocation, locationReason },
          'Auditor corrected location',
        );
      } else {
        log.warn(
          { campaignId, correctedLocation },
          'Auditor location correction unresolvable — skipped',
        );
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, correctedLocation }, 'Auditor location apply failed');
    }
  }

  // NPC corrections
  for (const c of npcCorrections) {
    try {
      const npc = await prisma.npc.findFirst({
        where: { campaignId, name: c.name },
        select: { id: true },
      });
      if (!npc) continue;

      const data = {};
      if (c.field === 'attitude' && typeof c.correctedValue === 'string') {
        data.attitude = c.correctedValue;
      } else if (c.field === 'alive' && typeof c.correctedValue === 'boolean') {
        data.alive = c.correctedValue;
      } else if (c.field === 'disposition' && typeof c.correctedValue === 'number') {
        data.disposition = c.correctedValue;
      } else {
        continue;
      }

      await prisma.npc.update({ where: { id: npc.id }, data });
      appliedCorrections.npcs.push({ name: c.name, field: c.field, correctedValue: c.correctedValue, reason: c.reason });
      log.info({ campaignId, sceneId, npc: c.name, field: c.field, correctedValue: c.correctedValue }, 'Auditor corrected NPC');
    } catch (err) {
      log.warn({ err: err?.message, campaignId, npc: c.name }, 'Auditor NPC correction failed');
    }
  }

  // Write one-shot payload for FE polling (only if something was actually applied)
  if (appliedCorrections.location || appliedCorrections.npcs.length > 0) {
    try {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { pendingStateCorrection: appliedCorrections },
      });
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'Failed to write pendingStateCorrection');
    }
  }

  return appliedCorrections;
}
