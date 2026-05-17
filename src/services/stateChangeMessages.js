import { xpForSkillLevel, charXpFromSkillLevelUp, cumulativeCharXpThreshold } from '../data/rpgSystem';
import { formatMoney, moneyToCopper } from '../../shared/domain/currency.js';

function currencyLabels(t) {
  return {
    gold: t('currency.goldShort', 'ZK'),
    silver: t('currency.silverShort', 'SK'),
    copper: t('currency.copperShort', 'MK'),
  };
}

function formatMoneyDelta(mc, t) {
  return formatMoney(mc, currencyLabels(t), { absolute: true });
}

function isMoneySpent(mc) {
  return moneyToCopper(mc) < 0;
}

// Mirrors resolveObj in applyStateChangesHandler/quests.js — premium labels each
// objective with its array index, so objectiveId is just `objectives[Number(raw)]`.
function resolveObjectiveForMessage(quest, rawObjId) {
  if (!quest?.objectives?.length) return null;
  const raw = rawObjId == null ? '' : String(rawObjId).trim();
  if (raw && /^\d+$/.test(raw)) {
    const idx = Number(raw);
    if (idx >= 0 && idx < quest.objectives.length) return quest.objectives[idx];
  }
  if (raw) {
    const exact = quest.objectives.find((o) => o.id === rawObjId);
    if (exact) return exact;
    const normalized = raw.toLowerCase();
    const byDesc = quest.objectives.find((o) => (o.description || '').trim().toLowerCase() === normalized);
    if (byDesc) return byDesc;
  }
  return null;
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
    const total = moneyToCopper(mc);
    if (total !== 0) {
      const amount = formatMoneyDelta(mc, t);
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

  if (stateChanges.removeItemsByName?.length > 0) {
    for (const entry of stateChanges.removeItemsByName) {
      if (!entry?.name) continue;
      const qty = entry.quantity || 1;
      const label = qty > 1 ? `${entry.name} ×${qty}` : entry.name;
      msgs.push({ id: mkId(), role: 'system', subtype: 'item_lost', content: t('system.itemLost', { name: charName, item: label }), timestamp: ts });
    }
  }

  if (stateChanges.manaChange != null && stateChanges.manaChange !== 0) {
    const amount = Math.abs(stateChanges.manaChange);
    const key = stateChanges.manaChange > 0 ? 'system.manaGained' : 'system.manaSpent';
    msgs.push({ id: mkId(), role: 'system', subtype: 'mana', content: t(key, { amount }), timestamp: ts });
  }

  if (stateChanges.manaMaxChange != null && stateChanges.manaMaxChange !== 0) {
    const delta = stateChanges.manaMaxChange > 0 ? `+${stateChanges.manaMaxChange}` : String(stateChanges.manaMaxChange);
    msgs.push({ id: mkId(), role: 'system', subtype: 'mana_max', content: t('system.manaMaxChange', { delta }), timestamp: ts });
  }

  if (typeof stateChanges.learnSpell === 'string' && stateChanges.learnSpell.trim()) {
    msgs.push({ id: mkId(), role: 'system', subtype: 'spell_learned', content: t('system.spellLearned', { spell: stateChanges.learnSpell }), timestamp: ts });
  }

  if (typeof stateChanges.addScroll === 'string' && stateChanges.addScroll.trim()) {
    msgs.push({ id: mkId(), role: 'system', subtype: 'scroll_gained', content: t('system.scrollGained', { name: stateChanges.addScroll }), timestamp: ts });
  }

  if (typeof stateChanges.consumeScroll === 'string' && stateChanges.consumeScroll.trim()) {
    msgs.push({ id: mkId(), role: 'system', subtype: 'scroll_consumed', content: t('system.scrollConsumed', { name: stateChanges.consumeScroll }), timestamp: ts });
  }

  if (typeof stateChanges.forceStatus === 'string' && stateChanges.forceStatus !== state.character?.status) {
    msgs.push({ id: mkId(), role: 'system', subtype: 'status_change', content: t('system.statusChange', { status: stateChanges.forceStatus }), timestamp: ts });
  }

  if (stateChanges.attributeChanges && typeof stateChanges.attributeChanges === 'object') {
    for (const [attr, delta] of Object.entries(stateChanges.attributeChanges)) {
      if (!delta) continue;
      const sign = delta > 0 ? `+${delta}` : String(delta);
      msgs.push({ id: mkId(), role: 'system', subtype: 'attribute_change', content: t('system.attributeChange', { attr, delta: sign }), timestamp: ts });
    }
  }

  if (stateChanges.woundsChange != null && stateChanges.woundsChange !== 0) {
    if (stateChanges.woundsChange < 0) {
      msgs.push({ id: mkId(), role: 'system', subtype: 'damage', content: t('system.damageTaken', { name: charName, amount: Math.abs(stateChanges.woundsChange) }), timestamp: ts });
    } else if (stateChanges.woundsChange > 0) {
      msgs.push({ id: mkId(), role: 'system', subtype: 'healing', content: t('system.healed', { name: charName, amount: stateChanges.woundsChange }), timestamp: ts });
    }
  }

  if (stateChanges.xp != null && stateChanges.xp > 0) {
    msgs.push({ id: mkId(), role: 'system', subtype: 'xp', content: t('system.xpGained', { name: charName, amount: stateChanges.xp }), timestamp: ts });
  }

  // Skill XP notifications
  if (stateChanges.skillProgress && typeof stateChanges.skillProgress === 'object') {
    const charSkills = state.character?.skills || {};
    let totalCharXpGained = 0;
    for (const [skillName, xpGain] of Object.entries(stateChanges.skillProgress)) {
      if (!xpGain || xpGain <= 0) continue;
      const current = charSkills[skillName] || { level: 0, xp: 0 };
      const currentXp = current.xp ?? current.progress ?? 0;

      // Simulate full level-up loop (mirrors GameContext) to count char XP
      let simXp = currentXp + xpGain;
      let simLevel = current.level;
      while (simLevel < (current.cap || 10)) {
        const req = xpForSkillLevel(simLevel + 1);
        if (req <= 0 || simXp < req) break;
        simXp -= req;
        simLevel++;
        totalCharXpGained += charXpFromSkillLevelUp(simLevel);
      }

      if (simLevel > current.level) {
        msgs.push({ id: mkId(), role: 'system', subtype: 'skill_levelup', content: `${skillName} +${xpGain} XP — Level Up! (${current.level} → ${simLevel})`, timestamp: ts });
      } else {
        msgs.push({ id: mkId(), role: 'system', subtype: 'skill_xp', content: `${skillName} +${xpGain} XP`, timestamp: ts });
      }
    }

    // Character XP gain notification — previously silent (only the bar moved).
    if (totalCharXpGained > 0) {
      msgs.push({
        id: mkId(),
        role: 'system',
        subtype: 'char_xp',
        content: t('system.charXpGained', { amount: totalCharXpGained, defaultValue: `+${totalCharXpGained} XP postaci` }),
        timestamp: ts,
      });

      // Character level-up cascade — cumulative threshold, xp is a lifetime
      // total so it is never decremented here.
      const charXp = (character?.characterXp || 0) + totalCharXpGained;
      let charLevel = character?.characterLevel || 1;
      const oldLevel = charLevel;
      while (charXp >= cumulativeCharXpThreshold(charLevel + 1)) {
        charLevel++;
      }
      if (charLevel > oldLevel) {
        const points = charLevel - oldLevel;
        msgs.push({ id: mkId(), role: 'system', subtype: 'character_levelup', content: t('system.characterLevelUp', { old: oldLevel, new: charLevel, points, defaultValue: `Poziom postaci ${oldLevel} → ${charLevel}! +${points} punkt atrybutu` }), timestamp: ts });
      }
    }
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

      if (quest?.reward) {
        const parts = [];
        if (quest.reward.xp) parts.push(`${quest.reward.xp} XP`);
        if (quest.reward.money) {
          const m = quest.reward.money;
          const moneyText = formatMoney(m, currencyLabels(t));
          if (moneyToCopper(m) > 0) parts.push(moneyText);
        }
        if (quest.reward.items?.length > 0) parts.push(quest.reward.items.map((i) => i.name || i).join(', '));
        const rewardText = parts.length > 0 ? parts.join(', ') : quest.reward.description;
        if (rewardText) {
          msgs.push({ id: mkId(), role: 'system', subtype: 'quest_reward', content: t('system.questReward', { reward: rewardText }), timestamp: ts });
        }
      }
    }
  }

  if (stateChanges.questUpdates?.length > 0) {
    const activeQuests = state.quests?.active || [];
    for (const update of stateChanges.questUpdates) {
      const quest = activeQuests.find((q) => q.id === update.questId);
      const questName = quest?.name || update.questId;

      if (update.completed) {
        const obj = resolveObjectiveForMessage(quest, update.objectiveId);
        const objDesc = obj?.description || update.objectiveId;
        msgs.push({ id: mkId(), role: 'system', subtype: 'quest_objective_completed', content: t('system.questObjectiveCompleted', { quest: questName, objective: objDesc }), timestamp: ts });
      } else if (update.addProgress) {
        msgs.push({ id: mkId(), role: 'system', subtype: 'quest_objective_progress', content: t('system.questObjectiveProgress', { quest: questName, progress: update.addProgress }), timestamp: ts });
      }
    }
  }

  if (stateChanges.newLocations?.length > 0) {
    for (const loc of stateChanges.newLocations) {
      if (!loc?.name || !loc.parentLocationName) continue;
      msgs.push({ id: mkId(), role: 'system', subtype: 'location_discovered', content: t('system.locationDiscovered', { name: loc.name }), timestamp: ts });
    }
  }

  if (typeof stateChanges.currentLocation === 'string' && stateChanges.currentLocation.trim()) {
    const prev = state.world?.currentLocation || '';
    const next = stateChanges.currentLocation;
    if (prev && prev !== next) {
      msgs.push({ id: mkId(), role: 'system', subtype: 'location_changed', content: t('system.locationChanged', { from: prev, to: next }), timestamp: ts });
    } else if (!prev) {
      msgs.push({ id: mkId(), role: 'system', subtype: 'location_changed', content: t('system.locationEntered', { to: next }), timestamp: ts });
    }
  }

  if (stateChanges.combatUpdate && typeof stateChanges.combatUpdate === 'object') {
    const cu = stateChanges.combatUpdate;
    const wasInCombat = !!state.combat;
    if (cu.active === true && !wasInCombat) {
      const enemyNames = Array.isArray(cu.enemies)
        ? cu.enemies.map((e) => e?.name).filter(Boolean).join(', ')
        : '';
      const content = enemyNames
        ? t('system.combatStartWith', { enemies: enemyNames })
        : t('system.combatStart');
      msgs.push({ id: mkId(), role: 'system', subtype: 'combat_start', content, timestamp: ts });
    } else if (cu.active === false && wasInCombat) {
      msgs.push({ id: mkId(), role: 'system', subtype: 'combat_end', content: t('system.combatEnd'), timestamp: ts });
    }
  }

  if (Array.isArray(stateChanges.npcs) && stateChanges.npcs.length > 0) {
    const worldNpcs = state.world?.npcs || [];
    const findNpc = (name) => worldNpcs.find((n) => typeof n?.name === 'string' && n.name.toLowerCase() === String(name || '').toLowerCase());
    for (const incoming of stateChanges.npcs) {
      if (!incoming?.name) continue;
      const existing = findNpc(incoming.name);
      if (incoming.action === 'introduce' && !existing) {
        msgs.push({ id: mkId(), role: 'system', subtype: 'npc_met', content: t('system.npcMet', { name: incoming.name }), timestamp: ts });
      }
      if (incoming.alive === false && existing && existing.alive !== false) {
        msgs.push({ id: mkId(), role: 'system', subtype: 'npc_died', content: t('system.npcDied', { name: incoming.name }), timestamp: ts });
      }
      if (typeof incoming.dispositionChange === 'number' && Math.abs(incoming.dispositionChange) >= 5) {
        const sign = incoming.dispositionChange > 0 ? `+${incoming.dispositionChange}` : String(incoming.dispositionChange);
        msgs.push({ id: mkId(), role: 'system', subtype: 'npc_disposition', content: t('system.npcDisposition', { name: incoming.name, delta: sign }), timestamp: ts });
      }
    }
  }

  if (stateChanges.factionChanges && typeof stateChanges.factionChanges === 'object') {
    const factionLookup = state.world?.factions || {};
    for (const [factionId, delta] of Object.entries(stateChanges.factionChanges)) {
      if (!delta) continue;
      const factionName = (factionLookup[factionId] && factionLookup[factionId].name) || factionId;
      const sign = delta > 0 ? `+${delta}` : String(delta);
      msgs.push({ id: mkId(), role: 'system', subtype: 'faction_change', content: t('system.factionChange', { faction: factionName, delta: sign }), timestamp: ts });
    }
  }

  if (Array.isArray(stateChanges.activeEffects) && stateChanges.activeEffects.length > 0) {
    for (const fx of stateChanges.activeEffects) {
      if (fx?.action === 'add' && fx?.description) {
        msgs.push({ id: mkId(), role: 'system', subtype: 'effect_added', content: t('system.effectAdded', { description: fx.description }), timestamp: ts });
      }
    }
  }

  if (stateChanges.campaignEnd && typeof stateChanges.campaignEnd === 'object') {
    const status = stateChanges.campaignEnd.status || 'completed';
    msgs.push({ id: mkId(), role: 'system', subtype: 'campaign_end', content: t('system.campaignEnd', { status }), timestamp: ts });
  }

  return msgs;
}
