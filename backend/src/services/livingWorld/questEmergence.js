/**
 * Quest emergence — pure helpers (oś 3).
 *
 * Filtrują WorldEvent `quest_opportunity` payloads do listy hook-ów
 * widocznych dla scene generator-a, dorzucają relacje NPC żeby LLM mógł
 * wpleść je w narrację.
 *
 * `selectRelevantOpportunities` — dostaje surowe events z DB (`forLocation
 *   Opportunities`), zwraca top-N posortowanych wg świeżości + wieku.
 * `enrichOpportunityWithRelations` — bierze hook + listę CampaignNpcRelationship
 *   z campaign-a; dorzuca relacje gdzie source-em jest questGiver lub
 *   którykolwiek z `involvedNpcs`.
 *
 * Wszystkie funkcje pure — testowalne bez DB.
 */

const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_MAX_COUNT = 5;
const HOURS_PER_DAY_GAME = 24;
const MS_PER_HOUR_REAL = 60 * 60 * 1000;

/**
 * Filtr wiek-u + liczby. `gameTimeRatio` (np. 24 — 1h IRL = 24h gry) używany
 * do konwersji event.gameTime → "ile dni gry minęło" względem `currentGameTime`.
 *
 * @param {Array} events — wynik `forLocationOpportunities` (z `gameTime`,
 *   `payload.materializedAs`, `hookId`)
 * @param {Object} opts
 * @param {Date} opts.currentGameTime — bieżący game time (Date)
 * @param {number} [opts.maxAgeDays=7] — maks. wiek hook-a w dniach gry
 * @param {number} [opts.maxCount=5]
 * @returns {Array} filtered & top-N
 */
export function selectRelevantOpportunities(events, { currentGameTime, maxAgeDays = DEFAULT_MAX_AGE_DAYS, maxCount = DEFAULT_MAX_COUNT } = {}) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const cutoffMs = currentGameTime instanceof Date
    ? currentGameTime.getTime() - maxAgeDays * HOURS_PER_DAY_GAME * MS_PER_HOUR_REAL
    : null;

  const filtered = [];
  for (const ev of events) {
    if (!ev?.payload || ev.payload.materializedAs) continue;
    if (cutoffMs && ev.gameTime instanceof Date && ev.gameTime.getTime() < cutoffMs) continue;
    filtered.push(ev);
  }
  // events są już posortowane desc po gameTime z DB; po prostu cap.
  return filtered.slice(0, maxCount);
}

/**
 * Dodaje do hook-a relacje NPC. Bierze relacje gdzie source = questGiver
 * lub source = któryś z involvedNpcs i target = inny NPC z hook-a.
 *
 * @param {Object} opportunity — { hookId, gameTime, payload, worldNpcId }
 * @param {Array} npcRelationships — `[{ sourceName, targetName, relation, strength }]`
 *   (campaign-wide, denormalized z replaceNpcRelationships; nie surowe Prisma rows)
 * @returns {Object} hook ze wzbogaconym `relations[]` (string lines)
 */
export function enrichOpportunityWithRelations(opportunity, npcRelationships) {
  if (!opportunity || !opportunity.payload) return opportunity;
  const payload = opportunity.payload;
  const involved = new Set([
    payload.questGiverName,
    ...(Array.isArray(payload.involvedNpcs) ? payload.involvedNpcs : []),
  ].filter(Boolean));

  const relations = [];
  if (Array.isArray(npcRelationships)) {
    for (const r of npcRelationships) {
      if (!r?.sourceName || !r?.targetName) continue;
      if (!involved.has(r.sourceName)) continue;
      // target może też być w hook (mocniejszy sygnał) lub poza nim
      const inScope = involved.has(r.targetName);
      const strengthTag = typeof r.strength === 'number' && r.strength !== 0 ? `, ${r.strength}` : '';
      relations.push(
        `${r.sourceName} ${inScope ? '<->' : '-->'} ${r.targetName} (${r.relation}${strengthTag})`,
      );
    }
  }

  return {
    ...opportunity,
    relations,
  };
}

/**
 * Helper: zbuduj human-readable label "X game days ago" / "today" dla
 * scene prompt rendering. Pure — input GAME time Date instances, output
 * string label.
 *
 * Uwaga: oba argumenty są już w "game time" (event.gameTime z DB jest
 * zapisywany jako game time, nie real time). Konwersja real→game NIE jest
 * tu robiona — tylko subtraction w godzinach Date.
 */
export function gameTimeAgoLabel(eventGameTime, currentGameTime, _gameTimeRatio = 24) {
  if (!(eventGameTime instanceof Date) || !(currentGameTime instanceof Date)) return null;
  const deltaMs = currentGameTime.getTime() - eventGameTime.getTime();
  if (deltaMs < 0) return 'just now';
  const hours = deltaMs / MS_PER_HOUR_REAL;
  if (hours < 6) return 'recently';
  if (hours < 24) return 'today';
  const days = Math.floor(hours / HOURS_PER_DAY_GAME);
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return `${days} days ago (stale)`;
}

/**
 * Pełny pipeline pomocniczy do user-facing buildPendingQuestHooksBlock —
 * łączy select + enrich + label. Zwraca strukturę gotową do worldBlock-a.
 */
export function preparePendingHooksForPrompt({
  events,
  npcRelationships,
  currentGameTime,
  gameTimeRatio = 24,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  maxCount = DEFAULT_MAX_COUNT,
}) {
  const filtered = selectRelevantOpportunities(events, { currentGameTime, maxAgeDays, maxCount });
  return filtered.map((ev) => {
    const enriched = enrichOpportunityWithRelations(ev, npcRelationships);
    const label = gameTimeAgoLabel(ev.gameTime, currentGameTime, gameTimeRatio);
    return {
      hookId: enriched.hookId,
      questGiverName: enriched.payload.questGiverName,
      locationName: enriched.payload.locationName,
      pitch: enriched.payload.pitch,
      type: enriched.payload.type || 'side',
      involvedNpcs: enriched.payload.involvedNpcs || [],
      relations: enriched.relations || [],
      goalContext: enriched.payload.goalContext || null,
      gameTimeAgoLabel: label,
    };
  });
}
