import { describe, it, expect } from 'vitest';
import { shouldPromoteToGlobal } from './processStateChanges.js';

describe('shouldPromoteToGlobal', () => {
  it('returns promote=false when stateChanges is empty or invalid', () => {
    expect(shouldPromoteToGlobal(null)).toEqual({ promote: false, gate: null });
    expect(shouldPromoteToGlobal(undefined)).toEqual({ promote: false, gate: null });
    expect(shouldPromoteToGlobal({})).toEqual({ promote: false, gate: null });
  });

  it('promotes with gate=dungeon when dungeonComplete is set (self-gating)', () => {
    const result = shouldPromoteToGlobal({
      dungeonComplete: { name: 'Crypt of Ash', summary: 'cleared' },
    });
    expect(result).toEqual({ promote: true, gate: 'dungeon' });
  });

  it('promotes with gate=deadly when defeatedDeadlyEncounter flag fires (self-gating)', () => {
    const result = shouldPromoteToGlobal({
      defeatedDeadlyEncounter: true,
    });
    expect(result).toEqual({ promote: true, gate: 'deadly' });
  });

  it('returns promote=false when worldImpact=major but no objective gate', () => {
    const result = shouldPromoteToGlobal({
      worldImpact: 'major',
      worldImpactReason: 'player felt heroic',
    });
    expect(result).toEqual({ promote: false, gate: null });
  });

  it('promotes with gate=liberation when worldImpact=major + locationLiberated', () => {
    const result = shouldPromoteToGlobal({
      worldImpact: 'major',
      locationLiberated: true,
    });
    expect(result).toEqual({ promote: true, gate: 'liberation' });
  });

  it('promotes with gate=main_quest when worldImpact=major + mainQuestCompleted', () => {
    const result = shouldPromoteToGlobal(
      { worldImpact: 'major' },
      { mainQuestCompleted: true },
    );
    expect(result).toEqual({ promote: true, gate: 'main_quest' });
  });

  it('promotes with gate=named_kill when worldImpact=major + named NPC killed', () => {
    const result = shouldPromoteToGlobal({
      worldImpact: 'major',
      npcs: [
        { name: 'Gromsh the Butcher', alive: false },
        { name: 'Random Thug', alive: true },
      ],
    });
    expect(result).toEqual({ promote: true, gate: 'named_kill' });
  });

  it('ignores unnamed dead NPCs for named_kill gate', () => {
    const result = shouldPromoteToGlobal({
      worldImpact: 'major',
      npcs: [{ name: '', alive: false }, { alive: false }],
    });
    expect(result).toEqual({ promote: false, gate: null });
  });

  it('returns promote=false when worldImpact=minor even with named kill', () => {
    const result = shouldPromoteToGlobal({
      worldImpact: 'minor',
      npcs: [{ name: 'Kowal', alive: false }],
    });
    expect(result).toEqual({ promote: false, gate: null });
  });

  it('dungeonComplete wins over worldImpact=minor (self-gating beats flag)', () => {
    const result = shouldPromoteToGlobal({
      worldImpact: 'minor',
      dungeonComplete: { name: 'Tomb', summary: 'done' },
    });
    expect(result.promote).toBe(true);
    expect(result.gate).toBe('dungeon');
  });
});
