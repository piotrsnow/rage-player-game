/**
 * Quest dynamics — reactive checker (oś 4).
 *
 * Dwa hak-y:
 *   1. `evaluateQuestGraphForCampaign` — wywoływany na końcu
 *      `processStateChanges` po zaaplikowaniu wszystkich zmian. Sprawdza
 *      czy `metadata.failsOn` któregoś objective został spełniony przez
 *      zmiany NPC w tej scenie (alive=false, ranił questgivera, etc.).
 *   2. `evaluateQuestImpactFromTick` — wywoływany w `runNpcTick` po
 *      `update WorldNPC`. Reaguje na ticki off-screen (NPC rusza do innej
 *      lokacji, kończy/przerywa goal).
 *
 * Decyzje:
 *   - status `stalled` (1st-class) → quest wisi, gracz widzi rescue hook
 *     w narracji. Dopiero po 7 dniach gry → `failed`.
 *   - status `failed` → terminal, brak rescue.
 *   - `mutationLog` jest append-only z cap MUTATION_LOG_CAP.
 *
 * Brak crona — reactive evaluation w `processStateChanges` (po graczu) i
 * w `runNpcTick` (po agencie) wystarcza dla 6-os multiplayer.
 */

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { appendEvent } from './worldEventLog.js';
import { checkFailsOn } from './questDynamicsRules.js';

const log = childLogger({ module: 'questDynamics' });

const MUTATION_LOG_CAP = 10;
const STALL_TO_FAIL_GAME_DAYS = 7;
const HOURS_PER_DAY_GAME = 24;
const MS_PER_HOUR_REAL = 60 * 60 * 1000;

// Re-eksport — callerzy w handlerach mogą importować z service-u dla
// ergonomii, testy unit importują bezpośrednio z questDynamicsRules.js.
export { checkFailsOn };

/**
 * Apply a mutation to a quest. Pure-async — przyjmuje już zhydratowany
 * quest row (z mutationLog), zwraca patch do zaaplikowania w transakcji.
 *
 * `mutation`:
 *   - `stall` → status stalled. Pozostaje w grze, gracz widzi w narracji,
 *     po 7 dniach gry kolejna ewaluacja zmieni na 'failed' jeśli player
 *     nie zaratował.
 *   - `fail` → status failed. Terminal.
 *   - `reroute` → status zostaje active (lub powraca z stalled), dodaje
 *     metadata flagę dla LLM żeby narracyjnie kontynuować quest inną drogą.
 */
export async function mutateQuest({ campaignId, questRow, mutation, reason, sceneIndex = null, source = 'reactive' }) {
  if (!questRow?.id) return false;
  const newStatus = mutation === 'stall' ? 'stalled'
    : mutation === 'fail' ? 'failed'
    : mutation === 'reroute' ? 'active'
    : null;
  if (!newStatus) return false;

  const existingLog = Array.isArray(questRow.mutationLog) ? questRow.mutationLog : [];
  const entry = {
    ts: new Date().toISOString(),
    mutation,
    reason: reason || '(no reason)',
    sceneIndex,
    source,
  };
  const newLog = [...existingLog, entry].slice(-MUTATION_LOG_CAP);

  try {
    await prisma.campaignQuest.update({
      where: { id: questRow.id },
      data: {
        status: newStatus,
        mutationLog: newLog,
        ...(mutation === 'fail' ? { completedAt: new Date() } : {}),
      },
    });
    await appendEvent({
      campaignId,
      eventType: 'quest_mutated',
      payload: {
        questId: questRow.questId,
        questName: questRow.name,
        mutation,
        reason,
        source,
      },
      visibility: 'campaign',
    });
    log.info({ campaignId, questId: questRow.questId, mutation, reason, source }, 'Quest mutation applied');
    return true;
  } catch (err) {
    log.warn({ err: err?.message, campaignId, questId: questRow.questId, mutation }, 'mutateQuest failed (non-fatal)');
    return false;
  }
}

/**
 * Reactive checker — wywoływany na końcu processStateChanges. Iteruje po
 * active+stalled questach kampanii, sprawdza failsOn dla każdego objective
 * w aktywnej ścieżce, mutuje quest gdy trigger spełniony.
 *
 * Stalled→Failed timeout: jeśli quest jest w `stalled` longer than 7 game
 * days (timestamp z ostatniego mutationLog z mutation='stall'), promuj na
 * 'failed'. Game time z `sceneGameTime` (bieżąca scena = ref point).
 */
