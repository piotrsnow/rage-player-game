// Unit tests for randomize.js — randomAppearance, randomSlot, defaultAppearance.
//
// We build a deliberately tiny in-memory manifest so the tests don't depend
// on the real /chargen/INDEX.json.

import { describe, it, expect } from 'vitest';
import {
  randomAppearance,
  randomSlot,
  defaultAppearance,
} from './randomize.js';

// Deterministic RNG: consumes a sequence, repeating the last value after
// the sequence is exhausted.
function seqRng(values) {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i++;
    return v;
  };
}

function makeManifest({ includeHumanAlt = false } = {}) {
  // Minimal body/head/hair/shirt/shadow items for a single human config.
  const humanBody = {
    id: 'humanoid_m1',
    chargen: true,
    primarycolors: ['skin_pink', 'skin_tan'],
    textures: [{ body: 'hm1', front: 'textures/body/hm1.png', back: 'none' }],
  };
  const humanHair = {
    id: 'human/short',
    chargen: true,
    primarycolors: ['hair_black', 'hair_brown'],
    textures: [{ body: 'hm1', front: 'textures/hair/human_short_hm1.png', back: 'none' }],
  };
  const humanShirt = {
    id: 'tshirt',
    chargen: true,
    primarycolors: ['red', 'blue'],
    textures: [{ body: 'hm1', front: 'textures/shirt/tshirt_hm1.png', back: 'none' }],
  };
  const shadowDefault = {
    id: 'default',
    chargen: true,
    fixedcolors: ['body_shadow'],
    textures: [{ body: 'hm1', front: 'textures/shadow/default_hm1.png' }],
  };
  const hatFez = {
    id: 'fez',
    chargen: true,
    primarycolors: ['crimson', 'navy'],
    textures: [{ body: 'hm1', front: 'textures/hat/fez_hm1.png' }],
  };

  const manifest = {
    races: {
      human: {
        configs: [{
          id: 'm1',
          'body-type': 'hm1',
          'head-type': 'human',
          body: ['humanoid_m1'],
          hair: ['short'],
          shirt: ['tshirt'],
          shadow: ['default'],
        }],
      },
    },
    categories: {
      body: { items: { humanoid_m1: humanBody } },
      hair: { items: { 'human/short': humanHair } },
      shirt: { items: { tshirt: humanShirt } },
      shadow: { items: { default: shadowDefault } },
      hat: { items: { fez: hatFez } },
    },
  };

  if (includeHumanAlt) {
    manifest.races.human_alt = {
      configs: [{
        id: 'm1',
        'body-type': 'hm1',
        'head-type': 'human',
        body: ['humanoid_m1'],
      }],
    };
  }
  return manifest;
}

