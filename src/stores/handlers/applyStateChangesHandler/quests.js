import { normalizeMoney } from '../../../services/gameState';
import { ensureMapContainsLocationDraft } from '../_shared';

/**
 * Quest lifecycle from AI state-changes: new, completed, per-objective updates
 * + auto-complete safety net. Premium sees quest *names* in its prompt, not
 * ids, so we accept real ids, case-insensitive name matches, and (last resort)
 * the single-active fallback. Resolved ids are written back to
 * `changes.completedQuests` so downstream toasts and backend sync see the
 * canonical ids.
 */
export function applyQuests(draft, changes) {
  applyNewQuests(draft, changes);
  applyCompletedQuests(draft, changes);
  applyQuestUpdates(draft, changes);
}

function applyNewQuests(draft, changes) {
  if (!changes.newQuests) return;
  const now = Date.now();
  const normalized = changes.newQuests.map((q) => ({
    ...q,
    objectives: (q.objectives || []).map((obj) => ({ ...obj, completed: obj.completed ?? false })),
    questGiverId: q.questGiverId || null,
    turnInNpcId: q.turnInNpcId || q.questGiverId || null,
    locationId: q.locationId || null,
    prerequisiteQuestIds: q.prerequisiteQuestIds || [],
    reward: q.reward || null,
    type: q.type || 'side',
    createdAt: q.createdAt ?? now,
  }));
  draft.quests.active.push(...normalized);
  for (const quest of normalized) {
    if (quest?.locationId) {
      ensureMapContainsLocationDraft(draft.world, quest.locationId);
    }
  }
}

function applyCompletedQuests(draft, changes) {
  if (!changes.completedQuests) return;
  const activeQuests = draft.quests.active;
  const resolvedIds = [];
  for (const rawId of changes.completedQuests) {
    const exact = activeQuests.find((q) => q.id === rawId);
    if (exact) {
      resolvedIds.push(exact.id);
      continue;
    }
    const normalized = typeof rawId === 'string' ? rawId.trim().toLowerCase() : '';
    const byName = normalized
      ? activeQuests.find((q) => (q.name || '').trim().toLowerCase() === normalized)
      : null;
    if (byName) {
      resolvedIds.push(byName.id);
      continue;
    }
    if (activeQuests.length === 1) {
      resolvedIds.push(activeQuests[0].id);
      continue;
    }
    // eslint-disable-next-line no-console
    console.warn('[quest] completedQuests entry did not match any active quest', {
      rawId,
      activeCount: activeQuests.length,
    });
  }
  changes.completedQuests = resolvedIds;

  const activeIds = new Set(activeQuests.map((q) => q.id));
  const validIds = resolvedIds.filter((id) => activeIds.has(id));
  if (validIds.length === 0) return;

  const completed = draft.quests.active.filter((q) => validIds.includes(q.id));

  let totalRewardXp = 0;
  const rewardMoney = { gold: 0, silver: 0, copper: 0 };
  const rewardItems = [];
  for (const q of completed) {
    if (!q.reward) continue;
    if (q.reward.xp) totalRewardXp += q.reward.xp;
    if (q.reward.money) {
      rewardMoney.gold += q.reward.money.gold || 0;
      rewardMoney.silver += q.reward.money.silver || 0;
      rewardMoney.copper += q.reward.money.copper || 0;
    }
    if (q.reward.items?.length > 0) rewardItems.push(...q.reward.items);
  }

  // Quest reward XP is applied on BE; RECONCILE brings the authoritative total.
  // `totalRewardXp` stays around only so message generation can surface it as a toast.
  void totalRewardXp;
  if ((rewardMoney.gold || rewardMoney.silver || rewardMoney.copper) && draft.character) {
    const cur = draft.character.money || { gold: 0, silver: 0, copper: 0 };
    draft.character.money = normalizeMoney({
      gold: (cur.gold || 0) + rewardMoney.gold,
      silver: (cur.silver || 0) + rewardMoney.silver,
      copper: (cur.copper || 0) + rewardMoney.copper,
    });
  }
  if (rewardItems.length > 0 && draft.character) {
    if (!draft.character.inventory) draft.character.inventory = [];
    draft.character.inventory.push(...rewardItems);
  }

  const now = Date.now();
  draft.quests.active = draft.quests.active.filter((q) => !validIds.includes(q.id));
  draft.quests.completed.push(...completed.map((q) => ({ ...q, completedAt: now, rewardGranted: true })));

  if (completed.some((q) => q.type === 'main')) {
    draft.mainQuestJustCompleted = true;
  }
}

