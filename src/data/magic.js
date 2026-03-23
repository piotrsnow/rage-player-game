// Magic System - WFRP 4e Winds of Magic, spells, miscasts, and channelling

export const WINDS_OF_MAGIC = {
  aqshy:  { name: 'Aqshy',  lore: 'Fire',    color: '#FF4500', characteristics: ['ws', 'wp'] },
  azyr:   { name: 'Azyr',   lore: 'Heavens', color: '#4169E1', characteristics: ['i', 'wp'] },
  chamon: { name: 'Chamon', lore: 'Metal',   color: '#FFD700', characteristics: ['t', 'wp'] },
  ghur:   { name: 'Ghur',   lore: 'Beasts',  color: '#8B4513', characteristics: ['s', 'wp'] },
  ghyran: { name: 'Ghyran', lore: 'Life',    color: '#228B22', characteristics: ['t', 'fel'] },
  hysh:   { name: 'Hysh',   lore: 'Light',   color: '#FFFFF0', characteristics: ['int', 'wp'] },
  shyish: { name: 'Shyish', lore: 'Death',   color: '#4B0082', characteristics: ['wp', 'fel'] },
  ulgu:   { name: 'Ulgu',   lore: 'Shadow',  color: '#708090', characteristics: ['ag', 'wp'] },
};

