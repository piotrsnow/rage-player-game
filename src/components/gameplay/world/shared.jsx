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

export function findNpcsAtLocation(locName, npcs) {
  return (npcs || []).filter((n) => matchName(n.lastLocation, locName));
}

export function findNpcByRef(ref, npcs) {
  if (!ref) return null;
  return (npcs || []).find((n) => matchName(n.name, ref) || matchName(n.id, ref));
}

export function CrossLinkChip({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
    >
      <span className="material-symbols-outlined text-[10px]">{icon}</span>
      <span className="truncate max-w-[120px]">{label}</span>
    </button>
  );
}

export function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-outline">
      <span className="material-symbols-outlined text-3xl">{icon}</span>
      <p className="text-[11px] font-label uppercase tracking-widest">{text}</p>
    </div>
  );
}