export async function evaluateQuestGraphForCampaign(campaignId, { changedNpcs = [], locationsDestroyed = [], sceneIndex = null, sceneGameTime = new Date() } = {}) {
  if (!campaignId) return { mutated: 0 };

  let active;
  try {
    active = await prisma.campaignQuest.findMany({
      where: {
        campaignId,
        status: { in: ['active', 'stalled'] },
      },
      include: {
        objectives: { orderBy: { displayOrder: 'asc' } },
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'evaluateQuestGraphForCampaign fetch failed');
    return { mutated: 0 };
  }

  let mutated = 0;
  for (const quest of active) {
    // Stalled→Failed timeout
    if (quest.status === 'stalled') {
      const lastStall = (Array.isArray(quest.mutationLog) ? quest.mutationLog : [])
        .filter((m) => m?.mutation === 'stall')
        .pop();
      if (lastStall?.ts) {
        const stalledAt = new Date(lastStall.ts);
        if (!Number.isNaN(stalledAt.getTime())) {
          const elapsedHours = (sceneGameTime.getTime() - stalledAt.getTime()) / MS_PER_HOUR_REAL;
          if (elapsedHours / HOURS_PER_DAY_GAME >= STALL_TO_FAIL_GAME_DAYS) {
            await mutateQuest({
              campaignId,
              questRow: quest,
              mutation: 'fail',
              reason: `Stalled longer than ${STALL_TO_FAIL_GAME_DAYS} game days without rescue`,
              sceneIndex,
              source: 'timeout',
            });
            mutated += 1;
            continue;
          }
        }
      }
    }

    // failsOn checker — aktywne objectives (pending + locked, niezaskip-
    // owane). Pierwszy match → mutate quest.
    const objectives = quest.objectives || [];
    let triggered = null;
    for (const obj of objectives) {
      if (obj.status === 'done' || obj.status === 'skipped' || obj.status === 'failed') continue;
      const failsOn = obj.metadata?.failsOn;
      if (!failsOn) continue;
      const check = checkFailsOn(failsOn, { changedNpcs, sceneGameTime, locationsDestroyed });
      if (check.matched) {
        triggered = { obj, reason: check.reason };
        break;
      }
    }
    if (triggered) {
      // Domyślnie stall — daje graczowi szansę na rescue. Hard fail tylko
      // dla questów które już są stalled (drugi cios = zamknięcie).
      const mutation = quest.status === 'stalled' ? 'fail' : 'stall';
      await mutateQuest({
        campaignId,
        questRow: quest,
        mutation,
        reason: `${triggered.reason} (objective: ${triggered.obj.nodeKey || triggered.obj.description?.slice(0, 40)})`,
        sceneIndex,
        source: 'reactive',
      });
      mutated += 1;
    }
  }

  if (mutated > 0) {
    log.info({ campaignId, mutated, sceneIndex }, 'Quest graph evaluation completed with mutations');
  }
  return { mutated };
}

/**
 * Tick-driven checker — wywoływany w `runNpcTick` po update WorldNPC.
 * Reaguje na off-screen ruchy:
 *   - `move` → update `objective.metadata.lastKnownLocation` dla questów
 *     gdzie ten WorldNPC jest questGiverId/turnInNpcId.
 *   - `finished` z reason zawierającym `died`/`fled`/`betrayed` → mutate.
 */
export async function evaluateQuestImpactFromTick(worldNpcId, action) {
  if (!worldNpcId || !action?.kind) return { affected: 0 };

  // Resolve WorldNPC name + linked CampaignNPCs (które mogą być questGivers)
  const worldNpc = await prisma.worldNPC.findUnique({
    where: { id: worldNpcId },
    select: { id: true, name: true, alive: true },
  });
  if (!worldNpc) return { affected: 0 };

  // Quest match po questGiverId/turnInNpcId — używa name (CampaignQuest
  // zapisuje wybrany name jako questGiverId). Iterujemy po wszystkich
  // active questach gdzie ten name pasuje.
  const matchingQuests = await prisma.campaignQuest.findMany({
    where: {
      status: { in: ['active', 'stalled'] },
      OR: [
        { questGiverId: worldNpc.name },
        { turnInNpcId: worldNpc.name },
      ],
    },
    include: { objectives: true },
  }).catch(() => []);

  if (matchingQuests.length === 0) return { affected: 0 };

  let affected = 0;
  for (const quest of matchingQuests) {
    if (action.kind === 'finished') {
      const reasonLower = String(action.reason || '').toLowerCase();
      if (reasonLower.includes('died') || reasonLower.includes('fled') || reasonLower.includes('betrayed')) {
        const mutation = quest.status === 'stalled' ? 'fail' : 'stall';
        await mutateQuest({
          campaignId: quest.campaignId,
          questRow: quest,
          mutation,
          reason: `Questgiver ${worldNpc.name}: ${action.reason || 'finished off-screen'}`,
          source: 'agent_tick',
        });
        affected += 1;
        continue;
      }
    }
    if (action.kind === 'move' && action.toLocation) {
      // Aktualizuj `lastKnownLocation` w metadata wszystkich active objectives
      // tego questa — tak żeby LLM dostał świeży hint w następnej scenie.
      try {
        const updates = quest.objectives
          .filter((o) => o.status === 'pending' || o.status === 'locked')
          .map((o) => prisma.campaignQuestObjective.update({
            where: { id: o.id },
            data: {
              metadata: { ...(o.metadata || {}), lastKnownLocation: action.toLocation },
            },
          }));
        if (updates.length > 0) {
          await Promise.all(updates);
          affected += 1;
        }
      } catch (err) {
        log.debug({ err: err?.message, questId: quest.questId }, 'lastKnownLocation update failed (non-fatal)');
      }
    }
  }
  return { affected };
}