export const SPELLS = [
  // ── Petty Magic (CN 0-4) ──────────────────────────────────────
  {
    name: 'Dart',
    lore: 'petty',
    cn: 3,
    range: '18m',
    target: '1',
    duration: 'Instant',
    effect: 'Ranged magic missile dealing 1d10+3 damage.',
    overcast: '+1 damage per extra SL.',
  },
  {
    name: 'Light',
    lore: 'petty',
    cn: 0,
    range: 'Self',
    target: 'Self',
    duration: 'WPB hours',
    effect: 'Create a bright light emanating from the caster or a touched object, illuminating a 10m radius.',
    overcast: '+5m radius per extra SL.',
  },
  {
    name: 'Open Lock',
    lore: 'petty',
    cn: 2,
    range: 'Touch',
    target: '1 lock',
    duration: 'Instant',
    effect: 'Magically opens a simple lock. Complex or magical locks may resist.',
    overcast: '+10 to effective skill for bypassing complex locks per extra SL.',
  },
  {
    name: 'Sleep',
    lore: 'petty',
    cn: 4,
    range: '6m',
    target: '1',
    duration: 'WPB rounds',
    effect: 'Target must pass a WP test or fall asleep. Damage or loud noise wakes them.',
    overcast: '+1 additional target per extra SL.',
  },
  {
    name: 'Sounds',
    lore: 'petty',
    cn: 2,
    range: '30m',
    target: 'Special',
    duration: 'WPB rounds',
    effect: 'Create illusory sounds at a point within range. Volume up to a crowd of people.',
    overcast: '+1 minute duration per extra SL.',
  },
  {
    name: 'Magic Alarm',
    lore: 'petty',
    cn: 4,
    range: 'Touch',
    target: 'Area (10m radius)',
    duration: '8 hours',
    effect: 'Ward an area with a magical alarm. Caster is mentally alerted when a creature enters.',
    overcast: '+4 hours duration per extra SL.',
  },
  {
    name: 'Shock',
    lore: 'petty',
    cn: 2,
    range: 'Touch',
    target: '1',
    duration: 'Instant',
    effect: 'Deliver an electrical shock that stuns the target for 1 round. Target may resist with a Toughness test.',
    overcast: '+1 round stun duration per extra SL.',
  },
  {
    name: 'Drop',
    lore: 'petty',
    cn: 2,
    range: '12m',
    target: '1',
    duration: 'Instant',
    effect: 'Target must pass a WP test or immediately drop a held item of caster\'s choice.',
    overcast: '+1 additional item dropped per extra SL.',
  },

  // ── Lore of Fire / Aqshy ─────────────────────────────────────
  {
    name: 'Fireball',
    lore: 'fire',
    cn: 8,
    range: '24m',
    target: 'AoE (3m radius)',
    duration: 'Instant',
    effect: 'Hurl an explosive fireball dealing 2d10 damage to all targets in the area. Flammable materials ignite.',
    overcast: '+1m radius and +2 damage per extra SL.',
  },
  {
    name: 'Flaming Sword of Rhuin',
    lore: 'fire',
    cn: 7,
    range: 'Touch',
    target: '1 weapon',
    duration: 'WPB rounds',
    effect: 'Enchant a weapon with magical fire, adding +1d10 fire damage to all attacks made with it.',
    overcast: '+2 fire damage per extra SL.',
  },
  {
    name: 'Breathe Fire',
    lore: 'fire',
    cn: 5,
    range: 'Cone (6m)',
    target: 'AoE (cone)',
    duration: 'Instant',
    effect: 'Breathe a cone of flame dealing 1d10+4 fire damage to all caught in the area.',
    overcast: '+2 damage and +2m cone length per extra SL.',
  },
  {
    name: 'Cauterise',
    lore: 'fire',
    cn: 3,
    range: 'Touch',
    target: '1',
    duration: 'Instant',
    effect: 'Seal wounds with magical fire, healing 1d10 wounds but inflicting 1 wound of pain (no armor). Target must pass a WP test or gain a Stunned condition.',
    overcast: '+2 wounds healed per extra SL.',
  },

  // ── Lore of Heavens / Azyr ────────────────────────────────────
  {
    name: 'Lightning Bolt',
    lore: 'heavens',
    cn: 8,
    range: '30m',
    target: '1',
    duration: 'Instant',
    effect: 'Strike a single target with a bolt of lightning dealing 2d10+2 damage. Metal armor provides no protection.',
    overcast: '+2 damage per extra SL.',
  },
  {
    name: 'Comet of Casandora',
    lore: 'heavens',
    cn: 10,
    range: '48m',
    target: 'AoE (5m radius)',
    duration: 'Delayed (1d3 rounds)',
    effect: 'Call down a comet from the heavens. After 1d3 rounds, it impacts dealing 3d10 damage to all in the area.',
    overcast: '+1d10 damage per 2 extra SL.',
  },
  {
    name: 'Second Sight',
    lore: 'heavens',
    cn: 4,
    range: 'Self',
    target: 'Self',
    duration: 'WPB minutes',
    effect: 'Gain the ability to detect magic auras and see through lies. +20 to Intuition and Perception tests involving deception or magical concealment.',
    overcast: '+10 bonus per extra SL.',
  },
  {
    name: 'Celestial Shield',
    lore: 'heavens',
    cn: 6,
    range: '6m',
    target: '1',
    duration: 'WPB rounds',
    effect: 'Surround target with a shimmering ward that grants +2 AP to all locations and a 50% chance to deflect ranged attacks.',
    overcast: '+1 AP per extra SL.',
  },

  // ── Lore of Metal / Chamon ────────────────────────────────────
  {
    name: 'Searing Doom',
    lore: 'metal',
    cn: 8,
    range: '24m',
    target: '1',
    duration: 'Instant',
    effect: 'Superheat metal worn or carried by target, dealing 2d10 damage. Damage is increased by +1 per AP of metal armor worn.',
    overcast: '+2 damage per extra SL.',
  },
  {
    name: 'Enchant Weapon',
    lore: 'metal',
    cn: 6,
    range: 'Touch',
    target: '1 weapon',
    duration: 'WPB rounds',
    effect: 'Make a weapon magical, allowing it to harm creatures immune to mundane weapons. Adds +1 damage.',
    overcast: '+1 damage per extra SL.',
  },
  {
    name: 'Transmutation of Lead',
    lore: 'metal',
    cn: 5,
    range: '18m',
    target: '1',
    duration: 'WPB rounds',
    effect: 'Weaken enemy armor, reducing all AP by 2. Metal armor is reduced by an additional 1.',
    overcast: '+1 AP reduction per extra SL.',
  },
  {
    name: 'Guard of Steel',
    lore: 'metal',
    cn: 7,
    range: 'Self',
    target: 'Self',
    duration: 'WPB rounds',
    effect: 'Animate nearby metal objects to orbit and defend the caster. Grants +3 AP and attackers in melee take 1d10 damage.',
    overcast: '+1 AP and +2 counter-damage per extra SL.',
  },

  // ── Lore of Beasts / Ghur ────────────────────────────────────
  {
    name: 'Amber Spear',
    lore: 'beasts',
    cn: 7,
    range: '30m',
    target: '1',
    duration: 'Instant',
    effect: 'Conjure and hurl a spear of solidified amber magic dealing 2d10 damage. Ignores 2 AP.',
    overcast: '+2 damage and +1 AP ignored per extra SL.',
  },
  {
    name: 'Beast Form',
    lore: 'beasts',
    cn: 8,
    range: 'Self',
    target: 'Self',
    duration: 'WPB minutes',
    effect: 'Partially transform into a beast, gaining +20 S, +10 T, natural weapons (1d10+SB damage), and +2 Movement.',
    overcast: '+5 S and +1 Movement per extra SL.',
  },
  {
    name: 'Wild Heart',
    lore: 'beasts',
    cn: 5,
    range: '18m',
    target: '1 animal',
    duration: 'WPB minutes',
    effect: 'Control or calm a single animal. The animal follows simple commands and will not attack the caster or allies.',
    overcast: '+1 additional animal per extra SL.',
  },
  {
    name: 'Flock of Doom',
    lore: 'beasts',
    cn: 6,
    range: '24m',
    target: 'AoE (4m radius)',
    duration: 'WPB rounds',
    effect: 'Summon a swarm of spectral birds that deal 1d10+3 damage per round to all in the area.',
    overcast: '+1m radius per extra SL.',
  },

  // ── Lore of Life / Ghyran ────────────────────────────────────
  {
    name: 'Heal',
    lore: 'life',
    cn: 6,
    range: 'Touch',
    target: '1',
    duration: 'Instant',
    effect: 'Restore 1d10+SL wounds to the target. Can also cure a single disease or poison.',
    overcast: '+3 wounds healed per extra SL.',
  },
  {
    name: 'Shield of Thorns',
    lore: 'life',
    cn: 7,
    range: '6m',
    target: '1',
    duration: 'WPB rounds',
    effect: 'Surround target with a barrier of magical thorns granting +2 AP. Attackers in melee take 1d10 damage.',
    overcast: '+1 AP and +2 thorn damage per extra SL.',
  },
  {
    name: 'Earthblood',
    lore: 'life',
    cn: 4,
    range: 'Touch',
    target: '1',
    duration: 'WPB rounds',
    effect: 'Grant regeneration, healing 1 wound at the start of each of the target\'s turns.',
    overcast: '+1 wound regenerated per turn per extra SL.',
  },
  {
    name: 'Master of the Wilds',
    lore: 'life',
    cn: 8,
    range: '30m',
    target: 'AoE (10m radius)',
    duration: 'WPB rounds',
    effect: 'Control plant growth in the area. Plants entangle enemies (halved movement, -10 to physical tests) and provide cover.',
    overcast: '+5m radius per extra SL.',
  },

  // ── Lore of Light / Hysh ─────────────────────────────────────
  {
    name: 'Banishment',
    lore: 'light',
    cn: 9,
    range: '12m',
    target: '1',
    duration: 'Instant',
    effect: 'Deal 3d10 damage to a daemon or undead creature and force it to pass a Hard (-20) WP test or be banished/destroyed.',
    overcast: '+1d10 damage per extra SL.',
  },
  {
    name: 'Blinding Light',
    lore: 'light',
    cn: 5,
    range: 'Self',
    target: 'AoE (8m radius)',
    duration: 'Instant',
    effect: 'Emit a blinding flash. All enemies in range must pass an Agility test or be Blinded for 1d10 rounds.',
    overcast: '+2m radius per extra SL.',
  },
  {
    name: 'Net of Amyntok',
    lore: 'light',
    cn: 7,
    range: '18m',
    target: '1',
    duration: 'WPB rounds',
    effect: 'Trap target in a magical net of light. Target is Entangled and takes 1d10 damage each time it attempts to break free.',
    overcast: '+1 additional target per extra SL.',
  },
  {
    name: 'Radiant Aura',
    lore: 'light',
    cn: 6,
    range: 'Self',
    target: 'AoE (6m radius)',
    duration: 'WPB rounds',
    effect: 'Project a protective aura that grants +20 to resist dark magic and Corruption, and +2 AP against attacks from daemons and undead.',
    overcast: '+2m radius and +10 resistance per extra SL.',
  },

  // ── Lore of Death / Shyish ────────────────────────────────────
  {
    name: 'Spirit Leech',
    lore: 'death',
    cn: 7,
    range: '24m',
    target: '1',
    duration: 'Instant',
    effect: 'Engage in a contest of WP vs target\'s WP. Target takes 1 wound per SL of difference, ignoring armor.',
    overcast: '+1 additional wound per extra SL.',
  },
  {
    name: 'Doom and Darkness',
    lore: 'death',
    cn: 6,
    range: '24m',
    target: 'AoE (6m radius)',
    duration: 'WPB rounds',
    effect: 'Fill targets with supernatural dread. All enemies in area must pass a WP test or gain a Broken condition and flee.',
    overcast: '+2m radius per extra SL.',
  },
  {
    name: 'Purple Sun of Xereus',
    lore: 'death',
    cn: 12,
    range: '36m',
    target: 'AoE (moving vortex, 5m radius)',
    duration: 'WPB rounds',
    effect: 'Conjure a devastating vortex of death magic that moves 1d10m in a random direction each round. All touched must pass a Hard (-20) Toughness test or die instantly. Even on success, take 3d10 wounds.',
    overcast: '+1m radius and +5 to difficulty per extra SL.',
  },
  {
    name: 'Life Drain',
    lore: 'death',
    cn: 5,
    range: '18m',
    target: '1',
    duration: 'Instant',
    effect: 'Steal life force from target, dealing 1d10+4 damage (no armor) and healing the caster for the same amount.',
    overcast: '+2 damage and healing per extra SL.',
  },

  // ── Lore of Shadow / Ulgu ────────────────────────────────────
  {
    name: 'Shadowstep',
    lore: 'shadow',
    cn: 5,
    range: 'Self',
    target: 'Self',
    duration: 'Instant',
    effect: 'Teleport up to 12m to a visible location within shadow or darkness.',
    overcast: '+6m range per extra SL.',
  },
  {
    name: 'Pall of Darkness',
    lore: 'shadow',
    cn: 7,
    range: '24m',
    target: 'AoE (8m radius)',
    duration: 'WPB rounds',
    effect: 'Plunge an area into supernatural darkness. All within are Blinded unless they have magical sight. Ulgu casters can see normally.',
    overcast: '+2m radius per extra SL.',
  },
  {
    name: 'Mindrazor',
    lore: 'shadow',
    cn: 8,
    range: 'Touch',
    target: '1 weapon',
    duration: 'WPB rounds',
    effect: 'Enchant a weapon so its damage is based on the wielder\'s WP Bonus instead of S Bonus.',
    overcast: '+1 additional weapon per extra SL.',
  },
  {
    name: 'Smoke and Mirrors',
    lore: 'shadow',
    cn: 4,
    range: 'Self',
    target: 'Self',
    duration: 'WPB rounds',
    effect: 'Create 1d3 illusory duplicates of yourself. Each duplicate absorbs one attack before vanishing. Enemies must guess which is real.',
    overcast: '+1 duplicate per extra SL.',
  },
];

