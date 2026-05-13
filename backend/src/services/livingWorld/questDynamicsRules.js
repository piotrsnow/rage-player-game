/**
 * Pure rules dla questDynamicsService — wydzielone żeby vitest mógł
 * importować bez prisma chain. Główny `questDynamicsService.js` re-exportuje.
 */

/**
 * Pure: czy któryś z `failsOn` triggerów jest spełniony przez zaaplikowane
 * w tej scenie zmiany NPC?
 *
 * @param {Object} failsOn — { npcDead?: string[], locationDestroyed?: string[], deadline?: ISO string }
 * @param {Object} ctx — { changedNpcs: NpcChange[], sceneGameTime: Date, locationsDestroyed?: string[] }
 * @returns {{matched: boolean, reason?: string}} — reason = czytelny opis dla mutationLog
 */
export function checkFailsOn(failsOn, ctx) {
  if (!failsOn || typeof failsOn !== 'object') return { matched: false };
  const changedNpcs = Array.isArray(ctx?.changedNpcs) ? ctx.changedNpcs : [];
  const sceneGameTime = ctx?.sceneGameTime instanceof Date ? ctx.sceneGameTime : new Date();
  const locsDestroyed = Array.isArray(ctx?.locationsDestroyed) ? ctx.locationsDestroyed : [];

  if (Array.isArray(failsOn.npcDead) && failsOn.npcDead.length > 0) {
    const deadInScene = changedNpcs
      .filter((n) => n?.alive === false)
      .map((n) => (n.name || '').toLowerCase());
    for (const required of failsOn.npcDead) {
      const lower = String(required).toLowerCase();
      if (deadInScene.includes(lower)) {
        return { matched: true, reason: `NPC "${required}" died this scene` };
      }
    }
  }

  if (Array.isArray(failsOn.locationDestroyed) && failsOn.locationDestroyed.length > 0) {
    for (const loc of failsOn.locationDestroyed) {
      if (locsDestroyed.some((l) => String(l).toLowerCase() === String(loc).toLowerCase())) {
        return { matched: true, reason: `Location "${loc}" destroyed` };
      }
    }
  }

  if (failsOn.deadline) {
    const deadline = new Date(failsOn.deadline);
    if (!Number.isNaN(deadline.getTime()) && sceneGameTime > deadline) {
      return { matched: true, reason: `Deadline passed (${failsOn.deadline})` };
    }
  }

  return { matched: false };
}