function applyQuestUpdates(draft, changes) {
  if (!changes.questUpdates?.length) return;

  // Same fuzzy resolution as completedQuests — premium doesn't see ids in
  // the prompt. Objective resolution adds a last-resort "single pending
  // objective" fallback so mid-scene progress updates still land when the
  // model only describes the objective in prose.
  const resolveActiveQuest = (rawId) => {
    const active = draft.quests.active;
    const exact = active.find((q) => q.id === rawId);
    if (exact) return exact;
    const normalized = typeof rawId === 'string' ? rawId.trim().toLowerCase() : '';
    if (normalized) {
      const byName = active.find((q) => (q.name || '').trim().toLowerCase() === normalized);
      if (byName) return byName;
    }
    if (active.length === 1) return active[0];
    return null;
  };
  const resolveObj = (quest, rawObjId) => {
    if (!quest?.objectives?.length) return null;
    const exact = quest.objectives.find((o) => o.id === rawObjId);
    if (exact) return exact;
    const normalized = typeof rawObjId === 'string' ? rawObjId.trim().toLowerCase() : '';
    if (normalized) {
      const byDesc = quest.objectives.find(
        (o) => (o.description || '').trim().toLowerCase() === normalized,
      );
      if (byDesc) return byDesc;
    }
    const pending = quest.objectives.filter((o) => !o.completed);
    if (pending.length === 1) return pending[0];
    return null;
  };

  for (const update of changes.questUpdates) {
    const quest = resolveActiveQuest(update.questId);
    if (!quest?.objectives) continue;
    const obj = resolveObj(quest, update.objectiveId);
    if (!obj) {
      // eslint-disable-next-line no-console
      console.warn('[quest] objective update did not match', {
        questId: update.questId,
        objectiveId: update.objectiveId,
      });
      continue;
    }
    obj.completed = !!update.completed;
    if (update.addProgress) {
      const prev = obj.progress || '';
      obj.progress = prev ? `${prev}; ${update.addProgress}` : update.addProgress;
    }
  }

  // Auto-complete quests where ALL objectives are now done (deterministic
  // safety-net). Only considers quests not already moved by completedQuests.
  const alreadyCompleted = new Set(changes.completedQuests || []);
  const autoCompleteIds = [];
  for (const quest of draft.quests.active) {
    if (alreadyCompleted.has(quest.id)) continue;
    if (!quest.objectives?.length) continue;
    if (quest.objectives.every((o) => o.completed)) {
      autoCompleteIds.push(quest.id);
    }
  }
  if (autoCompleteIds.length === 0) return;

  const now = Date.now();
  const autoCompleted = draft.quests.active.filter((q) => autoCompleteIds.includes(q.id));
  for (const q of autoCompleted) {
    if (!q.reward) continue;
    if ((q.reward.money?.gold || q.reward.money?.silver || q.reward.money?.copper) && draft.character) {
      const cur = draft.character.money || { gold: 0, silver: 0, copper: 0 };
      draft.character.money = normalizeMoney({
        gold: (cur.gold || 0) + (q.reward.money.gold || 0),
        silver: (cur.silver || 0) + (q.reward.money.silver || 0),
        copper: (cur.copper || 0) + (q.reward.money.copper || 0),
      });
    }
    if (q.reward.items?.length > 0 && draft.character) {
      if (!draft.character.inventory) draft.character.inventory = [];
      draft.character.inventory.push(...q.reward.items);
    }
  }
  draft.quests.active = draft.quests.active.filter((q) => !autoCompleteIds.includes(q.id));
  draft.quests.completed.push(...autoCompleted.map((q) => ({ ...q, completedAt: now, rewardGranted: true })));
  // Surface auto-completions so stateChangeMessages can generate quest_completed toasts.
  // We stash the IDs on the changes object — it's the same reference the caller passes
  // to generateStateChangeMessages, so they'll pick it up.
  if (!changes.completedQuests) changes.completedQuests = [];
  changes.completedQuests.push(...autoCompleteIds);

  if (autoCompleted.some((q) => q.type === 'main')) {
    draft.mainQuestJustCompleted = true;
  }
}