export const MISCAST_TABLE = [
  // ── Minor (1-4) ──────────────────────────────────────────────
  {
    severity: 1,
    name: 'Witchsign',
    effect: 'The caster\'s eyes glow with an eerie light for several minutes. Purely cosmetic but very noticeable.',
    mechanicalEffect: 'No mechanical effect.',
  },
  {
    severity: 2,
    name: 'Magical Feedback',
    effect: 'Aethyric energy snaps back into the caster, causing a jolt of pain.',
    mechanicalEffect: 'Caster takes 1 wound, no armor.',
  },
  {
    severity: 3,
    name: 'Sickened',
    effect: 'A wave of nausea washes over the caster as the winds recoil.',
    mechanicalEffect: '-10 to all tests for 1 round.',
  },
  {
    severity: 4,
    name: 'Aethyric Discharge',
    effect: 'A thunderous bang echoes outward from the caster, alerting everything nearby.',
    mechanicalEffect: 'All nearby Perception tests auto-succeed to detect the caster.',
  },

  // ── Moderate (5-8) ───────────────────────────────────────────
  {
    severity: 5,
    name: 'Uncontrolled Power',
    effect: 'The spell works but the winds resist the caster\'s control going forward.',
    mechanicalEffect: 'Spell works but costs double CN next time it is cast.',
  },
  {
    severity: 6,
    name: 'Psychic Backlash',
    effect: 'A psychic shockwave slams the caster\'s mind, leaving them momentarily incapacitated.',
    mechanicalEffect: 'Caster is stunned for 1 round.',
  },
  {
    severity: 7,
    name: 'Wild Magic',
    effect: 'The spell spirals out of control and strikes an unintended target.',
    mechanicalEffect: 'Spell targets a random creature within range instead of the intended target.',
  },
  {
    severity: 8,
    name: 'Hedge Magic',
    effect: 'The spell functions but with bizarre and unintended cosmetic side effects.',
    mechanicalEffect: 'Spell works but with unintended cosmetic side effect (GM choice).',
  },

  // ── Major (9-12) ─────────────────────────────────────────────
  {
    severity: 9,
    name: 'Aethyric Shock',
    effect: 'Raw aethyric energy courses through the caster, searing body and soul.',
    mechanicalEffect: 'Caster takes 1d10 wounds, no armor.',
  },
  {
    severity: 10,
    name: 'Magical Burnout',
    effect: 'The caster\'s connection to the winds is temporarily severed.',
    mechanicalEffect: 'Cannot cast spells for 1d10 rounds.',
  },
  {
    severity: 11,
    name: 'Chaotic Manifestation',
    effect: 'The winds of chaos briefly reshape the caster\'s body in disturbing ways.',
    mechanicalEffect: 'Random minor mutation (temporary, 1d10 hours).',
  },
  {
    severity: 12,
    name: 'Wyrdfire',
    effect: 'Unnatural flames erupt from the caster, engulfing everything nearby.',
    mechanicalEffect: 'Caster and all within 3m take 1d10 fire damage.',
  },

  // ── Severe (13-16) ───────────────────────────────────────────
  {
    severity: 13,
    name: 'Daemonic Whispers',
    effect: 'Dark voices claw at the edges of the caster\'s mind, tempting corruption.',
    mechanicalEffect: 'Must pass Hard (-20) WP test or gain 1 Corruption Point.',
  },
  {
    severity: 14,
    name: 'Reality Tear',
    effect: 'The fabric of reality rips momentarily, unleashing chaotic forces.',
    mechanicalEffect: 'Random chaotic effect in area (GM narrates).',
  },
  {
    severity: 15,
    name: 'Aethyric Overload',
    effect: 'An overwhelming torrent of aethyric energy devastates the caster.',
    mechanicalEffect: 'Caster takes 2d10 wounds, armor ignored.',
  },
  {
    severity: 16,
    name: 'Magical Tempest',
    effect: 'A localized magical storm erupts around the caster, lashing out with arcane fury.',
    mechanicalEffect: 'Storm-like effects in 10m radius, all tests at -20 for 1 minute.',
  },

  // ── Catastrophic (17-20) ─────────────────────────────────────
  {
    severity: 17,
    name: 'Warp Rift',
    effect: 'A rift to the Realm of Chaos tears open briefly, and something steps through.',
    mechanicalEffect: 'A minor daemon is summoned, hostile to all.',
  },
  {
    severity: 18,
    name: 'Total Magical Burnout',
    effect: 'The caster\'s connection to the winds is completely burned away.',
    mechanicalEffect: 'Lose ability to cast spells for 24 hours.',
  },
  {
    severity: 19,
    name: 'Corruption Surge',
    effect: 'Dark energy floods the caster\'s very soul, leaving an indelible mark of chaos.',
    mechanicalEffect: 'Gain 1d10 Corruption Points.',
  },
  {
    severity: 20,
    name: 'Daemonic Possession',
    effect: 'A daemon seizes the opportunity to claim the caster\'s body as its vessel.',
    mechanicalEffect: 'Must pass Very Hard (-30) WP test or be possessed (campaign-ending for character).',
  },
];

/**
 * Filter spells by their lore.
 * @param {string} lore - Lore identifier (e.g. 'fire', 'petty', 'shadow')
 * @returns {Array} Matching spells
 */
export function getSpellsByLore(lore) {
  return SPELLS.filter((spell) => spell.lore === lore);
}

/**
 * Look up or randomly roll a miscast result.
 * @param {number} [severity] - Specific severity 1-20, or omit for random 2d10 roll
 * @returns {object} Miscast table entry
 */
export function rollMiscast(severity) {
  if (severity == null) {
    const d10a = Math.floor(Math.random() * 10) + 1;
    const d10b = Math.floor(Math.random() * 10) + 1;
    severity = d10a + d10b;
  }
  severity = Math.max(1, Math.min(20, severity));
  return MISCAST_TABLE[severity - 1];
}

/**
 * Calculate the channelling bonus for sustained casting.
 * @param {number} wpBonus - Willpower Bonus (WP / 10 floored)
 * @param {number} advances - Channelling skill advances
 * @returns {number} Total channelling SL bonus
 */
export function calculateChannelBonus(wpBonus, advances) {
  return wpBonus + Math.floor(advances / 5);
}
