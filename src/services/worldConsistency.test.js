import { describe, it, expect } from 'vitest';
import { checkWorldConsistency, applyConsistencyPatches, buildConsistencyWarningsForPrompt } from './worldConsistency.js';

const baseWorld = {
  npcs: [
    { id: 'npc_1', name: 'Grumli', alive: true, disposition: 0, lastLocation: 'Altdorf', factionId: 'merchants_guild', relatedQuestIds: [], relationships: [] },
    { id: 'npc_2', name: 'Hilda', alive: true, disposition: 10, lastLocation: 'Altdorf', factionId: 'thieves_guild', relatedQuestIds: [], relationships: [] },
    { id: 'npc_3', name: 'Olaf', alive: false, disposition: -5, lastLocation: 'Nuln', factionId: null, relatedQuestIds: [], relationships: [] },
  ],
  mapState: [
    { id: 'loc_1', name: 'Altdorf', description: 'The capital' },
    { id: 'loc_2', name: 'Nuln', description: 'Industrial city' },
  ],
  factions: { merchants_guild: 20, thieves_guild: -30 },
  knowledgeBase: { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] },
};

const baseQuests = {
  active: [
    { id: 'q1', name: 'Missing Shipment', questGiverId: 'npc_1', locationId: 'Altdorf', prerequisiteQuestIds: [], objectives: [] },
    { id: 'q2', name: 'Secret Task', questGiverId: 'npc_3', locationId: 'Nuln', prerequisiteQuestIds: ['q_done'], objectives: [] },
  ],
  completed: [{ id: 'q0', name: 'Intro Quest' }],
};

describe('checkWorldConsistency', () => {
  it('detects NPC-faction disposition shift when faction rep changes significantly', () => {
    const gameState = { world: baseWorld, quests: baseQuests };
    const previousFactions = { merchants_guild: 0, thieves_guild: -30 };
    const { corrections, statePatches } = checkWorldConsistency(gameState, previousFactions);
    expect(corrections.some((c) => c.includes('Grumli') && c.includes('merchants_guild'))).toBe(true);
    expect(statePatches.npcDispositionUpdates).toBeDefined();
    expect(statePatches.npcDispositionUpdates.length).toBeGreaterThan(0);
    const grumliPatch = statePatches.npcDispositionUpdates.find((p) => p.index === 0);
    expect(grumliPatch).toBeDefined();
    expect(grumliPatch.disposition).toBeGreaterThan(0);
  });

  it('does not shift disposition for small faction changes', () => {
    const gameState = { world: baseWorld, quests: baseQuests };
    const previousFactions = { merchants_guild: 15, thieves_guild: -30 };
    const { corrections } = checkWorldConsistency(gameState, previousFactions);
    expect(corrections.some((c) => c.includes('Grumli'))).toBe(false);
  });

  it('does not shift disposition for dead NPCs', () => {
    const gameState = { world: baseWorld, quests: baseQuests };
    const previousFactions = { merchants_guild: 20, thieves_guild: 0 };
    const { corrections } = checkWorldConsistency(gameState, previousFactions);
    expect(corrections.some((c) => c.includes('Olaf'))).toBe(false);
  });

  it('warns about NPC in unknown location', () => {
    const world = {
      ...baseWorld,
      npcs: [
        ...baseWorld.npcs,
        { id: 'npc_4', name: 'Stranger', alive: true, lastLocation: 'Mordheim', factionId: null },
      ],
    };
    const { warnings } = checkWorldConsistency({ world, quests: baseQuests });
    expect(warnings.some((w) => w.includes('Stranger') && w.includes('Mordheim'))).toBe(true);
  });

  it('does not warn about NPC location when no map locations exist', () => {
    const world = { ...baseWorld, mapState: [] };
    const { warnings } = checkWorldConsistency({ world, quests: baseQuests });
    expect(warnings.some((w) => w.includes('not in the known map'))).toBe(false);
  });

  it('warns about unmet quest prerequisites', () => {
    const { warnings, statePatches } = checkWorldConsistency({ world: baseWorld, quests: baseQuests });
    expect(warnings.some((w) => w.includes('Secret Task') && w.includes('prerequisites'))).toBe(true);
    expect(statePatches.blockedQuests).toBeDefined();
    expect(statePatches.blockedQuests[0].questId).toBe('q2');
  });

  it('does not warn about quests with met prerequisites', () => {
    const quests = {
      active: [{ id: 'q1', name: 'Test Quest', prerequisiteQuestIds: ['q0'], objectives: [] }],
      completed: [{ id: 'q0', name: 'Prereq Quest' }],
    };
    const { warnings } = checkWorldConsistency({ world: baseWorld, quests });
    expect(warnings.some((w) => w.includes('Test Quest') && w.includes('prerequisites'))).toBe(false);
  });

  it('warns about dead NPC quest givers', () => {
    const { warnings, statePatches } = checkWorldConsistency({ world: baseWorld, quests: baseQuests });
    expect(warnings.some((w) => w.includes('Olaf') && w.includes('dead'))).toBe(true);
    expect(statePatches.deadQuestGiverFacts?.length).toBeGreaterThan(0);
  });

  it('warns about orphan faction IDs', () => {
    const world = { ...baseWorld, factions: { ...baseWorld.factions, unknown_faction: 10 } };
    const { warnings } = checkWorldConsistency({ world, quests: baseQuests });
    expect(warnings.some((w) => w.includes('unknown_faction'))).toBe(true);
  });

  it('warns about NPC with unknown factionId', () => {
    const world = {
      ...baseWorld,
      npcs: [
        ...baseWorld.npcs,
        { id: 'npc_5', name: 'Rogue', alive: true, lastLocation: 'Altdorf', factionId: 'fake_faction' },
      ],
    };
    const { warnings } = checkWorldConsistency({ world, quests: baseQuests });
    expect(warnings.some((w) => w.includes('Rogue') && w.includes('fake_faction'))).toBe(true);
  });
});

