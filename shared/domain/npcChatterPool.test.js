import { describe, it, expect } from 'vitest';
import { NPC_CHATTER_POOL, pickChatterLine } from './npcChatterPool.js';

describe('NPC_CHATTER_POOL', () => {
  it('every role has all three mood arrays populated', () => {
    for (const [role, pool] of Object.entries(NPC_CHATTER_POOL)) {
      expect(pool.friendly?.length, `${role}.friendly`).toBeGreaterThan(0);
      expect(pool.neutral?.length, `${role}.neutral`).toBeGreaterThan(0);
      expect(pool.grumpy?.length, `${role}.grumpy`).toBeGreaterThan(0);
    }
  });
});

describe('pickChatterLine', () => {
  it('returns null for missing npc', () => {
    expect(pickChatterLine(null)).toBeNull();
  });

  it('falls back to default pool for unknown roles', () => {
    const line = pickChatterLine({ role: 'kosmita' }, { seed: 0 });
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
  });

  it('uses friendly pool for high disposition', () => {
    const karczmarzFriendly = NPC_CHATTER_POOL.karczmarz.friendly;
    const picked = pickChatterLine({ role: 'karczmarz', disposition: 30 }, { seed: 0 });
    expect(karczmarzFriendly).toContain(picked);
  });

  it('uses grumpy pool for low disposition', () => {
    const grumpy = NPC_CHATTER_POOL.karczmarz.grumpy;
    const picked = pickChatterLine({ role: 'karczmarz', disposition: -30 }, { seed: 0 });
    expect(grumpy).toContain(picked);
  });

  it('uses neutral pool for neutral disposition', () => {
    const neutral = NPC_CHATTER_POOL.karczmarz.neutral;
    const picked = pickChatterLine({ role: 'karczmarz', disposition: 0 }, { seed: 0 });
    expect(neutral).toContain(picked);
  });

  it('matches role by substring (strażnik miejski → strażnik pool)', () => {
    const picked = pickChatterLine({ role: 'strażnik miejski' }, { seed: 0 });
    const allStrazLines = [
      ...NPC_CHATTER_POOL.strażnik.friendly,
      ...NPC_CHATTER_POOL.strażnik.neutral,
      ...NPC_CHATTER_POOL.strażnik.grumpy,
    ];
    expect(allStrazLines).toContain(picked);
  });
});
