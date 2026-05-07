function matchName(a, b) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function findQuestsForNpc(npc, quests) {
  const all = [...(quests?.active || []), ...(quests?.completed || [])];
  return all.filter((q) =>
    matchName(q.questGiverId, npc.name) || matchName(q.questGiverId, npc.id) ||
    matchName(q.turnInNpcId, npc.name) || matchName(q.turnInNpcId, npc.id) ||
    (npc.relatedQuestIds || []).includes(q.id)
  );
}

export function findQuestsForLocation(locName, quests) {
  const all = [...(quests?.active || []), ...(quests?.completed || [])];
  return all.filter((q) => matchName(q.locationId, locName));
}

/**
 * Faza 3b — find NPCs at a location.
 *
 * @param {string|null} locName - Legacy string fallback.
 * @param {Array} npcs
 * @param {object|null} [locRef] - Faza 3a composite ref (preferowane).
 */
export function findNpcsAtLocation(locName, npcs, locRef = null) {
  const list = npcs || [];
  if (locRef && locRef.kind && locRef.id) {
    // Try composite ref match first.
    const byRef = list.filter(
      (n) => n.locationRef && n.locationRef.kind === locRef.kind && n.locationRef.id === locRef.id,
    );
    if (byRef.length > 0) return byRef;
  }
  return list.filter((n) => matchName(n.lastLocation, locName));
}

export function findNpcByRef(ref, npcs) {
  if (!ref) return null;
  return (npcs || []).find((n) => matchName(n.name, ref) || matchName(n.id, ref));
}

export function CrossLinkChip({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
    >
      <span className="material-symbols-outlined text-xs">{icon}</span>
      <span className="truncate max-w-[120px]">{label}</span>
    </button>
  );
}

export function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
      <span className="material-symbols-outlined text-3xl">{icon}</span>
      <p className="text-sm font-label uppercase tracking-widest">{text}</p>
    </div>
  );
}
