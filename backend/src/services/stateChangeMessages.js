function formatMoneyDelta(mc) {
  const parts = [];
  if (mc.gold) parts.push(`${Math.abs(mc.gold)} GC`);
  if (mc.silver) parts.push(`${Math.abs(mc.silver)} SS`);
  if (mc.copper) parts.push(`${Math.abs(mc.copper)} CP`);
  return parts.join(' ') || '0 CP';
}

const templates = {
  en: {
    itemGained: (name, item) => `${name} received: ${item}`,
    itemLost: (name, item) => `${name} lost: ${item}`,
    damageTaken: (name, amount) => `${name} took ${Math.abs(amount)} damage`,
    healed: (name, amount) => `${name} healed ${amount} HP`,
    manaSpent: (name, amount) => `${name} spent ${Math.abs(amount)} mana`,
    manaRecovered: (name, amount) => `${name} recovered ${amount} mana`,
    xpGained: (name, amount) => `${name} gained ${amount} XP`,
    levelUp: (name, level) => `${name} leveled up to Lv.${level}!`,
    questNew: (quest) => `New quest: ${quest}`,
    questCompleted: (quest) => `Quest completed: ${quest}`,
    questObjectiveCompleted: (quest, objective) => `Objective completed: ${quest} — ${objective}`,
    moneySpent: (name, amount) => `${name} spent ${amount}`,
    moneyGained: (name, amount) => `${name} received ${amount}`,
  },
  pl: {
    itemGained: (name, item) => `${name} otrzymał/a: ${item}`,
    itemLost: (name, item) => `${name} stracił/a: ${item}`,
    damageTaken: (name, amount) => `${name} otrzymał/a ${Math.abs(amount)} obrażeń`,
    healed: (name, amount) => `${name} wyleczył/a ${amount} HP`,
    manaSpent: (name, amount) => `${name} zużył/a ${Math.abs(amount)} many`,
    manaRecovered: (name, amount) => `${name} odzyskał/a ${amount} many`,
    xpGained: (name, amount) => `${name} zdobył/a ${amount} PD`,
    levelUp: (name, level) => `${name} awansował/a na poz. ${level}!`,
    questNew: (quest) => `Nowe zadanie: ${quest}`,
    questCompleted: (quest) => `Zadanie ukończone: ${quest}`,
    questObjectiveCompleted: (quest, objective) => `Cel ukończony: ${quest} — ${objective}`,
    moneySpent: (name, amount) => `${name} wydał/a ${amount}`,
    moneyGained: (name, amount) => `${name} otrzymał/a ${amount}`,
  },
};

export function generateStateChangeMessages(stateChanges, characters, language = 'en', quests = null) {
  const t = templates[language] || templates.en;
  const msgs = [];
  let counter = 0;
  const ts = Date.now();
  const mkId = () => `msg_sc_${ts}_${counter++}`;

  const perChar = stateChanges.perCharacter;
  if (perChar) {
    for (const [charName, delta] of Object.entries(perChar)) {
      if (Array.isArray(delta.newItems) && delta.newItems.length > 0) {
        for (const item of delta.newItems) {
          const itemName = typeof item === 'string' ? item : item.name;
          msgs.push({ id: mkId(), role: 'system', subtype: 'item_gained', content: t.itemGained(charName, itemName), timestamp: ts });
        }
      }
      if (Array.isArray(delta.removeItems) && delta.removeItems.length > 0) {
        for (const item of delta.removeItems) {
          const itemName = typeof item === 'string' ? item : item.name;
          msgs.push({ id: mkId(), role: 'system', subtype: 'item_lost', content: t.itemLost(charName, itemName), timestamp: ts });
        }
      }
      if (delta.hp != null && delta.hp !== 0) {
        if (delta.hp < 0) {
          msgs.push({ id: mkId(), role: 'system', subtype: 'damage', content: t.damageTaken(charName, delta.hp), timestamp: ts });
        } else {
          msgs.push({ id: mkId(), role: 'system', subtype: 'healing', content: t.healed(charName, delta.hp), timestamp: ts });
        }
      }
      if (delta.mana != null && delta.mana !== 0) {
        if (delta.mana < 0) {
          msgs.push({ id: mkId(), role: 'system', subtype: 'mana', content: t.manaSpent(charName, delta.mana), timestamp: ts });
        } else {
          msgs.push({ id: mkId(), role: 'system', subtype: 'mana', content: t.manaRecovered(charName, delta.mana), timestamp: ts });
        }
      }
      if (delta.moneyChange) {
        const mc = delta.moneyChange;
        const total = (mc.gold || 0) * 100 + (mc.silver || 0) * 10 + (mc.copper || 0);
        if (total !== 0) {
          const amount = formatMoneyDelta(mc);
          if (total < 0) {
            msgs.push({ id: mkId(), role: 'system', subtype: 'money_spent', content: t.moneySpent(charName, amount), timestamp: ts });
          } else {
            msgs.push({ id: mkId(), role: 'system', subtype: 'money_gained', content: t.moneyGained(charName, amount), timestamp: ts });
          }
        }
      }
      if (delta.xp != null && delta.xp > 0) {
        msgs.push({ id: mkId(), role: 'system', subtype: 'xp', content: t.xpGained(charName, delta.xp), timestamp: ts });

        const char = (characters || []).find((c) => c.name === charName);
        if (char) {
          const currentXp = (char.xp || 0) + delta.xp;
          const xpThreshold = (char.level || 1) * 100;
          if (currentXp >= xpThreshold) {
            msgs.push({ id: mkId(), role: 'system', subtype: 'level_up', content: t.levelUp(charName, (char.level || 1) + 1), timestamp: ts });
          }
        }
      }
    }
  }

  if (Array.isArray(stateChanges.newQuests)) {
    for (const q of stateChanges.newQuests) {
      const name = typeof q === 'string' ? q : q.name;
      msgs.push({ id: mkId(), role: 'system', subtype: 'quest_new', content: t.questNew(name), timestamp: ts });
    }
  }

  if (Array.isArray(stateChanges.completedQuests) && stateChanges.completedQuests.length > 0) {
    const activeQuests = quests?.active || [];
    for (const qId of stateChanges.completedQuests) {
      const quest = activeQuests.find((q) => q.id === qId);
      const name = quest?.name || qId;
      msgs.push({ id: mkId(), role: 'system', subtype: 'quest_completed', content: t.questCompleted(name), timestamp: ts });
    }
  }

  if (Array.isArray(stateChanges.questUpdates) && stateChanges.questUpdates.length > 0) {
    const activeQuests = quests?.active || [];
    for (const update of stateChanges.questUpdates) {
      if (!update.completed) continue;
      const quest = activeQuests.find((q) => q.id === update.questId);
      const questName = quest?.name || update.questId;
      const obj = quest?.objectives?.find((o) => o.id === update.objectiveId);
      const objDesc = obj?.description || update.objectiveId;
      msgs.push({ id: mkId(), role: 'system', subtype: 'quest_objective_completed', content: t.questObjectiveCompleted(questName, objDesc), timestamp: ts });
    }
  }

  return msgs;
}
