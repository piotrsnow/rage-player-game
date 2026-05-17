/**
 * Relationship ripple service (oś 2).
 *
 * Gdy NPC X dostaje `dispositionChange` lub umiera (`alive=false`), propaguje
 * efekt na powiązanych NPC poprzez `CampaignNpcRelationship`. Bracia Hugo
 * smucą się jego śmiercią, rywale Wiedźmy cieszą się że gracz pomaga, etc.
 *
 * Architektura:
 *   - `RIPPLE_MATRIX` — czyste mapowanie relation → coefficient × {help/harm/death}
 *   - `computeRippleDelta` — pure function, łatwa do testowania
 *   - `propagateRelationshipRipple` — async, fetchuje relacje + aplikuje
 *     dispositionChange do target-ów + appenduje memory entries
 *
 * Cap propagacji (MAX_RIPPLE_TARGETS) — anti-runaway. NPC z 50 relacjami
 * dostałby 50 zapisów; bierzemy 8 najsilniejszych po |strength|*rippleStrength.
 *
 * Anti-loop: ripple writes NIE wywołują dalej ripple. Funkcja jest jednowywoła-
 * niowa per source. Multi-hop propagation (X→Y→Z) zostawiamy LLM-owi —
 * `npcMemoryUpdates` z actionType na drugim hopie sam wpadnie tu w następnej
 * scenie.
 */

import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { computeRippleDelta, RIPPLE_MATRIX } from './relationshipRippleMatrix.js';

const log = childLogger({ module: 'relationshipRipple' });

const MAX_RIPPLE_TARGETS = 8;
const DISPOSITION_FLOOR = -100;
const DISPOSITION_CEIL = 100;

// Re-eksport dla wstecznej kompatybilności (callerzy importują z service.js).
export { computeRippleDelta, RIPPLE_MATRIX };

/**
 * Async: propaguj efekt na wszystkie powiązane NPC sourceCampaignNpcId.
 * Zwraca `{ targets: number, deltas: [{ targetNpcId, delta, relation }] }`
 * dla audit/logging.
 *
 * Anti-loop: ta funkcja NIE wywołuje sama siebie z target-ów. Wpisuje tylko
 * direct effect — multi-hop zostawia LLM-owi (chciałbyś wymagać
 * deterministycznej propagacji? wpisz drugi hop w mirror_entry i niech
 * następna scena to podchwyci).
 */
export async function propagateRelationshipRipple(campaignId, sourceCampaignNpcId, opts = {}) {
  if (!campaignId || !sourceCampaignNpcId) return { targets: 0, deltas: [] };
  const {
    dispositionDelta = 0,
    alive = true,
    actionType = null,
    sceneIndex = null,
    sourceName = null,
  } = opts;

  // Skip pure no-op fast — ani delta, ani death, ani actionType.
  if (dispositionDelta === 0 && alive !== false && !actionType) {
    return { targets: 0, deltas: [] };
  }

  // 1. Fetch źródłowy NPC (potrzebny name dla memory entries jeśli nie podano).
  let resolvedSourceName = sourceName;
  if (!resolvedSourceName) {
    const sourceRow = await prisma.npc.findUnique({
      where: { id: sourceCampaignNpcId },
      select: { name: true },
    }).catch(() => null);
    resolvedSourceName = sourceRow?.name || 'someone';
  }

  // 2. Fetch relacje source → targets (`targetType: 'npc'` only — frakcyjne
  // relacje obsługujemy przez reputationService).
  const relationships = await prisma.npcRelationship.findMany({
    where: { campaignNpcId: sourceCampaignNpcId, targetType: 'npc' },
  }).catch(() => []);
  if (relationships.length === 0) return { targets: 0, deltas: [] };

  // 3. Pre-compute deltas + filter (relation w macierzy + non-zero delta) +
  // sortowanie po |delta| desc + cap.
  const candidates = [];
  for (const rel of relationships) {
    const delta = computeRippleDelta(rel.relation, {
      dispositionDelta,
      alive,
      actionType,
      rippleStrength: rel.rippleStrength,
    });
    if (delta === 0) continue;
    candidates.push({ rel, delta });
  }
  candidates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = candidates.slice(0, MAX_RIPPLE_TARGETS);
  if (top.length === 0) return { targets: 0, deltas: [] };

  // 4. Resolve target CampaignNPC po `targetRef` (npc name). Jeden batch
  // findMany — szybko + bezpiecznie dla braku targetu (pomijamy).
  const targetNames = [...new Set(top.map((c) => c.rel.targetRef))];
  const targetRows = await prisma.npc.findMany({
    where: { campaignId, name: { in: targetNames } },
    select: { id: true, name: true, disposition: true },
  }).catch(() => []);
  const byName = new Map(targetRows.map((r) => [r.name, r]));

  const deltas = [];
  for (const { rel, delta } of top) {
    const targetRow = byName.get(rel.targetRef);
    if (!targetRow) continue;
    const oldDisp = targetRow.disposition || 0;
    const newDisp = Math.max(DISPOSITION_FLOOR, Math.min(DISPOSITION_CEIL, oldDisp + delta));
    if (newDisp === oldDisp) continue;

    try {
      await prisma.$transaction([
        prisma.npc.update({
          where: { id: targetRow.id },
          data: { disposition: newDisp },
        }),
        prisma.npcExperience.create({
          data: {
            campaignNpcId: targetRow.id,
            content: buildRippleMemory(resolvedSourceName, rel.relation, { delta, alive, actionType }),
            importance: Math.abs(delta) >= 15 ? 'major' : 'minor',
          },
        }),
      ]);
      deltas.push({ targetNpcId: targetRow.id, targetName: targetRow.name, delta, relation: rel.relation });
    } catch (err) {
      log.warn(
        { err: err?.message, campaignId, sourceCampaignNpcId, targetNpcId: targetRow.id },
        'ripple write failed (non-fatal)',
      );
    }
  }

  if (deltas.length > 0) {
    log.info(
      { campaignId, sourceName: resolvedSourceName, sceneIndex, actionType, alive, dispositionDelta, ripples: deltas.length },
      'Relationship ripple propagated',
    );
  }
  return { targets: deltas.length, deltas };
}

function buildRippleMemory(sourceName, relation, { delta, alive, actionType }) {
  const tag = '[ripple]';
  const sign = delta >= 0 ? `+${delta}` : `${delta}`;
  if (alive === false) {
    return `${tag} Słyszy o śmierci ${sourceName} (${relation}). Disposition ${sign}.`;
  }
  if (actionType === 'killed') {
    return `${tag} Słyszy że ${sourceName} (${relation}) został zabity. Disposition ${sign}.`;
  }
  if (actionType === 'saved') {
    return `${tag} Słyszy że ${sourceName} (${relation}) został uratowany. Disposition ${sign}.`;
  }
  if (actionType === 'betrayed') {
    return `${tag} Słyszy o zdradzie ${sourceName} (${relation}). Disposition ${sign}.`;
  }
  if (actionType === 'aided') {
    return `${tag} Słyszy że ktoś pomógł ${sourceName} (${relation}). Disposition ${sign}.`;
  }
  if (actionType === 'insulted') {
    return `${tag} Słyszy o obrazie ${sourceName} (${relation}). Disposition ${sign}.`;
  }
  if (actionType === 'broke_promise' || actionType === 'kept_promise') {
    return `${tag} Słyszy o (nie)dotrzymanej obietnicy wobec ${sourceName} (${relation}). Disposition ${sign}.`;
  }
  return `${tag} Słyszy o zdarzeniu z ${sourceName} (${relation}). Disposition ${sign}.`;
}