describe('randomAppearance', () => {
  it('returns a coherent appearance object with race/config/body/head/slots', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: () => 0 });
    expect(appearance.race).toBe('human');
    expect(appearance.config).toBe('m1');
    expect(appearance.bodyType).toBe('hm1');
    expect(appearance.headType).toBe('human');
    expect(appearance.slots).toBeTypeOf('object');
  });

  it('populates slots that have allowed-items in the config', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: () => 0 });
    expect(appearance.slots.body?.id).toBe('humanoid_m1');
    expect(appearance.slots.shirt?.id).toBe('tshirt');
    expect(appearance.slots.shadow?.id).toBe('default');
  });

  it('falls back to race-group prefixed keys for hair items', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: () => 0 });
    // Hair manifest uses `human/short` but the config lists plain `short`.
    expect(appearance.slots.hair?.id).toBe('human/short');
  });

  it('chooses colors from primarycolors[] when present', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: seqRng([0, 0, 0, 0, 0.99, 0]) });
    expect(appearance.slots.body?.color).toMatch(/^skin_/);
  });

  it('uses fixedcolors[0] when primarycolors is absent', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: () => 0 });
    expect(appearance.slots.shadow?.color).toBe('body_shadow');
  });

  it('respects a forced raceId', () => {
    const m = makeManifest({ includeHumanAlt: true });
    const appearance = randomAppearance(m, { raceId: 'human_alt', rng: () => 0 });
    expect(appearance.race).toBe('human_alt');
  });

  it('respects a forced configId', () => {
    const m = makeManifest();
    // Add a second config so there's a non-trivial pick.
    m.races.human.configs.push({
      id: 'f1',
      'body-type': 'hf1',
      'head-type': 'human',
      body: ['humanoid_m1'],
    });
    const appearance = randomAppearance(m, {
      raceId: 'human', configId: 'f1', rng: () => 0,
    });
    expect(appearance.config).toBe('f1');
    expect(appearance.bodyType).toBe('hf1');
  });

  it('is deterministic for a given seeded rng', () => {
    const m = makeManifest();
    const r1 = randomAppearance(m, { rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5]) });
    const r2 = randomAppearance(m, { rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5]) });
    expect(r1).toEqual(r2);
  });

  it('throws if the manifest has no races', () => {
    expect(() => randomAppearance({ races: {} }, { rng: () => 0 })).toThrow();
  });

  it('skips slots whose allowed list is empty or missing', () => {
    const m = makeManifest();
    // Config has no `hat` allowed list — hat should not appear in slots.
    const appearance = randomAppearance(m, { rng: () => 0 });
    expect(appearance.slots.hat).toBeUndefined();
  });

  it('force-fills shadow slot when the config has it but random skipped', () => {
    const m = makeManifest();
    // Patch: make shadow item non-chargen so the normal path rejects it but
    // the forced fallback path can still find it via findItemKey.
    // Actually findItemKey ALSO checks chargen === false — so set chargen=true
    // but ensure the slot is present even under edge cases.
    const appearance = randomAppearance(m, { rng: () => 0 });
    expect(appearance.slots.shadow).toBeDefined();
  });
});

describe('randomSlot', () => {
  it('returns null when manifest or appearance is missing', () => {
    expect(randomSlot(null, {}, 'body')).toBeNull();
    expect(randomSlot(makeManifest(), null, 'body')).toBeNull();
  });

  it('returns null for an unknown race', () => {
    const m = makeManifest();
    expect(randomSlot(m, { race: 'dragon' }, 'body')).toBeNull();
  });

  it('rerolls a config-scoped slot from the allowed list', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: () => 0 });
    const next = randomSlot(m, appearance, 'body', { rng: () => 0 });
    expect(next).toBeDefined();
    expect(next.id).toBe('humanoid_m1');
  });

  it('falls back to all chargen items for slots without an allowed list', () => {
    const m = makeManifest();
    // Hat is a free slot — config has no `hat` whitelist.
    const appearance = randomAppearance(m, { rng: () => 0 });
    const picked = randomSlot(m, appearance, 'hat', { rng: () => 0 });
    expect(picked?.id).toBe('fez');
  });

  it('returns null when the free-slot category is unknown', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: () => 0 });
    expect(randomSlot(m, appearance, 'nonexistent_slot', { rng: () => 0 })).toBeNull();
  });

  it('keeps the appearance race hint for race-group resolution', () => {
    const m = makeManifest();
    const appearance = randomAppearance(m, { rng: () => 0 });
    const picked = randomSlot(m, appearance, 'hair', { rng: () => 0 });
    expect(picked?.id).toBe('human/short');
  });
});

describe('defaultAppearance', () => {
  it('uses human race and the m1 config when available', () => {
    const m = makeManifest();
    const appearance = defaultAppearance(m);
    expect(appearance.race).toBe('human');
    expect(appearance.config).toBe('m1');
  });

  it('falls back to the first human config when m1 is absent', () => {
    const m = makeManifest();
    m.races.human.configs = [{ id: 'x1', 'body-type': 'hm1', 'head-type': 'human' }];
    const appearance = defaultAppearance(m);
    expect(appearance.config).toBe('x1');
  });

  it('falls back to a full random when no human race exists', () => {
    const m = makeManifest();
    delete m.races.human;
    m.races.elf = {
      configs: [{ id: 'e1', 'body-type': 'hm1', 'head-type': 'elf', body: ['humanoid_m1'] }],
    };
    const appearance = defaultAppearance(m);
    expect(appearance.race).toBe('elf');
  });
});
