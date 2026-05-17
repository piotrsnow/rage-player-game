import { describe, it, expect } from 'vitest';
import { syncSkinColoredSlots, SKIN_SYNCED_SLOTS } from './chargenCompositor.js';

describe('syncSkinColoredSlots', () => {
  it('fills head/nose/ears with body skin color when their color is "none"', () => {
    const appearance = {
      slots: {
        body: { id: 'human', color: 'human_skin_olive' },
        head: { id: 'human', color: 'none' },
        nose: { id: 'straight', color: 'none' },
        ears: { id: 'base', color: 'none' },
      },
    };
    syncSkinColoredSlots(appearance);
    expect(appearance.slots.head.color).toBe('human_skin_olive');
    expect(appearance.slots.nose.color).toBe('human_skin_olive');
    expect(appearance.slots.ears.color).toBe('human_skin_olive');
  });

  it('fills head/nose/ears when their color is missing', () => {
    const appearance = {
      slots: {
        body: { id: 'human', color: 'human_skin_brown' },
        head: { id: 'human' },
        nose: { id: 'big' },
        ears: { id: 'elven' },
      },
    };
    syncSkinColoredSlots(appearance);
    expect(appearance.slots.head.color).toBe('human_skin_brown');
    expect(appearance.slots.nose.color).toBe('human_skin_brown');
    expect(appearance.slots.ears.color).toBe('human_skin_brown');
  });

  it('preserves an explicit non-none color on head/nose/ears', () => {
    const appearance = {
      slots: {
        body: { id: 'human', color: 'human_skin_light' },
        head: { id: 'human', color: 'demon_skin_red' },
        nose: { id: 'straight', color: 'human_skin_peach' },
      },
    };
    syncSkinColoredSlots(appearance);
    expect(appearance.slots.head.color).toBe('demon_skin_red');
    expect(appearance.slots.nose.color).toBe('human_skin_peach');
  });

  it('does nothing when body color is missing or "none"', () => {
    const headOnly = {
      slots: {
        head: { id: 'human', color: 'none' },
      },
    };
    syncSkinColoredSlots(headOnly);
    expect(headOnly.slots.head.color).toBe('none');

    const bodyNone = {
      slots: {
        body: { id: 'human', color: 'none' },
        head: { id: 'human', color: 'none' },
      },
    };
    syncSkinColoredSlots(bodyNone);
    expect(bodyNone.slots.head.color).toBe('none');
  });

  it('skips slots that are absent from the appearance', () => {
    const appearance = {
      slots: {
        body: { id: 'human', color: 'human_skin_peach' },
        head: { id: 'human', color: 'none' },
        // nose & ears absent
      },
    };
    syncSkinColoredSlots(appearance);
    expect(appearance.slots.head.color).toBe('human_skin_peach');
    expect(appearance.slots.nose).toBeUndefined();
    expect(appearance.slots.ears).toBeUndefined();
  });

  it('tolerates appearance objects without slots', () => {
    expect(() => syncSkinColoredSlots({})).not.toThrow();
    expect(() => syncSkinColoredSlots(null)).not.toThrow();
    expect(() => syncSkinColoredSlots(undefined)).not.toThrow();
  });

  it('exports the canonical list of skin-synced slot names', () => {
    expect(SKIN_SYNCED_SLOTS).toEqual(['head', 'nose', 'ears']);
  });
});
