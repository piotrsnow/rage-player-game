import { normalizeMultiplayerStateChanges } from '../contracts/multiplayer.js';
import { prefixedId } from './ids.js';
import { mergeUnique } from './arrays.js';
import { moneyToCopper, normalizeCoins } from './currency.js';

function createId(prefix) {
  return prefixedId(prefix, 5);
}

function defaultPeriodResolver(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

function defaultDecayNeeds(needs) {
  return needs;
}

function applyTimeAdvance(world, timeAdvance, periodResolver) {
  const ts = world.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
  const hoursElapsed = timeAdvance.hoursElapsed || 0.5;
  let newHour = (ts.hour ?? 6) + hoursElapsed;
  let dayIncrement = 0;
  while (newHour >= 24) {
    newHour -= 24;
    dayIncrement += 1;
  }
  if (timeAdvance.newDay && dayIncrement === 0) dayIncrement = 1;
  return {
    ...ts,
    hour: Math.round(newHour * 10) / 10,
    timeOfDay: periodResolver(newHour),
    day: ts.day + dayIncrement,
    ...(timeAdvance.season && { season: timeAdvance.season }),
  };
}

export function applyMultiplayerSceneStateChanges(gameState, sceneResult, options = {}) {
  const stateChanges = normalizeMultiplayerStateChanges(sceneResult?.stateChanges || {});
  const needsEnabled = options.needsEnabled === true;
  const periodResolver = options.periodResolver || defaultPeriodResolver;
  const decayNeeds = options.decayNeeds || defaultDecayNeeds;
  const now = options.now || Date.now;
  const sceneIndex = options.sceneIndex ?? (gameState.scenes || []).length;

  const timeAdvance = stateChanges.timeAdvance;
  const hoursElapsed = timeAdvance?.hoursElapsed || 0.5;

  let updatedCharacters = [...(gameState.characters || [])];
  const perChar = stateChanges.perCharacter;
  if (perChar) {
    updatedCharacters = updatedCharacters.map((c) => {
      const delta = perChar[c.name] || perChar[c.playerName];
      if (!delta) return c;
      const updated = { ...c };
      if (delta.wounds != null) {
        const newWounds = Math.max(0, Math.min(updated.maxWounds, updated.wounds + delta.wounds));
        if (newWounds === 0 && delta.wounds < 0) {
          const currentCritCount = updated.criticalWoundCount || 0;
          updated.criticalWoundCount = currentCritCount + 1;
          if (updated.criticalWoundCount >= 3) {
            updated.status = 'dead';
            updated.wounds = 0;
          } else {
            updated.wounds = newWounds;
          }
        } else {
          updated.wounds = newWounds;
        }
      }
      if (delta.xp != null) updated.xp = (updated.xp || 0) + delta.xp;
      if (delta.hp != null && updated.hp != null) updated.hp = Math.max(0, Math.min(updated.maxHp || 100, updated.hp + delta.hp));
      if (delta.mana != null && updated.mana != null) updated.mana = Math.max(0, Math.min(updated.maxMana || 50, updated.mana + delta.mana));
      if (Array.isArray(delta.newItems)) updated.inventory = [...(updated.inventory || []), ...delta.newItems];
      if (Array.isArray(delta.removeItems)) {
        const removeSet = new Set(delta.removeItems.map((i) => (typeof i === 'string' ? i : i.name)));
        updated.inventory = (updated.inventory || []).filter((i) => !removeSet.has(typeof i === 'string' ? i : i.name));
      }
      if (delta.moneyChange) {
        const cur = updated.money || { gold: 0, silver: 0, copper: 0 };
        updated.money = normalizeCoins(moneyToCopper(cur) + moneyToCopper(delta.moneyChange));
      }
      if (needsEnabled && delta.needsChanges) {
        const needs = { ...(updated.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 }) };
        for (const [key, val] of Object.entries(delta.needsChanges)) {
          if (key in needs) {
            needs[key] = Math.max(0, Math.min(100, (needs[key] ?? 100) + val));
          }
        }
        updated.needs = needs;
      }
      if (delta.statuses) updated.statuses = delta.statuses;
      return updated;
    });
  }

  if (needsEnabled && timeAdvance) {
    updatedCharacters = updatedCharacters.map((c) => (c.needs ? { ...c, needs: decayNeeds(c.needs, hoursElapsed) } : c));
  }

  let updatedWorld = { ...(gameState.world || {}) };
  if (timeAdvance) updatedWorld.timeState = applyTimeAdvance(updatedWorld, timeAdvance, periodResolver);
  if (Array.isArray(stateChanges.worldFacts) && stateChanges.worldFacts.length > 0) updatedWorld.facts = [...(updatedWorld.facts || []), ...stateChanges.worldFacts];
  if (Array.isArray(stateChanges.journalEntries) && stateChanges.journalEntries.length > 0) updatedWorld.eventHistory = [...(updatedWorld.eventHistory || []), ...stateChanges.journalEntries];
  if (stateChanges.weatherUpdate) updatedWorld.weather = stateChanges.weatherUpdate;
  // Faza 3.5 — preferuj composite ref. Legacy string path zachowany.
  if (stateChanges.currentLocationRef) {
    const ref = stateChanges.currentLocationRef;
    if (typeof ref === 'object' && ref.kind && ref.id) {
      updatedWorld.currentLocationRef = { kind: ref.kind, id: ref.id };
    } else if (typeof ref === 'string') {
      const m = ref.match(/^(world|campaign):([0-9a-f-]{36})$/i);
      if (m) updatedWorld.currentLocationRef = { kind: m[1].toLowerCase(), id: m[2] };
    }
  }
  if (stateChanges.currentLocation) {
    updatedWorld.currentLocation = stateChanges.currentLocation;
    // DEPRECATED: mapConnections writes removed — LocationEdge graph is the
    // source of truth for connectivity (parity with SP applyCurrentLocation).
    const explored = new Set(updatedWorld.exploredLocations || []);
    explored.add(stateChanges.currentLocation);
    updatedWorld.exploredLocations = [...explored];
  }

  if (Array.isArray(stateChanges.mapChanges) && stateChanges.mapChanges.length > 0) {
    const mapState = [...(updatedWorld.mapState || [])];
    for (const change of stateChanges.mapChanges) {
      const idx = mapState.findIndex((m) => m.name?.toLowerCase() === change.location?.toLowerCase());
      if (idx >= 0) {
        mapState[idx] = {
          ...mapState[idx],
          modifications: [...(mapState[idx].modifications || []), { description: change.modification, type: change.type || 'other', timestamp: now() }],
        };
      } else {
        mapState.push({
          id: createId('loc'),
          name: change.location,
          description: '',
          modifications: [{ description: change.modification, type: change.type || 'other', timestamp: now() }],
        });
      }
    }
    updatedWorld.mapState = mapState;
  }

  if (Array.isArray(stateChanges.npcs) && stateChanges.npcs.length > 0) {
    const npcs = [...(updatedWorld.npcs || [])];
    for (const npc of stateChanges.npcs) {
      const idx = npcs.findIndex((n) => n.name?.toLowerCase() === npc.name?.toLowerCase());
      if (npc.action === 'introduce' && idx < 0) {
        npcs.push({
          id: createId('npc'),
          name: npc.name,
          gender: npc.gender || 'unknown',
          role: npc.role || '',
          personality: npc.personality || '',
          attitude: npc.attitude || 'neutral',
          lastLocation: npc.location || '',
          alive: true,
          notes: npc.notes || '',
          disposition: 0,
          factionId: npc.factionId || null,
          relatedQuestIds: npc.relatedQuestIds || [],
          relationships: npc.relationships || [],
        });
      } else if (idx >= 0) {
        const mergedRelQuestIds = npc.relatedQuestIds?.length > 0
          ? mergeUnique(npcs[idx].relatedQuestIds, npc.relatedQuestIds)
          : npcs[idx].relatedQuestIds;
        const mergedRelationships = npc.relationships?.length > 0
          ? [...(npcs[idx].relationships || []).filter((r) => !npc.relationships.some((nr) => nr.npcName === r.npcName)), ...npc.relationships]
          : npcs[idx].relationships;
        npcs[idx] = {
          ...npcs[idx],
          ...(npc.gender && { gender: npc.gender }),
          ...(npc.role && { role: npc.role }),
          ...(npc.personality && { personality: npc.personality }),
          ...(npc.attitude && { attitude: npc.attitude }),
          ...(npc.location && { lastLocation: npc.location }),
          ...(npc.notes && { notes: npc.notes }),
          ...(npc.alive !== undefined && { alive: npc.alive }),
          ...(npc.factionId !== undefined && { factionId: npc.factionId }),
          ...(mergedRelQuestIds && { relatedQuestIds: mergedRelQuestIds }),
          ...(mergedRelationships && { relationships: mergedRelationships }),
          ...(typeof npc.dispositionChange === 'number' && {
            disposition: Math.max(-50, Math.min(50, (npcs[idx].disposition || 0) + npc.dispositionChange)),
          }),
        };
      }
    }
    updatedWorld.npcs = npcs;
  }

  if (Array.isArray(stateChanges.codexUpdates) && stateChanges.codexUpdates.length > 0) {
    const codex = { ...(updatedWorld.codex || {}) };
    for (const update of stateChanges.codexUpdates) {
      if (!update.id || !update.fragment?.content) continue;
      const existing = codex[update.id];
      if (existing) {
        const isDuplicate = existing.fragments.some((f) => f.content === update.fragment.content);
        if (!isDuplicate && existing.fragments.length < 10) {
          codex[update.id] = {
            ...existing,
            fragments: [...existing.fragments, { id: createId('frag'), ...update.fragment, sceneIndex, timestamp: now() }],
            tags: mergeUnique(existing.tags, update.tags),
            relatedEntries: mergeUnique(existing.relatedEntries, update.relatedEntries),
          };
        }
      } else if (Object.keys(codex).length < 100) {
        codex[update.id] = {
          id: update.id,
          name: update.name,
          category: update.category || 'concept',
          fragments: [{ id: createId('frag'), ...update.fragment, sceneIndex, timestamp: now() }],
          tags: update.tags || [],
          relatedEntries: update.relatedEntries || [],
          firstDiscovered: now(),
        };
      }
    }
    updatedWorld.codex = codex;
  }

  if (Array.isArray(stateChanges.activeEffects) && stateChanges.activeEffects.length > 0) {
    let effects = [...(updatedWorld.activeEffects || [])];
    for (const fx of stateChanges.activeEffects) {
      if (fx.action === 'add') {
        effects.push({
          id: fx.id || createId('fx'),
          type: fx.type || 'other',
          location: fx.location || '',
          description: fx.description || '',
          placedBy: fx.placedBy || '',
          active: true,
        });
      } else if (fx.action === 'remove') {
        effects = effects.filter((e) => e.id !== fx.id);
      } else if (fx.action === 'trigger') {
        effects = effects.map((e) => (e.id === fx.id ? { ...e, active: false } : e));
      }
    }
    updatedWorld.activeEffects = effects;
  }

  if (stateChanges.factionChanges && typeof stateChanges.factionChanges === 'object') {
    const factions = { ...(updatedWorld.factions || {}) };
    for (const [factionId, delta] of Object.entries(stateChanges.factionChanges)) {
      const current = factions[factionId] || 0;
      factions[factionId] = Math.max(-100, Math.min(100, current + delta));
    }
    updatedWorld.factions = factions;
  }

  if (stateChanges.knowledgeUpdates) {
    const kb = { ...(updatedWorld.knowledgeBase || { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] }) };
    const ku = stateChanges.knowledgeUpdates;
    if (ku.events?.length > 0) {
      kb.events = [...(kb.events || []), ...ku.events.map((e) => ({ ...e, sceneIndex }))].slice(-50);
    }
    if (ku.decisions?.length > 0) {
      kb.decisions = [...(kb.decisions || []), ...ku.decisions.map((d) => ({ ...d, sceneIndex }))].slice(-50);
    }
    if (ku.plotThreads?.length > 0) {
      const threads = [...(kb.plotThreads || [])];
      for (const pt of ku.plotThreads) {
        const idx = threads.findIndex((t) => t.id === pt.id);
        if (idx >= 0) {
          threads[idx] = {
            ...threads[idx],
            ...pt,
            relatedNpcIds: mergeUnique(threads[idx].relatedNpcIds, pt.relatedNpcIds),
            relatedQuestIds: mergeUnique(threads[idx].relatedQuestIds, pt.relatedQuestIds),
            relatedLocationIds: mergeUnique(threads[idx].relatedLocationIds, pt.relatedLocationIds),
            relatedScenes: mergeUnique(threads[idx].relatedScenes, sceneIndex),
          };
        } else {
          threads.push({ ...pt, relatedScenes: [sceneIndex] });
        }
      }
      kb.plotThreads = threads;
    }
    updatedWorld.knowledgeBase = kb;
  }

  {
    const kb = { ...(updatedWorld.knowledgeBase || { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] }) };
    let kbChanged = false;
    if (stateChanges.npcs?.length > 0) {
      const kbChars = { ...(kb.characters || {}) };
      for (const npc of (updatedWorld.npcs || [])) {
        const changedNpc = stateChanges.npcs.find((n) => n.name?.toLowerCase() === npc.name?.toLowerCase());
        if (!changedNpc) continue;
        const key = npc.name.toLowerCase();
        const existing = kbChars[key] || { interactionCount: 0, knownFacts: [] };
        kbChars[key] = {
          name: npc.name,
          lastSeen: npc.lastLocation || existing.lastSeen || '',
          lastSeenScene: sceneIndex,
          disposition: npc.disposition ?? existing.disposition ?? 0,
          factionId: npc.factionId || existing.factionId || null,
          role: npc.role || existing.role || '',
          alive: npc.alive ?? existing.alive ?? true,
          interactionCount: existing.interactionCount + 1,
          knownFacts: existing.knownFacts,
          relationships: npc.relationships || existing.relationships || [],
        };
      }
      kb.characters = kbChars;
      kbChanged = true;
    }
    const currentLoc = stateChanges.currentLocation || updatedWorld.currentLocation;
    if (currentLoc) {
      const kbLocs = { ...(kb.locations || {}) };
      const key = currentLoc.toLowerCase();
      const existing = kbLocs[key] || { visitCount: 0, knownFacts: [], npcsEncountered: [] };
      const npcsHere = (updatedWorld.npcs || [])
        .filter((n) => {
          if (n.alive === false) return false;
          const curRef = stateChanges.currentLocationRef || updatedWorld.currentLocationRef;
          if (curRef && n.locationRef) {
            return n.locationRef.kind === curRef.kind && n.locationRef.id === curRef.id;
          }
          return n.lastLocation?.toLowerCase() === currentLoc.toLowerCase();
        })
        .map((n) => n.name);
      kbLocs[key] = {
        name: currentLoc,
        visitCount: existing.visitCount + (stateChanges.currentLocation ? 1 : 0),
        lastVisited: sceneIndex,
        knownFacts: existing.knownFacts,
        npcsEncountered: mergeUnique(existing.npcsEncountered, npcsHere),
      };
      kb.locations = kbLocs;
      kbChanged = true;
    }
    if (kbChanged) updatedWorld.knowledgeBase = kb;
  }

  let updatedCampaign = null;
  if (stateChanges.campaignEnd && gameState.campaign) {
    updatedCampaign = {
      ...gameState.campaign,
      status: stateChanges.campaignEnd.status || 'completed',
      epilogue: stateChanges.campaignEnd.epilogue || '',
    };
  }

  let updatedQuests = { ...(gameState.quests || { active: [], completed: [] }) };
  if (Array.isArray(stateChanges.newQuests) && stateChanges.newQuests.length > 0) {
    const normalized = stateChanges.newQuests.map((q) => ({
      ...q,
      objectives: (q.objectives || []).map((obj) => ({ ...obj, completed: obj.completed ?? false })),
    }));
    updatedQuests.active = [...(updatedQuests.active || []), ...normalized];
  }
  if (Array.isArray(stateChanges.completedQuests) && stateChanges.completedQuests.length > 0) {
    const completedIds = new Set(stateChanges.completedQuests);
    const completed = (updatedQuests.active || []).filter((q) => completedIds.has(q.id));
    updatedQuests = {
      active: (updatedQuests.active || []).filter((q) => !completedIds.has(q.id)),
      completed: [...(updatedQuests.completed || []), ...completed.map((q) => ({ ...q, completedAt: now() }))],
    };
  }
  if (Array.isArray(stateChanges.questUpdates) && stateChanges.questUpdates.length > 0) {
    updatedQuests.active = (updatedQuests.active || []).map((quest) => {
      const updates = stateChanges.questUpdates.filter((u) => u.questId === quest.id);
      if (updates.length === 0 || !quest.objectives) return quest;
      const objectives = quest.objectives.map((obj) => {
        const upd = updates.find((u) => u.objectiveId === obj.id);
        return upd ? { ...obj, completed: !!upd.completed } : obj;
      });
      return { ...quest, objectives };
    });
  }

  // fieldMap / mapMode — no-op (fieldMap removed in Faza 5)

  // --- Narrative threading (parity with SP applyNarrativeState) ---
  if (Array.isArray(stateChanges.narrativeSeeds) && stateChanges.narrativeSeeds.length > 0) {
    if (!updatedWorld.narrativeSeeds) updatedWorld.narrativeSeeds = [];
    const existingIds = new Set(updatedWorld.narrativeSeeds.map((e) => e.id));
    for (const seed of stateChanges.narrativeSeeds) {
      if (existingIds.has(seed.id)) continue;
      updatedWorld.narrativeSeeds.push({ ...seed, planted: seed.planted ?? sceneIndex });
    }
    if (updatedWorld.narrativeSeeds.length > 30) {
      updatedWorld.narrativeSeeds = updatedWorld.narrativeSeeds.slice(-30);
    }
  }

  if (Array.isArray(stateChanges.resolvedSeeds) && stateChanges.resolvedSeeds.length > 0 && updatedWorld.narrativeSeeds) {
    updatedWorld.narrativeSeeds = updatedWorld.narrativeSeeds.map((seed) =>
      stateChanges.resolvedSeeds.includes(seed.id) ? { ...seed, resolved: true } : seed
    );
  }

  if (Array.isArray(stateChanges.npcAgendas) && stateChanges.npcAgendas.length > 0) {
    const agendas = [...(updatedWorld.npcAgendas || [])];
    for (const agenda of stateChanges.npcAgendas) {
      const idx = agendas.findIndex((a) => a.npcName?.toLowerCase() === agenda.npcName?.toLowerCase());
      if (idx >= 0) {
        agendas[idx] = { ...agendas[idx], ...agenda };
      } else {
        agendas.push({ ...agenda, plantedScene: agenda.plantedScene ?? sceneIndex });
      }
    }
    updatedWorld.npcAgendas = agendas.length > 20 ? agendas.slice(-20) : agendas;
  }

  if (Array.isArray(stateChanges.pendingCallbacks) && stateChanges.pendingCallbacks.length > 0) {
    const decisions = updatedWorld.knowledgeBase?.decisions;
    if (decisions?.length > 0) {
      const lastDecision = { ...decisions[decisions.length - 1] };
      lastDecision.pendingCallbacks = [...(lastDecision.pendingCallbacks || []), ...stateChanges.pendingCallbacks];
      updatedWorld.knowledgeBase = {
        ...updatedWorld.knowledgeBase,
        decisions: [...decisions.slice(0, -1), lastDecision],
      };
    }
  }

  // --- Rest-crisis penalty (parity with SP applyRestCrisisPenalty) ---
  updatedCharacters = updatedCharacters.map((c) => {
    if (!c.needs) return c;
    const hasRestCrisis = (c.needs.rest ?? 100) === 0;
    if (hasRestCrisis && !c.needsPenalty) return { ...c, needsPenalty: -10 };
    if (!hasRestCrisis && c.needsPenalty) return { ...c, needsPenalty: 0 };
    return c;
  });

  return {
    characters: updatedCharacters,
    world: updatedWorld,
    quests: updatedQuests,
    ...(updatedCampaign && { campaign: updatedCampaign }),
  };
}
