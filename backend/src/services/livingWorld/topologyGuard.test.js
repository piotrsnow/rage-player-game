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
      slotType: 'tavern',
      name: 'Pod Dębem',
    });
    expect(r).toEqual({ admission: 'required', slotType: 'tavern', slotKind: 'required', reason: 'ok' });
  });

  it('admits an optional slot (church in village)', () => {
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: emptyChildren,
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
      slotType: null,
      name: 'Wieża Starego Maga',
    });
    expect(r.admission).toBe('custom');
  });

  it('rejects generic single-word name', () => {
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: emptyChildren,
      slotType: null,
      name: 'Dom',
    });
    expect(r).toEqual({ admission: 'reject', reason: 'generic_name' });
  });

  it('does NOT cap optional emissions — sublocations are per-campaign sandbox', () => {
    // village template optionalCap was 3; we now ignore the cap.
    const r = decideSublocationAdmission({
      parentLocationType: 'village',
      childrenBySlot: {
        required: [{ name: 'Tavern' }],
        optional: [{ name: 'Church' }, { name: 'Smithy' }, { name: 'Alch' }],
        custom: [],
      },
      slotType: 'mill',
      name: 'Młyn Starego Jana',
    });
    expect(r.admission).toBe('optional');
  });

  it('does NOT cap total sublocations — caps were retired (per-campaign sandbox)', () => {
    // city template hard cap was 18; we now ignore.
    const r = decideSublocationAdmission({
      parentLocationType: 'city',
      childrenBySlot: {
        required: [{ name: 'Tavern' }, { name: 'Market' }, { name: 'Barracks' }],
        optional: [],
        custom: Array.from({ length: 30 }, (_, i) => ({ name: `Custom ${i}` })),
      },
      slotType: null,
      name: 'Wieża Maga Pod Chmurą',
    });
    expect(r.admission).toBe('custom');
  });
});

describe('computeSubLocationBudget', () => {
  it('returns filled groups + openOptional narrative hints (no caps)', () => {
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
    });
    expect(budget.filled.required).toHaveLength(1);
    expect(budget.filled.optional).toHaveLength(2);
    expect(budget.openOptional).toContain('alchemist');
    expect(budget.openOptional).not.toContain('church');
    // Capacity numbers are intentionally absent.
    expect(budget).not.toHaveProperty('capacityRemaining');
    expect(budget).not.toHaveProperty('optionalBudgetRemaining');
    expect(budget).not.toHaveProperty('customBudgetRemaining');
  });
});
