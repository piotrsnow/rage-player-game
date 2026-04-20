import { describe, it, expect } from 'vitest';
import {
  decideNpcAdmission,
  decideSublocationAdmission,
  computeSubLocationBudget,
} from './topologyGuard.js';

describe('decideNpcAdmission', () => {
  it('admits as key under cap', () => {
    expect(decideNpcAdmission({ currentKeyNpcCount: 5, maxKeyNpcs: 10 })).toEqual({
      admission: 'key',
      reason: 'under_cap',
    });
  });

  it('admits as background when at cap', () => {
    expect(decideNpcAdmission({ currentKeyNpcCount: 10, maxKeyNpcs: 10 })).toEqual({
      admission: 'background',
      reason: 'over_cap',
    });
  });

  it('defaults maxKeyNpcs to 10', () => {
    expect(decideNpcAdmission({ currentKeyNpcCount: 9 }).admission).toBe('key');
    expect(decideNpcAdmission({ currentKeyNpcCount: 10 }).admission).toBe('background');
  });
});

describe('decideSublocationAdmission', () => {
  const emptyChildren = { required: [], optional: [], custom: [] };

  it('admits a required slot (tavern in village)', () => {
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: emptyChildren,
      maxSubLocations: 5,
      slotType: 'tavern',
      name: 'Pod Dębem',
    });
    expect(r).toEqual({ admission: 'required', slotType: 'tavern', slotKind: 'required', reason: 'ok' });
  });

  it('admits an optional slot (church in village)', () => {
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: emptyChildren,
      maxSubLocations: 5,
      slotType: 'church',
      name: 'Kaplica Sigmara',
    });
    expect(r.admission).toBe('optional');
    expect(r.slotKind).toBe('optional');
  });

  it('admits a narratively-distinctive custom slot', () => {
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: emptyChildren,
      maxSubLocations: 5,
      slotType: null,
      name: 'Wieża Starego Maga',
    });
    expect(r.admission).toBe('custom');
  });

  it('rejects generic single-word name', () => {
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: emptyChildren,
      maxSubLocations: 5,
      slotType: null,
      name: 'Dom',
    });
    expect(r).toEqual({ admission: 'reject', reason: 'generic_name' });
  });

  it('rejects when hard cap already reached', () => {
    const full = {
      required: [{ name: 'A' }, { name: 'B' }],
      optional: [{ name: 'C' }, { name: 'D' }, { name: 'E' }],
      custom: [],
    };
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: full,
      maxSubLocations: 5,
      slotType: 'church',
      name: 'Kościół',
    });
    expect(r).toEqual({ admission: 'reject', reason: 'hard_cap_exceeded' });
  });

  it('rejects optional when optionalCap already reached', () => {
    // village optionalCap = 3
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: {
        required: [{ name: 'Tavern' }],
        optional: [{ name: 'Church' }, { name: 'Smithy' }, { name: 'Alch' }],
        custom: [],
      },
      maxSubLocations: 5,
      slotType: 'mill',
      name: 'Młyn Starego Jana',
    });
    expect(r).toEqual({ admission: 'reject', reason: 'optional_cap_exceeded' });
  });

  it('custom has no numeric cap (user spec)', () => {
    // fill 2 customs already, and still under hard cap
    const r = decideSublocationAdmission({
      parentLocationType: 'city',
      childrenBySlot: {
        required: [{ name: 'Tavern' }, { name: 'Market' }, { name: 'Barracks' }],
        optional: [],
        custom: [{ name: 'Ruiny Świątyni' }, { name: 'Piwnica Alchemika' }],
      },
      maxSubLocations: 18,
      slotType: null,
      name: 'Wieża Maga Pod Chmurą',
    });
    expect(r.admission).toBe('custom');
  });
});

describe('computeSubLocationBudget', () => {
  it('reports remaining capacity + open optional slots', () => {
    const budget = computeSubLocationBudget({
      parentLocationType: 'village',
      childrenBySlot: {
        required: [{ name: 'Tavern', slotType: 'tavern' }],
        optional: [
          { name: 'Church', slotType: 'church' },
          { name: 'Smithy', slotType: 'blacksmith' },
        ],
        custom: [],
      },
      maxSubLocations: 5,
    });
    expect(budget.capacityRemaining).toBe(2);
    expect(budget.optionalBudgetRemaining).toBe(1); // 3 cap - 2 used = 1
    expect(budget.openOptional).toContain('alchemist');
    expect(budget.openOptional).not.toContain('church');
  });

  it('reports zero remaining when full', () => {
    const budget = computeSubLocationBudget({
      parentLocationType: 'hamlet',
      childrenBySlot: {
        required: [],
        optional: [
          { name: 'Tavern', slotType: 'tavern' },
          { name: 'Elder', slotType: 'elder_home' },
        ],
        custom: [],
      },
      maxSubLocations: 2,
    });
    expect(budget.capacityRemaining).toBe(0);
  });

  it('handles missing optionalCap gracefully', () => {
    const budget = computeSubLocationBudget({
      parentLocationType: 'unknown_type',
      childrenBySlot: { required: [], optional: [], custom: [] },
      maxSubLocations: 3,
    });
    expect(budget.capacityRemaining).toBe(3);
    expect(budget.optionalBudgetRemaining).toBe(0);
  });
});
