import { prisma } from '../lib/prisma.js';
import {
  createRoom, createRoomWithGameState, joinRoom, leaveRoom, updateCharacter,
  updateSettings, submitAction, withdrawAction, approveActions, executeSoloAction,
  setPhase, setGameState, broadcast, sendTo, sanitizeRoom, getRoom, touchRoom,
  saveRoomToDB, deleteRoomFromDB, loadActiveSessionsFromDB, findSessionInDB, restoreRoom,
} from '../services/roomManager.js';
import { generateMultiplayerScene, generateMultiplayerCampaign, generateMidGameCharacter, needsCompression, compressOldScenes } from '../services/multiplayerAI.js';
import { DECAY_PER_HOUR, hourToPeriod, decayNeeds } from '../services/timeUtils.js';
import { validateMultiplayerStateChanges } from '../services/stateValidator.js';

function applyTimeAdvance(world, timeAdvance) {
  const ts = world.timeState || { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' };
  const hoursElapsed = timeAdvance.hoursElapsed || 0.5;
  let newHour = (ts.hour ?? 6) + hoursElapsed;
  let dayIncrement = 0;
  while (newHour >= 24) { newHour -= 24; dayIncrement++; }
  if (timeAdvance.newDay && dayIncrement === 0) dayIncrement = 1;
  return {
    ...ts,
    hour: Math.round(newHour * 10) / 10,
    timeOfDay: hourToPeriod(newHour),
    day: ts.day + dayIncrement,
    ...(timeAdvance.season && { season: timeAdvance.season }),
  };
}

function applySceneStateChanges(gameState, sceneResult, settings) {
  const stateChanges = sceneResult.stateChanges || {};
  const needsEnabled = settings?.needsSystemEnabled === true;
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
            if (updated.fate > 0) {
              updated.fate = updated.fate - 1;
              updated.fortune = Math.min(updated.fortune, updated.fate);
              updated.criticalWoundCount = 2;
              updated.wounds = 1;
            } else {
              updated.status = 'dead';
              updated.wounds = 0;
            }
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
      if (delta.fortuneChange != null) updated.fortune = Math.max(0, Math.min(updated.fate ?? 2, (updated.fortune ?? 0) + delta.fortuneChange));
      if (delta.resolveChange != null) updated.resolve = Math.max(0, Math.min(updated.resilience ?? 1, (updated.resolve ?? 0) + delta.resolveChange));
      if (delta.fateChange != null) {
        updated.fate = Math.max(0, (updated.fate ?? 0) + delta.fateChange);
        updated.fortune = Math.min(updated.fortune ?? 0, updated.fate);
      }
      if (delta.resilienceChange != null) {
        updated.resilience = Math.max(0, (updated.resilience ?? 0) + delta.resilienceChange);
        updated.resolve = Math.min(updated.resolve ?? 0, updated.resilience);
      }
      if (Array.isArray(delta.newItems)) {
        updated.inventory = [...(updated.inventory || []), ...delta.newItems];
      }
      if (Array.isArray(delta.removeItems)) {
        const removeSet = new Set(delta.removeItems.map((i) => (typeof i === 'string' ? i : i.name)));
        updated.inventory = (updated.inventory || []).filter((i) => !removeSet.has(typeof i === 'string' ? i : i.name));
      }
      if (delta.moneyChange) {
        const cur = updated.money || { gold: 0, silver: 0, copper: 0 };
        let total = ((cur.gold || 0) + (delta.moneyChange.gold || 0)) * 100
          + ((cur.silver || 0) + (delta.moneyChange.silver || 0)) * 10
          + ((cur.copper || 0) + (delta.moneyChange.copper || 0));
        if (total < 0) total = 0;
        updated.money = {
          gold: Math.floor(total / 100),
          silver: Math.floor((total % 100) / 10),
          copper: total % 10,
        };
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
      if (Array.isArray(delta.criticalWounds)) {
        updated.criticalWounds = [...(updated.criticalWounds || []), ...delta.criticalWounds];
      }
      if (delta.healCriticalWound) {
        updated.criticalWounds = (updated.criticalWounds || []).filter((cw) => cw.name !== delta.healCriticalWound);
      }
      return updated;
    });
  }

  if (needsEnabled && timeAdvance) {
    updatedCharacters = updatedCharacters.map((c) => {
      if (!c.needs) return c;
      return { ...c, needs: decayNeeds(c.needs, hoursElapsed) };
    });
  }

  let updatedWorld = { ...(gameState.world || {}) };
  if (timeAdvance) {
    updatedWorld.timeState = applyTimeAdvance(updatedWorld, timeAdvance);
  }
  if (stateChanges.currentLocation) {
    const prevLoc = updatedWorld.currentLocation;
    const newLoc = stateChanges.currentLocation;
    let mapConns = [...(updatedWorld.mapConnections || [])];
    let mapSt = [...(updatedWorld.mapState || [])];

    if (prevLoc && newLoc && prevLoc.toLowerCase() !== newLoc.toLowerCase()) {
      const already = mapConns.some(
        (c) =>
          (c.from.toLowerCase() === prevLoc.toLowerCase() && c.to.toLowerCase() === newLoc.toLowerCase()) ||
          (c.from.toLowerCase() === newLoc.toLowerCase() && c.to.toLowerCase() === prevLoc.toLowerCase())
      );
      if (!already) {
        mapConns.push({ from: prevLoc, to: newLoc });
      }
      for (const locName of [prevLoc, newLoc]) {
        if (!mapSt.some((m) => m.name?.toLowerCase() === locName.toLowerCase())) {
          mapSt.push({
            id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: locName,
            description: '',
            modifications: [],
          });
        }
      }
    }
    updatedWorld.currentLocation = newLoc;
    updatedWorld.mapConnections = mapConns;
    updatedWorld.mapState = mapSt;
  }
  if (Array.isArray(stateChanges.mapChanges) && stateChanges.mapChanges.length > 0) {
    const mapState = [...(updatedWorld.mapState || [])];
    for (const change of stateChanges.mapChanges) {
      const idx = mapState.findIndex((m) => m.name?.toLowerCase() === change.location?.toLowerCase());
      if (idx >= 0) {
        mapState[idx] = {
          ...mapState[idx],
          modifications: [...(mapState[idx].modifications || []), { description: change.modification, type: change.type || 'other', timestamp: Date.now() }],
        };
      } else {
        mapState.push({
          id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: change.location,
          description: '',
          modifications: [{ description: change.modification, type: change.type || 'other', timestamp: Date.now() }],
        });
      }
    }
    updatedWorld.mapState = mapState;
  }
  if (Array.isArray(stateChanges.worldFacts) && stateChanges.worldFacts.length > 0) {
    updatedWorld.facts = [...(updatedWorld.facts || []), ...stateChanges.worldFacts];
  }
  if (Array.isArray(stateChanges.journalEntries) && stateChanges.journalEntries.length > 0) {
    updatedWorld.eventHistory = [...(updatedWorld.eventHistory || []), ...stateChanges.journalEntries];
  }
  if (Array.isArray(stateChanges.npcs) && stateChanges.npcs.length > 0) {
    const npcs = [...(updatedWorld.npcs || [])];
    for (const npc of stateChanges.npcs) {
      const idx = npcs.findIndex((n) => n.name?.toLowerCase() === npc.name?.toLowerCase());
      if (npc.action === 'introduce' && idx < 0) {
        npcs.push({
          id: `npc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
      } else if (npc.action === 'introduce' && idx >= 0) {
        npcs[idx] = {
          ...npcs[idx],
          ...(npc.gender && { gender: npc.gender }),
          ...(npc.role && { role: npc.role }),
          ...(npc.personality && { personality: npc.personality }),
          ...(npc.attitude && { attitude: npc.attitude }),
          ...(npc.location && { lastLocation: npc.location }),
          ...(npc.notes && { notes: npc.notes }),
          ...(npc.factionId !== undefined && { factionId: npc.factionId }),
          ...(npc.relatedQuestIds?.length > 0 && { relatedQuestIds: npc.relatedQuestIds }),
          ...(npc.relationships?.length > 0 && { relationships: npc.relationships }),
        };
      } else if (idx >= 0) {
        const mergedRelQuestIds = npc.relatedQuestIds?.length > 0
          ? [...new Set([...(npcs[idx].relatedQuestIds || []), ...npc.relatedQuestIds])]
          : npcs[idx].relatedQuestIds;
        const mergedRelationships = npc.relationships?.length > 0
          ? [...(npcs[idx].relationships || []).filter(
              (r) => !npc.relationships.some((nr) => nr.npcName === r.npcName)
            ), ...npc.relationships]
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
            fragments: [...existing.fragments, { id: `frag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...update.fragment, sceneIndex: (gameState.scenes || []).length, timestamp: Date.now() }],
            tags: [...new Set([...(existing.tags || []), ...(update.tags || [])])],
            relatedEntries: [...new Set([...(existing.relatedEntries || []), ...(update.relatedEntries || [])])],
          };
        }
      } else if (Object.keys(codex).length < 100) {
        codex[update.id] = {
          id: update.id, name: update.name, category: update.category || 'concept',
          fragments: [{ id: `frag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...update.fragment, sceneIndex: (gameState.scenes || []).length, timestamp: Date.now() }],
          tags: update.tags || [], relatedEntries: update.relatedEntries || [], firstDiscovered: Date.now(),
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
          id: fx.id || `fx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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

  if (stateChanges.weatherUpdate) {
    updatedWorld.weather = stateChanges.weatherUpdate;
  }

  if (stateChanges.currentLocation) {
    const explored = new Set(updatedWorld.exploredLocations || []);
    explored.add(stateChanges.currentLocation);
    updatedWorld.exploredLocations = [...explored];
  }

  if (stateChanges.knowledgeUpdates) {
    const kb = { ...(updatedWorld.knowledgeBase || { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] }) };
    const ku = stateChanges.knowledgeUpdates;
    if (ku.events?.length > 0) {
      kb.events = [...(kb.events || []), ...ku.events.map((e) => ({
        ...e, sceneIndex: (gameState.scenes || []).length,
      }))].slice(-50);
    }
    if (ku.decisions?.length > 0) {
      kb.decisions = [...(kb.decisions || []), ...ku.decisions.map((d) => ({
        ...d, sceneIndex: (gameState.scenes || []).length,
      }))].slice(-50);
    }
    if (ku.plotThreads?.length > 0) {
      const threads = [...(kb.plotThreads || [])];
      for (const pt of ku.plotThreads) {
        const idx = threads.findIndex((t) => t.id === pt.id);
        if (idx >= 0) {
          threads[idx] = {
            ...threads[idx], ...pt,
            relatedNpcIds: [...new Set([...(threads[idx].relatedNpcIds || []), ...(pt.relatedNpcIds || [])])],
            relatedQuestIds: [...new Set([...(threads[idx].relatedQuestIds || []), ...(pt.relatedQuestIds || [])])],
            relatedLocationIds: [...new Set([...(threads[idx].relatedLocationIds || []), ...(pt.relatedLocationIds || [])])],
            relatedScenes: [...new Set([...(threads[idx].relatedScenes || []), (gameState.scenes || []).length])],
          };
        } else {
          threads.push({ ...pt, relatedScenes: [(gameState.scenes || []).length] });
        }
      }
      kb.plotThreads = threads;
    }
    updatedWorld.knowledgeBase = kb;
  }

  // Auto-populate knowledgeBase from NPC/location changes
  {
    const kb = { ...(updatedWorld.knowledgeBase || { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] }) };
    let kbChanged = false;
    const sceneIdx = (gameState.scenes || []).length;
    if (stateChanges.npcs?.length > 0) {
      const kbChars = { ...(kb.characters || {}) };
      for (const npc of (updatedWorld.npcs || [])) {
        const changedNpc = stateChanges.npcs.find((n) => n.name?.toLowerCase() === npc.name?.toLowerCase());
        if (!changedNpc) continue;
        const key = npc.name.toLowerCase();
        const existing = kbChars[key] || { interactionCount: 0, knownFacts: [] };
        kbChars[key] = {
          name: npc.name, lastSeen: npc.lastLocation || existing.lastSeen || '',
          lastSeenScene: sceneIdx, disposition: npc.disposition ?? existing.disposition ?? 0,
          factionId: npc.factionId || existing.factionId || null,
          role: npc.role || existing.role || '', alive: npc.alive ?? existing.alive ?? true,
          interactionCount: existing.interactionCount + 1, knownFacts: existing.knownFacts,
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
        .filter((n) => n.alive !== false && n.lastLocation?.toLowerCase() === currentLoc.toLowerCase())
        .map((n) => n.name);
      kbLocs[key] = {
        name: currentLoc, visitCount: existing.visitCount + (stateChanges.currentLocation ? 1 : 0),
        lastVisited: sceneIdx, knownFacts: existing.knownFacts,
        npcsEncountered: [...new Set([...(existing.npcsEncountered || []), ...npcsHere])],
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
      completed: [...(updatedQuests.completed || []), ...completed.map((q) => ({ ...q, completedAt: Date.now() }))],
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

  return {
    characters: updatedCharacters,
    world: updatedWorld,
    quests: updatedQuests,
    ...(updatedCampaign && { campaign: updatedCampaign }),
  };
}

export async function multiplayerRoutes(fastify) {
  fastify.get('/', { websocket: true }, async (socket, request) => {
    let odId = null;
    let roomCode = null;

    try {
      const token = request.query?.token;
      if (!token) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Missing auth token' }));
        socket.close();
        return;
      }
      let user;
      try {
        user = fastify.jwt.verify(token);
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid auth token' }));
        socket.close();
        return;
      }

      const userId = user.id;

      let messageQueueTail = Promise.resolve();

      socket.on('message', (raw) => {
        messageQueueTail = messageQueueTail.then(async () => {
          let msg;
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
            return;
          }

          try {
            await handleMessage(fastify, socket, userId, msg);
          } catch (err) {
            fastify.log.error(err, 'WebSocket message handler error');
            const safeMessages = ['Room not found', 'Cannot join this room', 'Room is full',
              'Not in a room', 'Only the host can start the game', 'No actions to approve',
              'Only the host can kick players', 'Only the host can update settings',
              'Invalid kick target', 'Player not found', 'Game not in progress',
              'Game state is required', 'Room no longer exists',
              'Cannot rejoin: player not found or unauthorized',
              'Solo action on cooldown'];
            const message = safeMessages.includes(err.message) ? err.message : 'An error occurred';
            socket.send(JSON.stringify({ type: 'ERROR', message }));
          }
        }).catch(() => {});
      });

      socket.on('close', () => {
        if (roomCode && odId) {
          const currentRoom = getRoom(roomCode);
          const leavingPlayer = currentRoom?.players.get(odId);
          const playerName = leavingPlayer?.name || 'A player';
          const wasPlaying = currentRoom?.phase === 'playing' && currentRoom?.gameState;

          const room = leaveRoom(roomCode, odId);
          if (room) {
            if (wasPlaying && room.gameState) {
              room.gameState.characters = (room.gameState.characters || []).filter((c) => c.odId !== odId);
              const journalEntry = `${playerName} left the party.`;
              if (!room.gameState.world) room.gameState.world = {};
              room.gameState.world.eventHistory = [...(room.gameState.world?.eventHistory || []), journalEntry];
              setGameState(roomCode, room.gameState);
            }
            broadcast(room, {
              type: 'PLAYER_LEFT',
              playerId: odId,
              room: sanitizeRoom(room),
            });
          }
        }
      });

      async function handleMessage(fastify, ws, uid, msg) {
        if (roomCode) touchRoom(roomCode);
        switch (msg.type) {
          case 'CREATE_ROOM': {
            const result = createRoom(uid, ws);
            odId = result.odId;
            roomCode = result.room.roomCode;
            sendTo(result.room, odId, {
              type: 'ROOM_CREATED',
              roomCode,
              odId,
              room: sanitizeRoom(result.room),
            });
            break;
          }

          case 'CONVERT_TO_MULTIPLAYER': {
            const gameState = msg.gameState;
            const settings = msg.settings;
            if (!gameState) throw new Error('Game state is required');

            const result = createRoomWithGameState(uid, ws, gameState, settings);
            odId = result.odId;
            roomCode = result.room.roomCode;

            sendTo(result.room, odId, {
              type: 'ROOM_CONVERTED',
              roomCode,
              odId,
              room: sanitizeRoom(result.room),
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save on convert failed'));
            break;
          }

          case 'JOIN_ROOM': {
            const result = joinRoom(msg.roomCode, uid, ws);
            odId = result.odId;
            roomCode = result.room.roomCode;

            if (result.room.phase === 'playing' && result.room.gameState) {
              const hostPlayer = result.room.players.get(result.room.hostId);
              const dbUser = await prisma.user.findUnique({
                where: { id: hostPlayer.userId },
                select: { apiKeys: true },
              });

              const player = result.room.players.get(odId);
              const charResult = await generateMidGameCharacter(
                result.room.gameState,
                result.room.settings,
                player.name,
                player.gender,
                dbUser?.apiKeys || '{}',
                msg.language || 'en',
                player.characterData || null,
              );

              const newChar = { ...charResult.character, odId };
              result.room.gameState.characters = [...(result.room.gameState.characters || []), newChar];

              const careerName = newChar.career?.name || newChar.class || 'Adventurer';
              const journalEntry = `${newChar.name} (${careerName}) joined the party.`;
              if (!result.room.gameState.world) result.room.gameState.world = {};
              result.room.gameState.world.eventHistory = [...(result.room.gameState.world?.eventHistory || []), journalEntry];

              const arrivalMsg = {
                id: `msg_arrival_${Date.now()}`,
                role: 'dm',
                content: charResult.arrivalNarrative,
                dialogueSegments: [{ type: 'narration', text: charResult.arrivalNarrative }],
                timestamp: Date.now(),
              };
              result.room.gameState.chatHistory = [...(result.room.gameState.chatHistory || []), arrivalMsg];
              setGameState(roomCode, result.room.gameState);

              sendTo(result.room, odId, {
                type: 'ROOM_JOINED',
                roomCode,
                odId,
                room: sanitizeRoom(result.room),
              });

              broadcast(result.room, {
                type: 'PLAYER_JOINED_MIDGAME',
                player: {
                  odId,
                  userId: uid,
                  name: player.name,
                  gender: player.gender,
                  photo: null,
                  isHost: false,
                  pendingAction: null,
                },
                newCharacter: newChar,
                arrivalMessage: arrivalMsg,
                room: sanitizeRoom(result.room),
              }, odId);
            } else {
              sendTo(result.room, odId, {
                type: 'ROOM_JOINED',
                roomCode,
                odId,
                room: sanitizeRoom(result.room),
              });

              broadcast(result.room, {
                type: 'PLAYER_JOINED',
                player: {
                  odId,
                  userId: uid,
                  name: 'Adventurer',
                  gender: 'male',
                  photo: null,
                  isHost: false,
                  pendingAction: null,
                },
                room: sanitizeRoom(result.room),
              }, odId);
            }
            break;
          }

          case 'LEAVE_ROOM': {
            if (!roomCode || !odId) break;
            const currentRoom = getRoom(roomCode);
            const leavingPlayer = currentRoom?.players.get(odId);
            const playerName = leavingPlayer?.name || 'A player';
            const wasPlaying = currentRoom?.phase === 'playing' && currentRoom?.gameState;

            const room = leaveRoom(roomCode, odId);
            if (room) {
              if (wasPlaying && room.gameState) {
                room.gameState.characters = (room.gameState.characters || []).filter((c) => c.odId !== odId);
                const journalEntry = `${playerName} left the party.`;
                if (!room.gameState.world) room.gameState.world = {};
                room.gameState.world.eventHistory = [...(room.gameState.world?.eventHistory || []), journalEntry];
                setGameState(roomCode, room.gameState);
              }
              broadcast(room, {
                type: 'PLAYER_LEFT',
                playerId: odId,
                room: sanitizeRoom(room),
              });
            }
            roomCode = null;
            odId = null;
            ws.send(JSON.stringify({ type: 'LEFT_ROOM' }));
            break;
          }

          case 'UPDATE_CHARACTER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = updateCharacter(roomCode, odId, {
              name: msg.name,
              gender: msg.gender,
              photo: msg.photo,
              voiceId: msg.voiceId,
              voiceName: msg.voiceName,
              characterData: msg.characterData,
            });
            broadcast(room, {
              type: 'ROOM_STATE',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'UPDATE_SETTINGS': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = updateSettings(roomCode, odId, msg.settings);
            broadcast(room, {
              type: 'ROOM_STATE',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'START_GAME': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const currentRoom = getRoom(roomCode);
            if (!currentRoom) throw new Error('Room not found');
            if (currentRoom.hostId !== odId) throw new Error('Only the host can start the game');

            broadcast(currentRoom, { type: 'GAME_STARTING' });

            const hostPlayer = currentRoom.players.get(currentRoom.hostId);
            const dbUser = await prisma.user.findUnique({
              where: { id: hostPlayer.userId },
              select: { apiKeys: true },
            });

            const players = [];
            for (const [, p] of currentRoom.players) {
              players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost, characterData: p.characterData || null });
            }

            const campaignResult = await generateMultiplayerCampaign(
              currentRoom.settings,
              players,
              dbUser?.apiKeys || '{}',
              msg.language || 'en',
            );

            setPhase(roomCode, 'playing');
            setGameState(roomCode, campaignResult);

            const updatedRoom = getRoom(roomCode);
            broadcast(updatedRoom, {
              type: 'GAME_STARTED',
              gameState: campaignResult,
              room: sanitizeRoom(updatedRoom),
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));
            break;
          }

          case 'SUBMIT_ACTION': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = submitAction(roomCode, odId, msg.text, msg.isCustom);
            broadcast(room, {
              type: 'ACTIONS_UPDATED',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'WITHDRAW_ACTION': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = withdrawAction(roomCode, odId);
            broadcast(room, {
              type: 'ACTIONS_UPDATED',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'UPDATE_SCENE_IMAGE': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            const { sceneId, image } = msg;
            if (!sceneId || !image) break;

            if (room.gameState?.scenes) {
              const idx = room.gameState.scenes.findIndex((s) => s.id === sceneId);
              if (idx >= 0) {
                room.gameState.scenes[idx] = { ...room.gameState.scenes[idx], image };
                setGameState(roomCode, room.gameState);
              }
            }

            broadcast(room, {
              type: 'SCENE_IMAGE_UPDATE',
              sceneId,
              image,
            }, odId);
            break;
          }

          case 'APPROVE_ACTIONS': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const { room, actions } = approveActions(roomCode, odId);
            if (actions.length === 0) throw new Error('No actions to approve');

            broadcast(room, { type: 'SCENE_GENERATING' });

            const hostPlayer = room.players.get(room.hostId);
            const dbUser = await prisma.user.findUnique({
              where: { id: hostPlayer.userId },
              select: { apiKeys: true },
            });

            const players = [];
            for (const [, p] of room.players) {
              players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
            }

            const characterMomentum = room.gameState.characterMomentum || {};

            const sceneResult = await generateMultiplayerScene(
              room.gameState,
              room.settings,
              players,
              actions,
              dbUser?.apiKeys || '{}',
              msg.language || 'en',
              msg.dmSettings || null,
              characterMomentum,
            );

            const { validated: validatedChanges } = validateMultiplayerStateChanges(
              sceneResult.stateChanges, room.gameState
            );
            sceneResult.stateChanges = validatedChanges;

            const newMomentum = {};
            if (sceneResult.scene.diceRolls?.length) {
              for (const dr of sceneResult.scene.diceRolls) {
                if (dr.character && dr.sl != null) {
                  newMomentum[dr.character] = dr.sl * 5;
                }
              }
            }

            const applied = applySceneStateChanges(room.gameState, sceneResult, room.settings);
            const updatedGameState = {
              ...room.gameState,
              characters: applied.characters,
              world: applied.world,
              quests: applied.quests,
              ...(applied.campaign && { campaign: applied.campaign }),
              scenes: [...(room.gameState.scenes || []), sceneResult.scene],
              chatHistory: [...(room.gameState.chatHistory || []), ...sceneResult.chatMessages],
              characterMomentum: newMomentum,
            };
            setGameState(roomCode, updatedGameState);

            const updatedRoom = getRoom(roomCode);
            broadcast(updatedRoom, {
              type: 'SCENE_UPDATE',
              scene: sceneResult.scene,
              chatMessages: sceneResult.chatMessages,
              stateChanges: sceneResult.stateChanges,
              room: sanitizeRoom(updatedRoom),
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));

            if (needsCompression(updatedGameState)) {
              compressOldScenes(updatedGameState, dbUser?.apiKeys || '{}', msg.language || 'en')
                .then((summary) => {
                  if (summary) {
                    const currentRoom = getRoom(roomCode);
                    if (currentRoom?.gameState) {
                      currentRoom.gameState.world = {
                        ...(currentRoom.gameState.world || {}),
                        compressedHistory: summary,
                      };
                      setGameState(roomCode, currentRoom.gameState);
                      saveRoomToDB(roomCode).catch(() => {});
                    }
                  }
                })
                .catch((err) => fastify.log.warn(err, 'MP scene compression failed'));
            }
            break;
          }

          case 'SOLO_ACTION': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const { room, action } = executeSoloAction(roomCode, odId, msg.text, msg.isCustom);

            broadcast(room, { type: 'SCENE_GENERATING' });
            broadcast(room, {
              type: 'ACTIONS_UPDATED',
              room: sanitizeRoom(room),
            });

            const hostPlayer = room.players.get(room.hostId);
            const dbUser = await prisma.user.findUnique({
              where: { id: hostPlayer.userId },
              select: { apiKeys: true },
            });

            const players = [];
            for (const [, p] of room.players) {
              players.push({ odId: p.odId, name: p.name, gender: p.gender, isHost: p.isHost });
            }

            const soloMomentum = room.gameState.characterMomentum || {};

            const sceneResult = await generateMultiplayerScene(
              room.gameState,
              room.settings,
              players,
              [action],
              dbUser?.apiKeys || '{}',
              msg.language || 'en',
              msg.dmSettings || null,
              soloMomentum,
            );

            const { validated: validatedSoloChanges } = validateMultiplayerStateChanges(
              sceneResult.stateChanges, room.gameState
            );
            sceneResult.stateChanges = validatedSoloChanges;

            const newSoloMomentum = { ...soloMomentum };
            if (sceneResult.scene.diceRolls?.length) {
              for (const dr of sceneResult.scene.diceRolls) {
                if (dr.character && dr.sl != null) {
                  newSoloMomentum[dr.character] = dr.sl * 5;
                }
              }
            } else if (sceneResult.scene.diceRoll?.sl != null) {
              newSoloMomentum[action.name] = sceneResult.scene.diceRoll.sl * 5;
            }

            const applied = applySceneStateChanges(room.gameState, sceneResult, room.settings);
            const updatedGameState = {
              ...room.gameState,
              characters: applied.characters,
              world: applied.world,
              quests: applied.quests,
              ...(applied.campaign && { campaign: applied.campaign }),
              scenes: [...(room.gameState.scenes || []), sceneResult.scene],
              chatHistory: [...(room.gameState.chatHistory || []), ...sceneResult.chatMessages],
              characterMomentum: newSoloMomentum,
            };
            setGameState(roomCode, updatedGameState);

            const updatedRoom = getRoom(roomCode);
            broadcast(updatedRoom, {
              type: 'SCENE_UPDATE',
              scene: sceneResult.scene,
              chatMessages: sceneResult.chatMessages,
              stateChanges: sceneResult.stateChanges,
              room: sanitizeRoom(updatedRoom),
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));

            if (needsCompression(updatedGameState)) {
              compressOldScenes(updatedGameState, dbUser?.apiKeys || '{}', msg.language || 'en')
                .then((summary) => {
                  if (summary) {
                    const currentRoom = getRoom(roomCode);
                    if (currentRoom?.gameState) {
                      currentRoom.gameState.world = {
                        ...(currentRoom.gameState.world || {}),
                        compressedHistory: summary,
                      };
                      setGameState(roomCode, currentRoom.gameState);
                      saveRoomToDB(roomCode).catch(() => {});
                    }
                  }
                })
                .catch((err) => fastify.log.warn(err, 'MP scene compression failed'));
            }
            break;
          }

          case 'ACCEPT_QUEST_OFFER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            const { sceneId: aqSceneId, questOffer } = msg;
            if (!aqSceneId || !questOffer?.id) break;

            const quest = {
              id: questOffer.id,
              name: questOffer.name,
              description: questOffer.description,
              completionCondition: questOffer.completionCondition,
              objectives: (questOffer.objectives || []).map((obj) => ({ ...obj, completed: false })),
            };
            if (!room.gameState.quests) room.gameState.quests = { active: [], completed: [] };
            room.gameState.quests.active.push(quest);

            if (room.gameState?.scenes) {
              const sIdx = room.gameState.scenes.findIndex((s) => s.id === aqSceneId);
              if (sIdx >= 0 && room.gameState.scenes[sIdx].questOffers) {
                room.gameState.scenes[sIdx].questOffers = room.gameState.scenes[sIdx].questOffers.map((o) =>
                  o.id === questOffer.id ? { ...o, status: 'accepted' } : o
                );
              }
            }

            const acceptMsg = {
              id: `msg_${Date.now()}_quest_accept`,
              role: 'system',
              subtype: 'quest_new',
              content: `New quest: ${quest.name}`,
              timestamp: Date.now(),
            };
            room.gameState.chatHistory = [...(room.gameState.chatHistory || []), acceptMsg];
            setGameState(roomCode, room.gameState);

            broadcast(room, {
              type: 'QUEST_OFFER_UPDATE',
              sceneId: aqSceneId,
              offerId: questOffer.id,
              status: 'accepted',
              quest,
              chatMessage: acceptMsg,
              room: sanitizeRoom(room),
            });
            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save failed'));
            break;
          }

          case 'DECLINE_QUEST_OFFER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            const { sceneId: dqSceneId, offerId: dqOfferId } = msg;
            if (!dqSceneId || !dqOfferId) break;

            if (room.gameState?.scenes) {
              const sIdx = room.gameState.scenes.findIndex((s) => s.id === dqSceneId);
              if (sIdx >= 0 && room.gameState.scenes[sIdx].questOffers) {
                room.gameState.scenes[sIdx].questOffers = room.gameState.scenes[sIdx].questOffers.map((o) =>
                  o.id === dqOfferId ? { ...o, status: 'declined' } : o
                );
              }
            }
            setGameState(roomCode, room.gameState);

            broadcast(room, {
              type: 'QUEST_OFFER_UPDATE',
              sceneId: dqSceneId,
              offerId: dqOfferId,
              status: 'declined',
              room: sanitizeRoom(room),
            });
            break;
          }

          case 'SYNC_CHARACTER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            if (!room.gameState?.characters) break;

            const charData = msg.character;
            if (!charData) break;

            const charIdx = room.gameState.characters.findIndex((c) => c.odId === odId);
            if (charIdx < 0) break;

            const prev = room.gameState.characters[charIdx];
            room.gameState.characters[charIdx] = {
              ...prev,
              ...charData,
              odId: prev.odId,
              playerName: prev.playerName,
            };
            setGameState(roomCode, room.gameState);

            broadcast(room, {
              type: 'CHARACTER_SYNCED',
              odId,
              room: sanitizeRoom(room),
            });

            saveRoomToDB(roomCode).catch((err) => fastify.log.warn(err, 'MP room save after char sync failed'));
            break;
          }

          case 'PING': {
            ws.send(JSON.stringify({ type: 'PONG' }));
            break;
          }

          case 'REJOIN_ROOM': {
            let targetRoom = getRoom(msg.roomCode);

            if (!targetRoom) {
              const dbSession = await findSessionInDB(msg.roomCode);
              if (dbSession && dbSession.gameState) {
                const players = dbSession.players || [];
                const playerMap = new Map();
                for (const p of players) {
                  playerMap.set(p.odId, { ...p, ws: null, pendingAction: null, lastSoloActionAt: null });
                }
                const hostOdId = players.find((p) => p.isHost)?.odId || players[0]?.odId;
                targetRoom = restoreRoom(msg.roomCode, {
                  roomCode: dbSession.roomCode,
                  hostId: hostOdId,
                  phase: dbSession.phase,
                  settings: dbSession.settings,
                  players: playerMap,
                  gameState: dbSession.gameState,
                  lastActivity: Date.now(),
                });
              }
            }

            if (!targetRoom) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Room no longer exists' }));
              break;
            }
            const existingPlayer = targetRoom.players.get(msg.odId);
            if (!existingPlayer || existingPlayer.userId !== uid) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Cannot rejoin: player not found or unauthorized' }));
              break;
            }
            existingPlayer.ws = ws;
            odId = msg.odId;
            roomCode = msg.roomCode;
            sendTo(targetRoom, odId, {
              type: 'ROOM_JOINED',
              roomCode,
              odId,
              room: sanitizeRoom(targetRoom),
            });
            break;
          }

          case 'KICK_PLAYER': {
            if (!roomCode || !odId) throw new Error('Not in a room');
            const room = getRoom(roomCode);
            if (!room) throw new Error('Room not found');
            if (room.hostId !== odId) throw new Error('Only the host can kick players');
            const targetOdId = msg.targetOdId;
            if (!targetOdId || targetOdId === odId) throw new Error('Invalid kick target');
            const target = room.players.get(targetOdId);
            if (!target) throw new Error('Player not found');

            const kickedName = target.name;
            if (target.ws?.readyState === 1) {
              target.ws.send(JSON.stringify({ type: 'KICKED', message: 'You have been removed from the room' }));
              target.ws.close();
            }

            const updatedRoom = leaveRoom(roomCode, targetOdId);
            if (updatedRoom) {
              if (updatedRoom.gameState) {
                updatedRoom.gameState.characters = (updatedRoom.gameState.characters || []).filter((c) => c.odId !== targetOdId);
                const journalEntry = `${kickedName} was removed from the party.`;
                if (!updatedRoom.gameState.world) updatedRoom.gameState.world = {};
                updatedRoom.gameState.world.eventHistory = [...(updatedRoom.gameState.world?.eventHistory || []), journalEntry];
                setGameState(roomCode, updatedRoom.gameState);
              }
              broadcast(updatedRoom, {
                type: 'PLAYER_LEFT',
                playerId: targetOdId,
                room: sanitizeRoom(updatedRoom),
              });
            }
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Unknown message type' }));
        }
      }
    } catch (err) {
      fastify.log.error(err, 'WebSocket connection error');
      socket.send(JSON.stringify({ type: 'ERROR', message: 'Internal server error' }));
      socket.close();
    }
  });
}
