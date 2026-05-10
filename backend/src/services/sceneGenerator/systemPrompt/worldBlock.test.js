import { describe, it, expect } from 'vitest';
import { buildActiveQuestsBlock, buildWorldStateBlock, buildNpcRelationshipsBlock } from './worldBlock.js';

function quest({ id, name = 'Q', type = 'main', objectives = [] }) {
  return { id, name, type, objectives };
}

function obj({ description = 'do thing', completed = false, status, nodeKey } = {}) {
  return {
    description,
    completed,
    ...(status ? { status } : {}),
    ...(nodeKey ? { nodeKey } : {}),
  };
}

describe('buildActiveQuestsBlock', () => {
  it('returns null when no active quests', () => {
    expect(buildActiveQuestsBlock({ active: [] })).toBe(null);
    expect(buildActiveQuestsBlock({})).toBe(null);
  });

  it('renders only main quests under "Active Quests" — no Background sub-section', () => {
    const out = buildActiveQuestsBlock({
      active: [quest({ id: 'q1', type: 'main', objectives: [obj({ description: 'find the staff' })] })],
    });
    expect(out).toContain('Active Quests');
    expect(out).not.toContain('--- Background Quests');
    expect(out).toContain('find the staff');
  });

  it('renders side quests under "--- Background Quests ---" with numbered objectives', () => {
    const out = buildActiveQuestsBlock({
      active: [
        quest({ id: 'q1', name: 'Main', type: 'main', objectives: [obj({ description: 'main goal' })] }),
        quest({ id: 'q2', name: 'Side', type: 'side', objectives: [obj({ description: 'deliver letter' })] }),
      ],
    });
    expect(out).toContain('Active Quests');
    expect(out).toContain('--- Background Quests');
    expect(out).toContain('main goal');
    expect(out).toContain('deliver letter');
    // Background sub-section directive teaches LLM to emit questUpdates without divert.
    expect(out).toContain('emit questUpdates only when narrative actually resolves them');
    // Order: main appears before background sub-heading.
    const mainIdx = out.indexOf('main goal');
    const bgIdx = out.indexOf('--- Background Quests');
    expect(mainIdx).toBeLessThan(bgIdx);
  });

  it('renders only background quests when no main is active', () => {
    const out = buildActiveQuestsBlock({
      active: [quest({ id: 'q1', type: 'side', objectives: [obj({ description: 'find herbs' })] })],
    });
    expect(out).toContain('--- Background Quests');
    expect(out).toContain('find herbs');
    // No main "Active Quests:" header rendered.
    expect(out).not.toContain('Active Quests (use id=...');
  });

  it('side / personal / faction all classified as background', () => {
    const out = buildActiveQuestsBlock({
      active: [
        quest({ id: 'a', type: 'side', objectives: [obj({ description: 'side obj' })] }),
        quest({ id: 'b', type: 'personal', objectives: [obj({ description: 'personal obj' })] }),
        quest({ id: 'c', type: 'faction', objectives: [obj({ description: 'faction obj' })] }),
      ],
    });
    expect(out).toContain('--- Background Quests');
    expect(out).toContain('side obj');
    expect(out).toContain('personal obj');
    expect(out).toContain('faction obj');
  });

  it('caps main at 5 and background at 3', () => {
    const main = Array.from({ length: 7 }, (_, i) =>
      quest({ id: `m${i}`, name: `Main ${i}`, type: 'main', objectives: [obj({ description: `main_obj_${i}` })] }),
    );
    const side = Array.from({ length: 5 }, (_, i) =>
      quest({ id: `s${i}`, name: `Side ${i}`, type: 'side', objectives: [obj({ description: `side_obj_${i}` })] }),
    );
    const out = buildActiveQuestsBlock({ active: [...main, ...side] });
    // Main: ids m0..m4 visible, m5/m6 cut.
    expect(out).toContain('main_obj_0');
    expect(out).toContain('main_obj_4');
    expect(out).not.toContain('main_obj_5');
    expect(out).not.toContain('main_obj_6');
    // Side: s0..s2 visible, s3/s4 cut.
    expect(out).toContain('side_obj_0');
    expect(out).toContain('side_obj_2');
    expect(out).not.toContain('side_obj_3');
  });

  it('graph mode renders both main and background with [nodeKey] markers', () => {
    const out = buildActiveQuestsBlock(
      {
        active: [
          quest({
            id: 'q1', name: 'Main', type: 'main',
            objectives: [{ description: 'meet baron', status: 'pending', nodeKey: 'meet_baron' }],
          }),
          quest({
            id: 'q2', name: 'Side', type: 'side',
            objectives: [{ description: 'find herbs', status: 'pending', nodeKey: 'find_herbs' }],
          }),
        ],
      },
      { questGraphEnabled: true },
    );
    expect(out).toContain('graph-aware');
    expect(out).toContain('--- Background Quests');
    expect(out).toContain('[meet_baron]');
    expect(out).toContain('[find_herbs]');
  });
});

describe('buildWorldStateBlock — NPC ref-aware filtering', () => {
  const worldRef = { kind: 'world', id: 'loc-1' };
  const otherRef = { kind: 'campaign', id: 'loc-2' };

  it('includes NPC matched by composite ref', () => {
    const world = {
      currentLocation: 'Yeralden',
      currentLocationRef: worldRef,
      npcs: [
        { name: 'Gareth', alive: true, locationRef: worldRef, lastLocation: 'Yeralden', role: 'guard', attitude: 'friendly', disposition: 5 },
      ],
    };
    const block = buildWorldStateBlock(world);
    expect(block).toContain('Gareth');
  });

  it('excludes NPC at a different ref even if legacy string matches', () => {
    const world = {
      currentLocation: 'Yeralden',
      currentLocationRef: worldRef,
      npcs: [
        { name: 'Moved', alive: true, locationRef: otherRef, lastLocation: 'Yeralden', role: 'thief', attitude: 'hostile', disposition: -10 },
      ],
    };
    const block = buildWorldStateBlock(world);
    expect(block || '').not.toContain('Moved');
  });

  it('falls back to string match when NPC has no locationRef', () => {
    const world = {
      currentLocation: 'Yeralden',
      currentLocationRef: worldRef,
      npcs: [
        { name: 'Legacy', alive: true, locationRef: null, lastLocation: 'Yeralden', role: 'bard', attitude: 'neutral', disposition: 0 },
      ],
    };
    const block = buildWorldStateBlock(world);
    expect(block).toContain('Legacy');
  });

  it('excludes dead NPC', () => {
    const world = {
      currentLocation: 'Yeralden',
      currentLocationRef: worldRef,
      npcs: [
        { name: 'Dead', alive: false, locationRef: worldRef, lastLocation: 'Yeralden', role: 'ghost', attitude: 'neutral', disposition: 0 },
      ],
    };
    const block = buildWorldStateBlock(world);
    expect(block || '').not.toContain('Dead');
  });
});

describe('buildNpcRelationshipsBlock — ref-aware filtering', () => {
  const ref = { kind: 'world', id: 'loc-1' };

  it('returns null when no NPCs match current ref', () => {
    const world = {
      currentLocation: 'Yeralden',
      currentLocationRef: ref,
      npcs: [
        { name: 'Far', alive: true, locationRef: { kind: 'campaign', id: 'loc-2' }, lastLocation: 'Kamionka', role: 'x', attitude: 'x', disposition: 0, relationships: [] },
      ],
    };
    expect(buildNpcRelationshipsBlock(world)).toBe(null);
  });
});
