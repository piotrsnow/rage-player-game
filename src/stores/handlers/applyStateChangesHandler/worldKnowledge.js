import { shortId } from '../../../utils/ids';
import { mergeUnique } from '../../../../shared/domain/arrays';

/**
 * Two passes over the knowledge-base + codex + world-facts structures:
 *
 * 1. `applyWorldNotes` — flat `worldFacts` + `journalEntries` pushes. Safe
 *    to run before npcs/time.
 * 2. `applyKnowledgeBase` — `knowledgeUpdates` (events/decisions/plotThreads),
 *    `codexUpdates` (typed dossier entries), and auto-populate
 *    `kb.characters` / `kb.locations` from the CURRENT NPC + location state.
 *    MUST run AFTER npcs (reads `draft.world.npcs`) and AFTER time/needs
 *    (so sceneIdx stamped on new entries matches the already-advanced scene).
 */
export function applyWorldNotes(draft, changes) {
  if (changes.worldFacts) {
    draft.world.facts.push(...changes.worldFacts);
  }
  if (changes.journalEntries?.length > 0) {
    if (!draft.world.eventHistory) draft.world.eventHistory = [];
    draft.world.eventHistory.push(...changes.journalEntries);
  }
}

export function applyKnowledgeBase(draft, changes) {
  applyKnowledgeUpdates(draft, changes);
  applyCodexUpdates(draft, changes);
  autoPopulateKnowledgeBase(draft, changes);
}

function ensureKnowledgeBase(draft) {
  if (!draft.world.knowledgeBase) {
    draft.world.knowledgeBase = {
      characters: {},
      locations: {},
      events: [],
      decisions: [],
      plotThreads: [],
    };
  }
  return draft.world.knowledgeBase;
}

function applyKnowledgeUpdates(draft, changes) {
  if (!changes.knowledgeUpdates || !draft.world) return;
  const kb = ensureKnowledgeBase(draft);
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

function applyCodexUpdates(draft, changes) {
  if (!changes.codexUpdates?.length || !draft.world) return;
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

function autoPopulateKnowledgeBase(draft, changes) {
  const kb = ensureKnowledgeBase(draft);
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
