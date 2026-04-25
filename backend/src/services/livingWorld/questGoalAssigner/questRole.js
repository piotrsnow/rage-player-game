/**
 * Pure quest-role classification + goal-string templating.
 *
 * Decides which role an NPC plays right now given the campaign's quest state
 * (giver_active / turnin_active / giver_next / done / null) and formats the
 * corresponding Polish goal line. Kept pure for tests — no DB access here.
 */

export function slugify(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '_');
}

/**
 * Pure — extract prerequisite quest ids from an F3 `prerequisites` relation
 * array (each row has a `prerequisiteId` UUID). Tolerates a plain id array
 * for legacy/test inputs.
 */
export function parsePrereqs(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === 'string' ? entry : entry?.prerequisiteId))
    .filter((id) => typeof id === 'string' && id.length > 0);
}

/**
 * Decide which "role" the NPC plays right now given the campaign's quest
 * state. Roles feed into the goal template.
 *
 * Inputs:
 *   - npcId (CampaignNPC.npcId string slug)
 *   - quests: array of CampaignQuest rows (all statuses)
 *
 * Returns one of:
 *   - { kind: 'giver_active', quest }   — NPC gives an already-active quest
 *   - { kind: 'turnin_active', quest }  — NPC is turn-in for an active quest
 *   - { kind: 'giver_next', quest }     — prerequisites done, quest not yet active
 *   - { kind: 'done' }                  — all their quests are completed
 *   - null                              — no quest role
 */
export function classifyQuestRole(npcId, quests) {
  if (!npcId || !Array.isArray(quests)) return null;

  // questGiverId/turnInNpcId are stored as raw AI-emitted names ("Bjorn Myśliwy")
  // while CampaignNPC.npcId is a slug ("bjorn_myśliwy"). Normalize both sides
  // so equality matches regardless of which side is in slug form already.
  const target = slugify(npcId);
  const active = quests.filter((q) => q.status === 'active' || q.status === 'in_progress');
  const completed = new Set(quests.filter((q) => q.status === 'completed').map((q) => q.questId));

  // 1. Active quest — NPC is giver OR turn-in
  const activeGiver = active.find((q) => slugify(q.questGiverId) === target);
  if (activeGiver) return { kind: 'giver_active', quest: activeGiver };
  const activeTurnIn = active.find((q) => slugify(q.turnInNpcId) === target && slugify(q.questGiverId) !== target);
  if (activeTurnIn) return { kind: 'turnin_active', quest: activeTurnIn };

  // 2. Next-available quest — prerequisites completed, quest not yet active/completed
  const pending = quests.filter((q) => {
    if (q.status === 'active' || q.status === 'in_progress' || q.status === 'completed') return false;
    if (slugify(q.questGiverId) !== target) return false;
    const prereqs = parsePrereqs(q.prerequisites);
    return prereqs.every((id) => completed.has(id));
  });
  if (pending.length > 0) {
    // Prefer the one with the most prerequisites (latest in chain)
    pending.sort((a, b) => parsePrereqs(b.prerequisites).length - parsePrereqs(a.prerequisites).length);
    return { kind: 'giver_next', quest: pending[0] };
  }

  // 3. "Done" — there is at least one COMPLETED quest this NPC gave, and no
  // active/pending role remains. If an NPC has a future quest locked behind
  // unfinished prerequisites, we stay null (they've got nothing to do right
  // now) — avoids prematurely triggering return-home on NPCs still waiting
  // in the chain.
  const everCompletedGiver = quests.some((q) => slugify(q.questGiverId) === target && q.status === 'completed');
  if (everCompletedGiver) return { kind: 'done' };
  return null;
}

/**
 * Build the goal string given role + player co-location + character name.
 * Returns null when role is null/done (no goal).
 */
export function buildGoalString(role, { characterName = null, coLocated = false } = {}) {
  if (!role || role.kind === 'done') return null;
  const who = characterName ? characterName : 'gracza';

  if (role.kind === 'giver_active') {
    return `Czekam w swojej lokacji aż ${who} wróci z postępami w zadaniu "${role.quest.name}".`;
  }
  if (role.kind === 'turnin_active') {
    return `Czekam aż ${who} dostarczy rozwiązanie zadania "${role.quest.name}".`;
  }
  if (role.kind === 'giver_next') {
    if (coLocated) {
      return `Mam nowe zlecenie dla ${who}: "${role.quest.name}". Poczekam aż zapyta.`;
    }
    return `Muszę odnaleźć ${who} i przekazać nowe zlecenie: "${role.quest.name}".`;
  }
  return null;
}
