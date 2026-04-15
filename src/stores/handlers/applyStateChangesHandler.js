import { SKILL_CAPS, xpForSkillLevel } from '../../data/rpgSystem';
import { calculateMaxWounds, normalizeMoney } from '../../services/gameState';
import { createCombatState } from '../../services/combatEngine';
import { hourToPeriod, decayNeeds } from '../../services/timeUtils';
import { shortId } from '../../utils/ids';
import { mergeUnique } from '../../../shared/domain/arrays';
import {
  PERIOD_START_HOUR,
  createDefaultNeeds,
  stackMaterials,
  ensureMapContainsLocationDraft,
} from './_shared';

/**
 * Mega-handler for `APPLY_STATE_CHANGES` — applies a full AI-scene state-change
 * payload in one pass. Each conditional below corresponds to one field of the
 * AI response schema. Keep order meaningful: character mutations happen before
 * world updates so character-dependent world logic (act progression, kb refresh)
 * sees the post-character state.
 */
export function applyStateChangesHandler(draft, action) {
  const changes = action.payload;

  // --- Campaign end from AI ---
  if (changes.campaignEnd && draft.campaign) {
    draft.campaign.status = changes.campaignEnd.status || 'completed';
    draft.campaign.epilogue = changes.campaignEnd.epilogue || '';
  }

  // --- Wounds ---
  // NOTE: changes.xp is intentionally ignored on the FE. Character XP is
  // authoritative on the backend and arrives via RECONCILE_CHARACTER_FROM_BACKEND.
  // Scene messages still read changes.xp to display "+X XP" toasts, but the
  // character state itself is not mutated here.
  if (changes.woundsChange !== undefined && draft.character) {
    const newWounds = Math.max(0, Math.min(draft.character.maxWounds, draft.character.wounds + changes.woundsChange));
    draft.character.wounds = newWounds;
    if (newWounds === 0 && changes.woundsChange < 0) {
      draft.character.status = 'dead';
    }
  }

  if (changes.forceStatus && draft.character) {
    draft.character.status = changes.forceStatus;
  }

  if (changes.manaChange !== undefined && draft.character) {
    if (!draft.character.mana) draft.character.mana = { current: 0, max: 0 };
    const mana = draft.character.mana;
    mana.current = Math.max(0, Math.min(mana.max, mana.current + changes.manaChange));
  }

  if (changes.manaMaxChange !== undefined && draft.character) {
    if (!draft.character.mana) draft.character.mana = { current: 0, max: 0 };
    draft.character.mana.max = Math.max(0, draft.character.mana.max + changes.manaMaxChange);
  }

  if (changes.attributeChanges && draft.character) {
    for (const [key, amount] of Object.entries(changes.attributeChanges)) {
      draft.character.attributes[key] = Math.max(1, (draft.character.attributes[key] || 0) + amount);
    }
    const newMaxWounds = calculateMaxWounds(draft.character.attributes.wytrzymalosc);
    draft.character.maxWounds = newMaxWounds;
    draft.character.wounds = Math.min(draft.character.wounds, newMaxWounds);
  }

  // --- Skill XP + level-ups ---
  // Skill xp/level is applied locally so the UI can show the progress bar
  // during the brief window before RECONCILE_CHARACTER_FROM_BACKEND overwrites
  // the whole character. Char XP cascade happens on BE and arrives via RECONCILE.
  if (changes.skillProgress && draft.character) {
    for (const [skillName, xpGain] of Object.entries(changes.skillProgress)) {
      if (!draft.character.skills[skillName]) {
        draft.character.skills[skillName] = { level: 0, xp: 0, cap: SKILL_CAPS.basic };
      }
      const skill = draft.character.skills[skillName];
      skill.xp = (skill.xp ?? skill.progress ?? 0) + xpGain;

      while (skill.level < skill.cap) {
        const needed = xpForSkillLevel(skill.level + 1);
        if (needed <= 0 || skill.xp < needed) break;
        skill.xp -= needed;
        skill.level += 1;
      }
    }
  }

  // --- Spell-related changes ---
  if (changes.spellUsage && draft.character) {
    if (!draft.character.spells) draft.character.spells = { known: [], usageCounts: {}, scrolls: [] };
    if (!draft.character.spells.usageCounts) draft.character.spells.usageCounts = {};
    for (const [spellName, uses] of Object.entries(changes.spellUsage)) {
      draft.character.spells.usageCounts[spellName] = (draft.character.spells.usageCounts[spellName] || 0) + uses;
    }
  }

  if (changes.learnSpell && draft.character) {
    if (!draft.character.spells) draft.character.spells = { known: [], usageCounts: {}, scrolls: [] };
    if (!draft.character.spells.known.includes(changes.learnSpell)) {
      draft.character.spells.known.push(changes.learnSpell);
    }
  }

  if (changes.consumeScroll && draft.character) {
    if (!draft.character.spells) draft.character.spells = { known: [], usageCounts: {}, scrolls: [] };
    draft.character.spells.scrolls = draft.character.spells.scrolls.filter((s) => s !== changes.consumeScroll);
  }

  if (changes.addScroll && draft.character) {
    if (!draft.character.spells) draft.character.spells = { known: [], usageCounts: {}, scrolls: [] };
    draft.character.spells.scrolls.push(changes.addScroll);
  }

  // --- Inventory + materials ---
  if (changes.newItems && draft.character) {
    const regularItems = [];
    const materialItems = [];
    for (const item of changes.newItems) {
      if (item.type === 'material') {
        materialItems.push(item);
      } else {
        regularItems.push(item);
      }
    }
    if (regularItems.length > 0) {
      if (!draft.character.inventory) draft.character.inventory = [];
      draft.character.inventory.push(...regularItems);
    }
    if (materialItems.length > 0) {
      draft.character.materialBag = stackMaterials(draft.character.materialBag || [], materialItems);
    }
  }

  if (changes.newMaterials && draft.character) {
    draft.character.materialBag = stackMaterials(draft.character.materialBag || [], changes.newMaterials);
  }

  if (changes.removeItems && draft.character?.inventory) {
    draft.character.inventory = draft.character.inventory.filter(
      (i) => !changes.removeItems.includes(i.id)
    );
  }

  // Remove items by name + quantity (crafting/alchemy). Checks materialBag first, then inventory.
  if (changes.removeItemsByName && draft.character) {
    const removeFromArray = (arr, name, remaining) => {
      const lower = name.toLowerCase();
      const out = [];
      for (const item of arr) {
        if (remaining <= 0 || (item.name || '').toLowerCase() !== lower) {
          out.push(item);
          continue;
        }
        const qty = item.quantity || 1;
        if (qty <= remaining) {
          remaining -= qty;
        } else {
          out.push({ ...item, quantity: qty - remaining });
          remaining = 0;
        }
      }
      return { out, remaining };
    };

    for (const { name, quantity } of changes.removeItemsByName) {
      let remaining = quantity;
      const bagResult = removeFromArray(draft.character.materialBag || [], name, remaining);
      draft.character.materialBag = bagResult.out;
      remaining = bagResult.remaining;
      if (remaining > 0) {
        const invResult = removeFromArray(draft.character.inventory || [], name, remaining);
        draft.character.inventory = invResult.out;
      }
    }
  }

  if (changes.moneyChange && draft.character) {
    const cur = draft.character.money || { gold: 0, silver: 0, copper: 0 };
    draft.character.money = normalizeMoney({
      gold: (cur.gold || 0) + (changes.moneyChange.gold || 0),
      silver: (cur.silver || 0) + (changes.moneyChange.silver || 0),
      copper: (cur.copper || 0) + (changes.moneyChange.copper || 0),
    });
  }

  // --- Quests: new, completed, updates ---
  if (changes.newQuests) {
    const normalized = changes.newQuests.map((q) => ({
      ...q,
      objectives: (q.objectives || []).map((obj) => ({ ...obj, completed: obj.completed ?? false })),
      questGiverId: q.questGiverId || null,
      turnInNpcId: q.turnInNpcId || q.questGiverId || null,
      locationId: q.locationId || null,
      prerequisiteQuestIds: q.prerequisiteQuestIds || [],
      reward: q.reward || null,
      type: q.type || 'side',
    }));
    draft.quests.active.push(...normalized);
    for (const quest of normalized) {
      if (quest?.locationId) {
        ensureMapContainsLocationDraft(draft.world, quest.locationId);
      }
    }
  }

  if (changes.completedQuests) {
    const activeIds = new Set(draft.quests.active.map((q) => q.id));
    const validIds = changes.completedQuests.filter((id) => activeIds.has(id));
    if (validIds.length > 0) {
      const completed = draft.quests.active.filter((q) => validIds.includes(q.id));

      let totalRewardXp = 0;
      const rewardMoney = { gold: 0, silver: 0, copper: 0 };
      const rewardItems = [];
      for (const q of completed) {
        if (q.reward) {
          if (q.reward.xp) totalRewardXp += q.reward.xp;
          if (q.reward.money) {
            rewardMoney.gold += q.reward.money.gold || 0;
            rewardMoney.silver += q.reward.money.silver || 0;
            rewardMoney.copper += q.reward.money.copper || 0;
          }
          if (q.reward.items?.length > 0) rewardItems.push(...q.reward.items);
        }
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
  }

  if (changes.questUpdates?.length > 0) {
    for (const update of changes.questUpdates) {
      const quest = draft.quests.active.find((q) => q.id === update.questId);
      if (!quest?.objectives) continue;
      const obj = quest.objectives.find((o) => o.id === update.objectiveId);
      if (!obj) continue;
      obj.completed = !!update.completed;
      if (update.addProgress) {
        const prev = obj.progress || '';
        obj.progress = prev ? `${prev}; ${update.addProgress}` : update.addProgress;
      }
    }
  }

  // --- World facts + journal ---
  if (changes.worldFacts) {
    draft.world.facts.push(...changes.worldFacts);
  }

  if (changes.journalEntries?.length > 0) {
    if (!draft.world.eventHistory) draft.world.eventHistory = [];
    draft.world.eventHistory.push(...changes.journalEntries);
  }

  if (changes.statuses && draft.character) {
    draft.character.statuses = changes.statuses;
  }

  // --- NPCs: introduce or update ---
  if (changes.npcs?.length > 0) {
    if (!draft.world.npcs) draft.world.npcs = [];
    for (const incoming of changes.npcs) {
      const idx = draft.world.npcs.findIndex((n) => n.name?.toLowerCase() === incoming.name?.toLowerCase());

      if (incoming.action === 'introduce' && idx < 0) {
        draft.world.npcs.push({
          id: `npc_${Date.now()}_${shortId(5)}`,
          name: incoming.name,
          gender: incoming.gender || 'unknown',
          role: incoming.role || '',
          personality: incoming.personality || '',
          attitude: incoming.attitude || 'neutral',
          lastLocation: incoming.location || '',
          alive: true,
          notes: incoming.notes || '',
          disposition: 0,
          factionId: incoming.factionId || null,
          relatedQuestIds: incoming.relatedQuestIds || [],
          relationships: incoming.relationships || [],
        });
        continue;
      }
      if (idx < 0) continue;

      const npc = draft.world.npcs[idx];
      if (incoming.gender) npc.gender = incoming.gender;
      if (incoming.role) npc.role = incoming.role;
      if (incoming.personality) npc.personality = incoming.personality;
      if (incoming.attitude) npc.attitude = incoming.attitude;
      if (incoming.location) npc.lastLocation = incoming.location;
      if (incoming.notes) npc.notes = incoming.notes;

      // Non-introduce updates carry more fields
      if (incoming.action !== 'introduce') {
        if (incoming.alive !== undefined) npc.alive = incoming.alive;
        if (incoming.factionId !== undefined) npc.factionId = incoming.factionId;

        if (incoming.relatedQuestIds?.length > 0) {
          npc.relatedQuestIds = mergeUnique(npc.relatedQuestIds, incoming.relatedQuestIds);
        }
        if (incoming.relationships?.length > 0) {
          const filteredExisting = (npc.relationships || []).filter(
            (r) => !incoming.relationships.some((nr) => nr.npcName === r.npcName)
          );
          npc.relationships = [...filteredExisting, ...incoming.relationships];
        }
        if (typeof incoming.dispositionChange === 'number') {
          npc.disposition = Math.max(-50, Math.min(50, (npc.disposition || 0) + incoming.dispositionChange));
        }
      } else {
        // introduce + existing: still set optional relationship fields
        if (incoming.factionId !== undefined) npc.factionId = incoming.factionId;
        if (incoming.relatedQuestIds?.length > 0) npc.relatedQuestIds = incoming.relatedQuestIds;
        if (incoming.relationships?.length > 0) npc.relationships = incoming.relationships;
      }
    }
  }

  // --- Map changes ---
  if (changes.mapChanges?.length > 0) {
    if (!draft.world.mapState) draft.world.mapState = [];
    for (const change of changes.mapChanges) {
      const idx = draft.world.mapState.findIndex((m) => m.name?.toLowerCase() === change.location?.toLowerCase());
      const modification = { description: change.modification, type: change.type || 'other', timestamp: Date.now() };
      if (idx >= 0) {
        if (!draft.world.mapState[idx].modifications) draft.world.mapState[idx].modifications = [];
        draft.world.mapState[idx].modifications.push(modification);
      } else {
        draft.world.mapState.push({
          id: `loc_${Date.now()}_${shortId(5)}`,
          name: change.location,
          description: '',
          modifications: [modification],
        });
      }
    }
  }

  // --- Time advance + needs decay ---
  if (changes.timeAdvance) {
    const ts = draft.world.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
    const currentHour = ts.hour ?? 6;

    let hoursElapsed = changes.timeAdvance.hoursElapsed;
    if (!hoursElapsed && changes.timeAdvance.timeOfDay) {
      const targetHour = PERIOD_START_HOUR[changes.timeAdvance.timeOfDay] ?? currentHour;
      hoursElapsed = targetHour > currentHour
        ? targetHour - currentHour
        : targetHour < currentHour ? (24 - currentHour + targetHour) : 0;
    }
    hoursElapsed = hoursElapsed || 0.5;

    let newHour = currentHour + hoursElapsed;
    let dayIncrement = 0;
    while (newHour >= 24) { newHour -= 24; dayIncrement++; }
    if (changes.timeAdvance.newDay && dayIncrement === 0) dayIncrement = 1;

    draft.world.timeState = {
      ...ts,
      hour: Math.round(newHour * 10) / 10,
      timeOfDay: hourToPeriod(newHour),
      day: ts.day + dayIncrement,
      ...(changes.timeAdvance.season && { season: changes.timeAdvance.season }),
    };

    if (draft.character) {
      const currentNeeds = draft.character.needs || createDefaultNeeds();
      draft.character.needs = decayNeeds(currentNeeds, hoursElapsed);
    }
  }

  if (changes.needsChanges && draft.character) {
    if (!draft.character.needs) draft.character.needs = createDefaultNeeds();
    for (const [key, delta] of Object.entries(changes.needsChanges)) {
      if (key in draft.character.needs) {
        draft.character.needs[key] = Math.max(0, Math.min(100, (draft.character.needs[key] ?? 100) + delta));
      }
    }
    if (changes.needsChanges.rest > 0) {
      draft.momentumBonus = 0;
    }
  }

  // --- Knowledge base: explicit updates (events/decisions/plotThreads) ---
  if (changes.knowledgeUpdates && draft.world) {
    if (!draft.world.knowledgeBase) {
      draft.world.knowledgeBase = { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] };
    }
    const kb = draft.world.knowledgeBase;
    const ku = changes.knowledgeUpdates;
    const sceneIdx = draft.scenes?.length || 0;

    if (ku.events?.length > 0) {
      kb.events.push(...ku.events.map((e) => ({ ...e, sceneIndex: sceneIdx })));
      if (kb.events.length > 50) kb.events = kb.events.slice(-50);
    }
    if (ku.decisions?.length > 0) {
      kb.decisions.push(...ku.decisions.map((d) => ({ ...d, sceneIndex: sceneIdx })));
      if (kb.decisions.length > 50) kb.decisions = kb.decisions.slice(-50);
    }
    if (ku.plotThreads?.length > 0) {
      for (const pt of ku.plotThreads) {
        const existing = kb.plotThreads.find((t) => t.id === pt.id);
        if (existing) {
          Object.assign(existing, pt);
          existing.relatedNpcIds = mergeUnique(existing.relatedNpcIds, pt.relatedNpcIds);
          existing.relatedQuestIds = mergeUnique(existing.relatedQuestIds, pt.relatedQuestIds);
          existing.relatedLocationIds = mergeUnique(existing.relatedLocationIds, pt.relatedLocationIds);
          existing.relatedScenes = mergeUnique(existing.relatedScenes, sceneIdx);
        } else {
          kb.plotThreads.push({
            ...pt,
            relatedNpcIds: pt.relatedNpcIds || [],
            relatedQuestIds: pt.relatedQuestIds || [],
            relatedLocationIds: pt.relatedLocationIds || [],
            relatedScenes: [sceneIdx],
          });
        }
      }
    }
  }

  // --- Codex updates ---
  if (changes.codexUpdates?.length > 0 && draft.world) {
    if (!draft.world.codex) draft.world.codex = {};
    const codex = draft.world.codex;
    const MAX_CODEX_ENTRIES = 100;
    const MAX_FRAGMENTS_PER_ENTRY = 10;
    const sceneIdx = draft.scenes?.length || 0;

    for (const update of changes.codexUpdates) {
      if (!update.id || !update.fragment?.content) continue;
      const existing = codex[update.id];
      if (existing) {
        const isDuplicate = existing.fragments.some((f) => f.content === update.fragment.content);
        if (!isDuplicate && existing.fragments.length < MAX_FRAGMENTS_PER_ENTRY) {
          existing.fragments.push({
            id: `frag_${Date.now()}_${shortId(5)}`,
            ...update.fragment,
            sceneIndex: sceneIdx,
            timestamp: Date.now(),
          });
          existing.tags = mergeUnique(existing.tags, update.tags);
          existing.relatedEntries = mergeUnique(existing.relatedEntries, update.relatedEntries);
        }
      } else if (Object.keys(codex).length < MAX_CODEX_ENTRIES) {
        codex[update.id] = {
          id: update.id,
          name: update.name,
          category: update.category || 'concept',
          fragments: [{
            id: `frag_${Date.now()}_${shortId(5)}`,
            ...update.fragment,
            sceneIndex: sceneIdx,
            timestamp: Date.now(),
          }],
          tags: update.tags || [],
          relatedEntries: update.relatedEntries || [],
          firstDiscovered: Date.now(),
        };
      }
    }
  }

  // --- Auto-populate knowledgeBase.characters and .locations ---
  {
    if (!draft.world.knowledgeBase) {
      draft.world.knowledgeBase = { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] };
    }
    const kb = draft.world.knowledgeBase;
    const sceneIdx = draft.scenes?.length || 0;

    if (changes.npcs?.length > 0) {
      if (!kb.characters) kb.characters = {};
      for (const npc of (draft.world.npcs || [])) {
        const changedNpc = changes.npcs.find((n) => n.name?.toLowerCase() === npc.name?.toLowerCase());
        if (!changedNpc) continue;
        const key = npc.name.toLowerCase();
        const existing = kb.characters[key] || { interactionCount: 0, knownFacts: [] };
        kb.characters[key] = {
          name: npc.name,
          lastSeen: npc.lastLocation || existing.lastSeen || '',
          lastSeenScene: sceneIdx,
          disposition: npc.disposition ?? existing.disposition ?? 0,
          factionId: npc.factionId || existing.factionId || null,
          role: npc.role || existing.role || '',
          alive: npc.alive ?? existing.alive ?? true,
          interactionCount: existing.interactionCount + 1,
          knownFacts: existing.knownFacts,
          relationships: npc.relationships || existing.relationships || [],
        };
      }
    }

    const currentLoc = changes.currentLocation || draft.world.currentLocation;
    if (currentLoc) {
      if (!kb.locations) kb.locations = {};
      const key = currentLoc.toLowerCase();
      const existing = kb.locations[key] || { visitCount: 0, knownFacts: [], npcsEncountered: [] };
      const npcsHere = (draft.world.npcs || [])
        .filter((n) => n.alive !== false && n.lastLocation?.toLowerCase() === currentLoc.toLowerCase())
        .map((n) => n.name);
      const mergedNpcs = mergeUnique(existing.npcsEncountered, npcsHere);
      kb.locations[key] = {
        name: currentLoc,
        visitCount: existing.visitCount + (changes.currentLocation ? 1 : 0),
        lastVisited: sceneIdx,
        knownFacts: existing.knownFacts,
        npcsEncountered: mergedNpcs,
      };
    }
  }

  // --- Rest-crisis penalty ---
  if (draft.character?.needs) {
    const hasRestCrisis = (draft.character.needs.rest ?? 100) === 0;
    if (hasRestCrisis && !draft.character.needsPenalty) {
      draft.character.needsPenalty = -10;
    } else if (!hasRestCrisis && draft.character.needsPenalty) {
      draft.character.needsPenalty = 0;
    }
  }

  // --- Active effects (add/remove/trigger) ---
  if (changes.activeEffects?.length > 0) {
    if (!draft.world.activeEffects) draft.world.activeEffects = [];
    for (const fx of changes.activeEffects) {
      if (fx.action === 'add') {
        draft.world.activeEffects.push({
          id: fx.id || `fx_${Date.now()}_${shortId(5)}`,
          type: fx.type || 'other',
          location: fx.location || '',
          description: fx.description || '',
          placedBy: fx.placedBy || '',
          active: true,
        });
      } else if (fx.action === 'remove') {
        draft.world.activeEffects = draft.world.activeEffects.filter((e) => e.id !== fx.id);
      } else if (fx.action === 'trigger') {
        const effect = draft.world.activeEffects.find((e) => e.id === fx.id);
        if (effect) effect.active = false;
      }
    }
  }

  // --- Faction changes ---
  if (changes.factionChanges && typeof changes.factionChanges === 'object') {
    if (!draft.world.factions) draft.world.factions = {};
    for (const [factionId, delta] of Object.entries(changes.factionChanges)) {
      const current = draft.world.factions[factionId] || 0;
      draft.world.factions[factionId] = Math.max(-100, Math.min(100, current + delta));
    }
  }

  // --- Combat start/end from AI ---
  if (changes.combatUpdate?.active) {
    const allies = (draft.party || []).filter((c) => c.id !== draft.activeCharacterId);
    // createCombatState produces a plain object — safe to assign directly to draft.
    draft.combat = createCombatState(draft.character, changes.combatUpdate.enemies || [], allies);
    draft.combat.reason = changes.combatUpdate.reason;
  } else if (changes.combatUpdate && !changes.combatUpdate.active) {
    draft.combat = null;
  }

  // --- Trade panel activation from AI stateChanges ---
  if (changes.startTrade && changes.startTrade.npcName) {
    draft.trade = {
      active: true,
      npcName: changes.startTrade.npcName,
      pendingSetup: true, // signals panel to build shopItems
      shopItems: [],
      haggleAttempts: 0,
      maxHaggle: 3,
      haggleLog: [],
      haggleDiscounts: {},
    };
    const npc = (draft.world?.npcs || []).find(
      (n) => n.name?.toLowerCase() === changes.startTrade.npcName.toLowerCase()
    );
    if (npc) {
      draft.trade.npcRole = npc.role || 'merchant';
      draft.trade.disposition = npc.disposition || 0;
    }
  }

  // --- Act progression ---
  if (draft.campaign?.structure?.acts?.length > 0) {
    const structure = draft.campaign.structure;
    const currentAct = structure.acts.find((a) => a.number === structure.currentAct);
    if (currentAct) {
      const scenesBeforeAct = structure.acts
        .filter((a) => a.number < structure.currentAct)
        .reduce((sum, a) => sum + (a.targetScenes || 0), 0);
      const scenesInAct = (draft.scenes?.length || 0) - scenesBeforeAct;
      if (scenesInAct >= (currentAct.targetScenes || 999)) {
        const nextActNum = structure.currentAct + 1;
        if (structure.acts.some((a) => a.number === nextActNum)) {
          structure.currentAct = nextActNum;
        }
      }
    }
  }

  // --- Current location + auto-add to explored + map connections ---
  if (changes.currentLocation) {
    if (!draft.world.exploredLocations) draft.world.exploredLocations = [];
    const explored = new Set(draft.world.exploredLocations);
    explored.add(changes.currentLocation);
    draft.world.exploredLocations = [...explored];

    const prevLoc = draft.world.currentLocation;
    const newLoc = changes.currentLocation;

    if (prevLoc && newLoc && prevLoc.toLowerCase() !== newLoc.toLowerCase()) {
      if (!draft.world.mapConnections) draft.world.mapConnections = [];
      const already = draft.world.mapConnections.some(
        (c) =>
          (c.from.toLowerCase() === prevLoc.toLowerCase() && c.to.toLowerCase() === newLoc.toLowerCase()) ||
          (c.from.toLowerCase() === newLoc.toLowerCase() && c.to.toLowerCase() === prevLoc.toLowerCase())
      );
      if (!already) {
        draft.world.mapConnections.push({ from: prevLoc, to: newLoc });
      }

      if (!draft.world.mapState) draft.world.mapState = [];
      for (const locName of [prevLoc, newLoc]) {
        if (!draft.world.mapState.some((m) => m.name?.toLowerCase() === locName.toLowerCase())) {
          draft.world.mapState.push({
            id: `loc_${Date.now()}_${shortId(5)}`,
            name: locName,
            description: '',
            modifications: [],
          });
        }
      }
    }

    draft.world.currentLocation = newLoc;
  }

  // --- Narrative seeds + npc agendas + callbacks ---
  if (changes.narrativeSeeds?.length > 0) {
    if (!draft.world.narrativeSeeds) draft.world.narrativeSeeds = [];
    const existingIds = new Set(draft.world.narrativeSeeds.map((e) => e.id));
    const sceneIdx = draft.scenes?.length || 0;
    for (const seed of changes.narrativeSeeds) {
      if (existingIds.has(seed.id)) continue;
      draft.world.narrativeSeeds.push({ ...seed, planted: seed.planted ?? sceneIdx });
    }
    if (draft.world.narrativeSeeds.length > 30) {
      draft.world.narrativeSeeds = draft.world.narrativeSeeds.slice(-30);
    }
  }

  if (changes.resolvedSeeds?.length > 0 && draft.world.narrativeSeeds) {
    for (const seed of draft.world.narrativeSeeds) {
      if (changes.resolvedSeeds.includes(seed.id)) seed.resolved = true;
    }
  }

  if (changes.npcAgendas?.length > 0) {
    if (!draft.world.npcAgendas) draft.world.npcAgendas = [];
    const sceneIdx = draft.scenes?.length || 0;
    for (const agenda of changes.npcAgendas) {
      const existing = draft.world.npcAgendas.find(
        (a) => a.npcName?.toLowerCase() === agenda.npcName?.toLowerCase()
      );
      if (existing) {
        Object.assign(existing, agenda);
      } else {
        draft.world.npcAgendas.push({ ...agenda, plantedScene: agenda.plantedScene ?? sceneIdx });
      }
    }
    if (draft.world.npcAgendas.length > 20) {
      draft.world.npcAgendas = draft.world.npcAgendas.slice(-20);
    }
  }

  if (changes.pendingCallbacks?.length > 0 && draft.world?.knowledgeBase?.decisions?.length) {
    const decisions = draft.world.knowledgeBase.decisions;
    const last = decisions[decisions.length - 1];
    if (!last.pendingCallbacks) last.pendingCallbacks = [];
    last.pendingCallbacks.push(...changes.pendingCallbacks);
  }

  // --- Field map mode change ---
  if (changes.mapMode && draft.world?.fieldMap) {
    const fm = draft.world.fieldMap;
    const newMode = changes.mapMode;
    const newVariant = newMode === 'trakt' ? (changes.roadVariant || null) : null;
    if (fm.mapMode !== newMode || fm.roadVariant !== newVariant) {
      fm.mapMode = newMode;
      fm.roadVariant = newVariant;
      fm.chunks = {};
      fm.stepCounter = 0;
      fm.stepBuffer = [];
      fm.discoveredPoi = [];
    }
  }
}
