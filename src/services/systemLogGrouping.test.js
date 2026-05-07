import { describe, expect, it } from 'vitest';
import { groupSystemLogsByScene, isSystemLogMessage } from './systemLogGrouping';

describe('isSystemLogMessage', () => {
  it('accepts system messages with whitelisted subtypes', () => {
    expect(isSystemLogMessage({ role: 'system', subtype: 'item_gained' })).toBe(true);
    expect(isSystemLogMessage({ role: 'system', subtype: 'location_changed' })).toBe(true);
    expect(isSystemLogMessage({ role: 'system', subtype: 'combat_start' })).toBe(true);
  });

  it('rejects dialogues and unknown subtypes', () => {
    expect(isSystemLogMessage({ role: 'dm', content: 'hi' })).toBe(false);
    expect(isSystemLogMessage({ role: 'player', content: 'hi' })).toBe(false);
    expect(isSystemLogMessage({ role: 'system', subtype: 'validation_warning' })).toBe(false);
    expect(isSystemLogMessage({ role: 'system', subtype: 'wait' })).toBe(false);
    expect(isSystemLogMessage(null)).toBe(false);
  });
});

describe('groupSystemLogsByScene', () => {
  it('returns empty array when there is no chat history', () => {
    expect(groupSystemLogsByScene({ chatHistory: [], scenes: [] })).toEqual([]);
  });

  it('groups system messages into the right scene by timestamp', () => {
    const scenes = [
      { id: 's1', timestamp: 1000, narrative: 'first', scenePacing: 'exploration' },
      { id: 's2', timestamp: 2000, narrative: 'second', scenePacing: 'combat' },
    ];
    const chatHistory = [
      { id: 'm1', role: 'dm', sceneId: 's1', content: 'narrative', timestamp: 1000 },
      { id: 'm2', role: 'system', subtype: 'item_gained', timestamp: 1500 },
      { id: 'm3', role: 'dm', sceneId: 's2', content: 'narrative', timestamp: 2000 },
      { id: 'm4', role: 'system', subtype: 'damage', timestamp: 2300 },
      { id: 'm5', role: 'system', subtype: 'combat_end', timestamp: 2400 },
    ];
    const groups = groupSystemLogsByScene({ chatHistory, scenes });
    expect(groups).toHaveLength(2);
    expect(groups[0].sceneIndex).toBe(0);
    expect(groups[0].messages.map((m) => m.id)).toEqual(['m2']);
    expect(groups[1].sceneIndex).toBe(1);
    expect(groups[1].messages.map((m) => m.id)).toEqual(['m4', 'm5']);
  });

  it('puts pre-scene messages into a -1 bucket prepended to the result', () => {
    const scenes = [{ id: 's1', timestamp: 1000 }];
    const chatHistory = [
      { id: 'm1', role: 'system', subtype: 'item_gained', timestamp: 500 },
      { id: 'm2', role: 'system', subtype: 'item_gained', timestamp: 1500 },
    ];
    const groups = groupSystemLogsByScene({ chatHistory, scenes });
    expect(groups).toHaveLength(2);
    expect(groups[0].sceneIndex).toBe(-1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(['m1']);
    expect(groups[1].sceneIndex).toBe(0);
    expect(groups[1].messages.map((m) => m.id)).toEqual(['m2']);
  });

  it('skips dialogues and validation warnings', () => {
    const scenes = [{ id: 's1', timestamp: 1000 }];
    const chatHistory = [
      { id: 'm1', role: 'dm', sceneId: 's1', content: 'narrative', timestamp: 1100 },
      { id: 'm2', role: 'player', content: 'hi', timestamp: 1200 },
      { id: 'm3', role: 'system', subtype: 'validation_warning', content: 'bad', timestamp: 1300 },
      { id: 'm4', role: 'system', subtype: 'item_gained', timestamp: 1400 },
    ];
    const groups = groupSystemLogsByScene({ chatHistory, scenes });
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(['m4']);
  });

  it('keeps empty scene buckets so users can see scenes without events', () => {
    const scenes = [
      { id: 's1', timestamp: 1000 },
      { id: 's2', timestamp: 2000 },
    ];
    const chatHistory = [
      { id: 'm1', role: 'system', subtype: 'item_gained', timestamp: 1500 },
    ];
    const groups = groupSystemLogsByScene({ chatHistory, scenes });
    expect(groups.map((g) => g.sceneIndex)).toEqual([0, 1]);
    expect(groups[1].messages).toEqual([]);
  });
});
