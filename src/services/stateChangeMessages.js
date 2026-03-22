function formatMoneyDelta(mc) {
  const parts = [];
  if (mc.gold) parts.push(`${Math.abs(mc.gold)} GC`);
  if (mc.silver) parts.push(`${Math.abs(mc.silver)} SS`);
  if (mc.copper) parts.push(`${Math.abs(mc.copper)} CP`);
  return parts.join(' ') || '0 CP';
}

function isMoneySpent(mc) {
  return (mc.gold || 0) + (mc.silver || 0) + (mc.copper || 0) < 0;
}

export function generateStateChangeMessages(stateChanges, state, t) {
  const msgs = [];
  let counter = 0;
  const ts = Date.now();
  const mkId = () => `msg_sc_${ts}_${counter++}`;

  const character = state.character;
  const charName = character?.name || 'Character';

  if (stateChanges.moneyChange) {
    const mc = stateChanges.moneyChange;
    const total = (mc.gold || 0) * 100 + (mc.silver || 0) * 10 + (mc.copper || 0);
    if (total !== 0) {
      const amount = formatMoneyDelta(mc);
      if (isMoneySpent(mc)) {
        msgs.push({ id: mkId(), role: 'system', subtype: 'money_spent', content: t('system.moneySpent', { name: charName, amount }), timestamp: ts });
      } else {
        msgs.push({ id: mkId(), role: 'system', subtype: 'money_gained', content: t('system.moneyGained', { name: charName, amount }), timestamp: ts });
      }
    }
  }

  if (stateChanges.newItems?.length > 0) {
    for (const item of stateChanges.newItems) {
      const itemName = typeof item === 'string' ? item : item.name;
      msgs.push({ id: mkId(), role: 'system', subtype: 'item_gained', content: t('system.itemGained', { name: charName, item: itemName }), timestamp: ts });
    }
  }

  if (stateChanges.removeItems?.length > 0) {
    for (const item of stateChanges.removeItems) {
      const itemName = typeof item === 'string' ? item : item.name;
      msgs.push({ id: mkId(), role: 'system', subtype: 'item_lost', content: t('system.itemLost', { name: charName, item: itemName }), timestamp: ts });
    }
  }

  if (stateChanges.woundsChange != null && stateChanges.woundsChange !== 0) {
    if (stateChanges.woundsChange < 0) {
      msgs.push({ id: mkId(), role: 'system', subtype: 'damage', content: t('system.damageTaken', { name: charName, amount: Math.abs(stateChanges.woundsChange) }), timestamp: ts });
    } else {
      msgs.push({ id: mkId(), role: 'system', subtype: 'healing', content: t('system.healed', { name: charName, amount: stateChanges.woundsChange }), timestamp: ts });
    }
  }

  if (stateChanges.xp != null && stateChanges.xp > 0) {
    msgs.push({ id: mkId(), role: 'system', subtype: 'xp', content: t('system.xpGained', { name: charName, amount: stateChanges.xp }), timestamp: ts });
  }

  if (stateChanges.newQuests?.length > 0) {
    for (const q of stateChanges.newQuests) {
      const name = typeof q === 'string' ? q : q.name;
      msgs.push({ id: mkId(), role: 'system', subtype: 'quest_new', content: t('system.questNew', { quest: name }), timestamp: ts });
    }
  }

  if (stateChanges.completedQuests?.length > 0) {
    const activeQuests = state.quests?.active || [];
    for (const qId of stateChanges.completedQuests) {
      const quest = activeQuests.find((q) => q.id === qId);
      const name = quest?.name || qId;
      msgs.push({ id: mkId(), role: 'system', subtype: 'quest_completed', content: t('system.questCompleted', { quest: name }), timestamp: ts });
    }
  }

  return msgs;
}