describe('applyConsistencyPatches', () => {
  it('applies NPC disposition updates', () => {
    const gameState = { world: baseWorld };
    const statePatches = {
      npcDispositionUpdates: [{ index: 0, disposition: 6 }],
    };
    const patches = applyConsistencyPatches(gameState, statePatches);
    expect(patches).toBeDefined();
    expect(patches.npcs[0].disposition).toBe(6);
  });

  it('applies dead quest giver world facts', () => {
    const gameState = { world: baseWorld };
    const statePatches = {
      deadQuestGiverFacts: ['Olaf has died'],
    };
    const patches = applyConsistencyPatches(gameState, statePatches);
    expect(patches.newWorldFacts).toEqual(['Olaf has died']);
  });

  it('returns null when no patches needed', () => {
    const patches = applyConsistencyPatches({ world: baseWorld }, {});
    expect(patches).toBeNull();
  });
});

describe('buildConsistencyWarningsForPrompt', () => {
  it('builds warning text from warnings array', () => {
    const result = buildConsistencyWarningsForPrompt(['Warning 1', 'Warning 2']);
    expect(result).toContain('Warning 1');
    expect(result).toContain('Warning 2');
    expect(result).toContain('WORLD CONSISTENCY WARNINGS');
  });

  it('returns empty string for no warnings', () => {
    expect(buildConsistencyWarningsForPrompt([])).toBe('');
    expect(buildConsistencyWarningsForPrompt(null)).toBe('');
  });

  it('limits to 5 warnings', () => {
    const warnings = Array.from({ length: 10 }, (_, i) => `Warning ${i}`);
    const result = buildConsistencyWarningsForPrompt(warnings);
    expect(result).toContain('Warning 4');
    expect(result).not.toContain('Warning 5');
  });
});
