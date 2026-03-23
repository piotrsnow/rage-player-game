/**
 * WFRP 4th Edition–style magic reference data (winds, spells, miscasts, channelling).
 * For prompts and tooling; GM adjudication applies.
 */

export const WINDS_OF_MAGIC = {
  aqshy: {
    key: 'aqshy',
    name: 'Aqshy',
    title: 'Lore of Fire',
    color: 'Red / orange',
    characteristic: 'wp',
    description: 'Wind of passion, heat, and destructive change.',
  },
  azyr: {
    key: 'azyr',
    name: 'Azyr',
    title: 'Lore of the Heavens',
    color: 'Blue / indigo',
    characteristic: 'int',
    description: 'Wind of omens, lightning, and the far sky.',
  },
  chamon: {
    key: 'chamon',
    name: 'Chamon',
    title: 'Lore of Metal',
    color: 'Gold / yellow',
    characteristic: 'int',
    description: 'Wind of alchemy, transmutation, and craft.',
  },
  ghur: {
    key: 'ghur',
    name: 'Ghur',
    title: 'Lore of Beasts',
    color: 'Amber / brown',
    characteristic: 'wp',
    description: 'Wind of instinct, tooth, and wild places.',
  },
  ghyran: {
    key: 'ghyran',
    name: 'Ghyran',
    title: 'Lore of Life',
    color: 'Green',
    characteristic: 'fel',
    description: 'Wind of growth, healing, and the cycle of living things.',
  },
  hysh: {
    key: 'hysh',
    name: 'Hysh',
    title: 'Lore of Light',
    color: 'White / brilliant',
    characteristic: 'int',
    description: 'Wind of truth, radiance, and revealing clarity.',
  },
  shyish: {
    key: 'shyish',
    name: 'Shyish',
    title: 'Lore of Death',
    color: 'Purple / grey',
    characteristic: 'wp',
    description: 'Wind of endings, souls, and the passage beyond.',
  },
  ulgu: {
    key: 'ulgu',
    name: 'Ulgu',
    title: 'Lore of Shadow',
    color: 'Grey / violet mist',
    characteristic: 'fel',
    description: 'Wind of fear, concealment, and beguiling gloom.',
  },
};

export const PETTY_SPELLS = [
  {
    name: 'Dart',
    lore: 'petty',
    cn: 0,
    range: '8 yards',
    duration: 'Instant',
    description: 'A flick of magical force, barely more than a cantrip.',
    effect: 'Target suffers 1 Damage (ignore Armour); +0 SL does not increase damage unless GM rules otherwise.',
  },
  {
    name: 'Light',
    lore: 'petty',
    cn: 0,
    range: 'Touch',
    duration: 'Willpower Bonus minutes',
    description: 'A small orb or torch-bright glow clings to an object or the tip of a finger.',
    effect: 'Illuminates as a lantern; can be dismissed as a free action.',
  },
  {
    name: 'Sounds',
    lore: 'petty',
    cn: 1,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'You conjure a brief noise: whisper, footstep, or distant shout.',
    effect: 'Opposed Intuition test to locate source if listeners are suspicious; cannot deal damage.',
  },
  {
    name: 'Marsh Lights',
    lore: 'petty',
    cn: 1,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'Will-o’-wisp motes drift, misleading the eye.',
    effect: 'Impose −10 to Track or visual Perception tests to follow a specific path in the area.',
  },
  {
    name: 'Sleep',
    lore: 'petty',
    cn: 2,
    range: 'Touch',
    duration: 'Willpower Bonus minutes',
    description: 'A gentle charm that eases a willing or unwary subject toward slumber.',
    effect: 'Target must be living; opposed Cool vs your Casting or falls Unconscious (light sleep, normal noise wakes).',
  },
];

export const SPELLS = [
  // --- Aqshy (Fire) ---
  {
    name: 'Bolt',
    lore: 'aqshy',
    cn: 3,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'A streak of flame lances toward your foe.',
    effect: 'Ranged spell attack; on success target takes Damage +3 + SL, Flammable catches fire on +2 SL or more (GM).',
  },
  {
    name: 'Blazing Bolt',
    lore: 'aqshy',
    cn: 6,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'A thicker jet of fire that splashes on impact.',
    effect: 'As Bolt but Damage +5 + SL; may hit adjacent target at −2 SL (GM).',
  },
  {
    name: 'Firewall',
    lore: 'aqshy',
    cn: 7,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'A curtain of heat and embers blocks passage.',
    effect: 'Creates a line ~6 yards; crossing deals Damage +3; treats as Difficult Terrain for visibility.',
  },
  {
    name: 'Crown of Fire',
    lore: 'aqshy',
    cn: 9,
    range: 'Touch',
    duration: 'Willpower Bonus minutes',
    description: 'Wreath your ally’s head in controlled flame that does not burn them.',
    effect: 'Ally gains Fear 1; melee attackers suffer Damage +1 (fire) once per round when they hit in melee.',
  },
  // --- Azyr (Heavens) ---
  {
    name: 'Forked Lightning',
    lore: 'azyr',
    cn: 4,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'Sky-magic channels a crackling bolt.',
    effect: 'Single target Damage +4 + SL; metallic armour may worsen outcome (+1 Damage, GM).',
  },
  {
    name: 'Omen',
    lore: 'azyr',
    cn: 5,
    range: 'Self',
    duration: 'Instant',
    description: 'You read the next few heartbeats of fate.',
    effect: 'Gain +1 Fortune Die on next test you make before end of next round, or allow one ally same benefit.',
  },
  {
    name: 'Wind Blast',
    lore: 'azyr',
    cn: 7,
    range: 'Cone Willpower yards',
    duration: 'Instant',
    description: 'A gust tears across the battlefield.',
    effect: 'All in template opposed Athletics vs Casting or Prone; Size +20 or more immune (GM).',
  },
  {
    name: 'Storm of Shemtek',
    lore: 'azyr',
    cn: 10,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'Localized thunderheads unleash repeated strikes.',
    effect: 'Each round pick one target in range: Damage +3 + SL; targets in open gain −10 Stealth.',
  },
  // --- Chamon (Metal) ---
  {
    name: 'Armour of Tin',
    lore: 'chamon',
    cn: 3,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'The enemy’s harness warps and dulls.',
    effect: 'Target wearing metal armour suffers −10 to Agility tests and −1 Armour point (min 0) while active.',
  },
  {
    name: 'Transmutation of the Unstable Metal',
    lore: 'chamon',
    cn: 5,
    range: 'Touch',
    duration: 'Willpower hours',
    description: 'You alter a small metal object’s shape or alloy subtly.',
    effect: 'Repair a broken simple lock or tool on +2 SL; cannot create wealth or weapons from nothing.',
  },
  {
    name: 'Gehenna’s Golden Globe',
    lore: 'chamon',
    cn: 7,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'A sphere of molten metal splashes outward.',
    effect: 'All in Willpower-yard radius take Damage +2 + SL; flammable ignited on +0 SL.',
  },
  {
    name: 'Bane of Blade',
    lore: 'chamon',
    cn: 8,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'Enemy weapons tremble and notch against their users.',
    effect: 'Target weapon gains Damaging only against its wielder (GM); or −10 WS while wielding that weapon.',
  },
  // --- Ghur (Beasts) ---
  {
    name: 'Beast Mind',
    lore: 'ghur',
    cn: 4,
    range: 'Willpower yards',
    duration: 'Willpower Bonus minutes',
    description: 'You share instincts with a mundane beast.',
    effect: 'Simple commands (come, stay, flee); opposed Intelligence vs your Casting for hostile animals.',
  },
  {
    name: 'Crows Feet',
    lore: 'ghur',
    cn: 5,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'Carrion birds descend in a shrieking cloud.',
    effect: 'Target suffers Blind condition for Willpower Bonus rounds (opposed Dodge halves duration).',
  },
  {
    name: 'Beast of Burden',
    lore: 'ghur',
    cn: 6,
    range: 'Touch',
    duration: 'Willpower hours',
    description: 'Your steed or pack animal gains unnatural endurance.',
    effect: 'Animal ignores first level of Fatigue from travel this journey; +20 Athletics for hauling.',
  },
  {
    name: 'Form of the Wolf',
    lore: 'ghur',
    cn: 9,
    range: 'Self',
    duration: 'Willpower Bonus minutes',
    description: 'You take on lupine aspect — not a full monster, but enough to terrify.',
    effect: 'Gain +20 Athletics, +10 WS, Bite +SB Damage; cannot cast other spells in this form (GM).',
  },
  // --- Ghyran (Life) ---
  {
    name: 'Earth’s Blessing',
    lore: 'ghyran',
    cn: 3,
    range: 'Touch',
    duration: 'Instant',
    description: 'Minor wounds knit under verdant warmth.',
    effect: 'Heal 1d10 + SL wounds on one target; cannot raise above max wounds.',
  },
  {
    name: 'Barkskin',
    lore: 'ghyran',
    cn: 5,
    range: 'Touch',
    duration: 'Willpower Bonus minutes',
    description: 'Skin roughens like old oak.',
    effect: 'Target gains +1 Armour all locations; −10 Agility while active.',
  },
  {
    name: 'Spring Bloom',
    lore: 'ghyran',
    cn: 6,
    range: 'Willpower yards',
    duration: 'Willpower Bonus days',
    description: 'Crops or forage in an area grow as if well-tended.',
    effect: 'Enough food for Willpower persons for one day per +2 SL; reversed in blighted regions (GM).',
  },
  {
    name: 'Heart of the Oak',
    lore: 'ghyran',
    cn: 8,
    range: 'Touch',
    duration: 'Willpower Bonus rounds',
    description: 'The subject’s blood slows; mortal injury is deferred.',
    effect: 'Target ignores Bleeding while spell lasts; when it ends, apply all withheld Bleeding at once.',
  },
  // --- Hysh (Light) ---
  {
    name: 'Radiant Gaze',
    lore: 'hysh',
    cn: 3,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'Your eyes shine with unbearable clarity.',
    effect: 'Target suffers −10 to WS/BS from glare; Undead/Daemons in arc may suffer Fear 1 (GM).',
  },
  {
    name: 'Hysh’s Aegis',
    lore: 'hysh',
    cn: 5,
    range: 'Touch',
    duration: 'Willpower Bonus minutes',
    description: 'A halo wards against fell powers.',
    effect: 'Target gains +20 to tests to resist magic or corruption from Chaotic sources (GM).',
  },
  {
    name: 'Purge',
    lore: 'hysh',
    cn: 7,
    range: 'Touch',
    duration: 'Instant',
    description: 'Pure light burns taint from flesh or object.',
    effect: 'Ends one disease or poison with CN ≤ your SL + 4; deals 1 Damage to possessor if object is Chaotic.',
  },
  {
    name: 'Searing Sun',
    lore: 'hysh',
    cn: 10,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'Daylight floods a sphere, scouring shadow-things.',
    effect: 'All Undead/Dark creatures in radius take Damage +2 + SL; Stealth in area impossible this round.',
  },
  // --- Shyish (Death) ---
  {
    name: 'Soul Steal',
    lore: 'shyish',
    cn: 4,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'You tug a thread of vitality from the dying.',
    effect: 'Target at 0 wounds or Unconscious loses 1 Fortune point (GM); you restore 1 wound (once per day per target).',
  },
  {
    name: 'Reaping Scythe',
    lore: 'shyish',
    cn: 6,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'An invisible blade of finality sweeps through the foe.',
    effect: 'Damage +4 + SL; +2 Damage vs targets already Wounded.',
  },
  {
    name: 'Speak with Dead',
    lore: 'shyish',
    cn: 7,
    range: 'Touch',
    duration: 'Willpower Bonus minutes',
    description: 'A corpse answers one honest question per SL, often cryptically.',
    effect: 'Opposed Will Power if spirit unwilling; lies possible if entity is malicious (GM).',
  },
  {
    name: 'Purple Sun of Shyish',
    lore: 'shyish',
    cn: 10,
    range: 'Willpower yards',
    duration: 'Instant',
    description: 'A blot of absolute entropy hungers for life.',
    effect: 'All living in large template suffer Damage +5 + SL; miscast on this spell is always at least Major (GM).',
  },
  // --- Ulgu (Shadow) ---
  {
    name: 'Shadowcloak',
    lore: 'ulgu',
    cn: 3,
    range: 'Self',
    duration: 'Willpower Bonus minutes',
    description: 'Edges blur; you are hard to fix with the eye.',
    effect: '+20 Stealth; attacks against you suffer −10 if lighting is dim.',
  },
  {
    name: 'Shroud of Invisibility',
    lore: 'ulgu',
    cn: 6,
    range: 'Touch',
    duration: 'Willpower Bonus minutes',
    description: 'Subject fades from sight until they strike or cast loudly.',
    effect: 'Treat as Invisible until broken; opposed Intuition at −20 to spot movement.',
  },
  {
    name: 'Pall of Fear',
    lore: 'ulgu',
    cn: 7,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'Dread crawls from every corner.',
    effect: 'All in radius opposed Cool vs Casting or gain Broken condition.',
  },
  {
    name: 'Grey Anguish',
    lore: 'ulgu',
    cn: 9,
    range: 'Willpower yards',
    duration: 'Willpower Bonus rounds',
    description: 'Hope leaches away; colours drain to ash.',
    effect: 'Enemies in area cannot spend Fortune points; allies suffer Fatigue 1 when entering (GM).',
  },
];

export const MISCAST_TABLE = [
  { range: [1, 5], severity: 'minor', description: 'Whiff of ozone; hair stands on end.', mechanicalEffect: 'Gain 1 Fatigue.' },
  { range: [6, 10], severity: 'minor', description: 'Nosebleed and ringing ears.', mechanicalEffect: '1 wound, ignore Armour; −10 Hearing tests for 1 hour.' },
  { range: [11, 15], severity: 'minor', description: 'Minor warp flicker — tools rattle.', mechanicalEffect: 'Drop held item unless passed Routine (+20) Dexterity test.' },
  { range: [16, 20], severity: 'minor', description: 'Spectral laughter only you hear.', mechanicalEffect: 'Stunned condition for 1 round.' },
  { range: [21, 25], severity: 'moderate', description: 'Chills and fever grip you.', mechanicalEffect: '2 wounds; gain Fatigued condition until next rest.' },
  { range: [26, 30], severity: 'moderate', description: 'Ground cracks; small objects float an inch.', mechanicalEffect: 'Prone; allies within 2 yards gain Stunned 1 round.' },
  { range: [31, 35], severity: 'moderate', description: 'Your shadow moves wrong for one heartbeat.', mechanicalEffect: 'Fear 1; Immune to Fear from this miscast on success.' },
  { range: [36, 40], severity: 'moderate', description: 'Winds of magic lash your mind.', mechanicalEffect: 'Gain 2 Corruption points (or 1 if GM uses lighter table).' },
  { range: [41, 45], severity: 'moderate', description: 'Spell discharges into nearest ally.', mechanicalEffect: 'Random ally within Willpower yards takes spell’s base effect at −2 SL (GM picks if ambiguous).' },
  { range: [46, 50], severity: 'moderate', description: 'Icon or holy symbol tarnishes black.', mechanicalEffect: '−10 Fel with faithful of Sigmar until cleansed (d66 hours).' },
  { range: [51, 55], severity: 'moderate', description: 'Voices whisper true names.', mechanicalEffect: 'Lose 1 Fortune point; if none, gain 1 Stress.' },
  { range: [56, 60], severity: 'moderate', description: 'Local animals flee or attack.', mechanicalEffect: 'All mundane beasts in 1d10×10 yards hostile or panicked until scene end.' },
  { range: [61, 65], severity: 'major', description: 'Aethyric burn scours your hands.', mechanicalEffect: '3 wounds to arms location; −10 Dexterity until healed.' },
  { range: [66, 70], severity: 'major', description: 'Brief possession — you speak in another voice.', mechanicalEffect: 'Uncontrollable action (GM); 1d10 minutes; +1 Corruption.' },
  { range: [71, 75], severity: 'major', description: 'Veil thins; a minor daemonic annoyance manifests.', mechanicalEffect: 'Imp or equivalent nuisance for 1d10 rounds; +2 Corruption if not banished.' },
  { range: [76, 80], severity: 'major', description: 'All metal within yards heats red.', mechanicalEffect: 'Anyone touching metal takes 1 Damage per round; fires start on flammables.' },
  { range: [81, 85], severity: 'major', description: 'You age visibly — hair greys, skin creases.', mechanicalEffect: '−5 Fel permanently or until Greater Restoration-style magic (GM); +3 Corruption.' },
  { range: [86, 90], severity: 'major', description: 'Wild surge duplicates spell on random target.', mechanicalEffect: 'Resolve spell again vs random legal target including self; +2 SL for miscast side effects only.' },
  { range: [91, 93], severity: 'catastrophic', description: 'Explosion of raw magic obliterates the chamber’s calm.', mechanicalEffect: 'Damage +8 in Willpower-yard radius; caster takes half; structures Damaged (GM).' },
  { range: [94, 96], severity: 'catastrophic', description: 'Daemonhost breach — something pushes through.', mechanicalEffect: 'Summon hostile entity (threat high); +5 Corruption to caster; party gains 1 Doom (GM).' },
  { range: [97, 98], severity: 'catastrophic', description: 'Soul tear; body lives, spirit frays.', mechanicalEffect: 'Death roll at −20 or gain Unconscious 1d10 hours and 5 Corruption.' },
  { range: [99, 100], severity: 'catastrophic', description: 'Total collapse of control — the Winds consume you.', mechanicalEffect: 'Caster slain or GM fiat survival at cost of permanent mutation, madness, or both; +10 Corruption to survivors in touch range (GM).' },
];

export const CHANNELLING_MODIFIERS = {
  calmEnvironment: { label: 'Calm, prepared ritual space', modifier: 10 },
  battlefield: { label: 'Active combat or panic nearby', modifier: -10 },
  wounded: { label: 'Caster is seriously wounded (≤ half wounds)', modifier: -10 },
  criticalWounds: { label: 'Caster is critically wounded', modifier: -20 },
  strongWinds: { label: 'Strong warpstone, ritual site, or geomantic focus', modifier: 10 },
  opposedWinds: { label: 'Dominant opposing Wind (GM)', modifier: -20 },
  armourPenalty: { label: 'Metal armour interfering (optional rule)', modifier: -10 },
  focus: { label: 'Dedicated magical focus or staff', modifier: 10 },
  distracted: { label: 'Distracted (talking, riding rough)', modifier: -10 },
  darkMagic: { label: 'Channelling Dhar or mixed Winds', modifier: -10 },
};

const SPELL_INDEX = () => {
  const byName = new Map();
  for (const s of SPELLS) byName.set(normalizeName(s.name), s);
  for (const s of PETTY_SPELLS) byName.set(normalizeName(s.name), s);
  return byName;
};

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function normalizeLoreKey(lore) {
  const k = String(lore || '')
    .trim()
    .toLowerCase();
  if (WINDS_OF_MAGIC[k]) return k;
  const found = Object.keys(WINDS_OF_MAGIC).find((w) => WINDS_OF_MAGIC[w].name.toLowerCase() === k);
  return found || k;
}

/** All spells (not petty) for a Lore key: aqshy, azyr, … */
export function getSpellsByLore(lore) {
  const key = normalizeLoreKey(lore);
  return SPELLS.filter((s) => s.lore === key);
}

/**
 * Lore spells with CN ≤ maxCn (petty spells use getPettySpellsByMaxCn or filter PETTY_SPELLS).
 */
export function getSpellByCn(maxCn) {
  const cap = Number(maxCn);
  if (Number.isNaN(cap)) return [];
  return SPELLS.filter((s) => s.cn <= cap);
}

/**
 * @param {Array<string|object>} characterSpells - spell names or { name, cn?, lore? } objects
 * @returns {string} Compact block for LLM / prompt context
 */
export function formatMagicForPrompt(characterSpells) {
  if (!characterSpells || !characterSpells.length) {
    return 'Known spells: none listed.';
  }
  const idx = SPELL_INDEX();
  const lines = characterSpells.map((entry) => {
    if (typeof entry === 'string') {
      const spell = idx.get(normalizeName(entry));
      if (!spell) return `- ${entry} (details not in core list)`;
      return formatSpellLine(spell);
    }
    const name = entry.name || entry.spell || 'Unknown';
    const spell = idx.get(normalizeName(name)) || entry;
    return formatSpellLine(spell);
  });
  return ['Known spells:', ...lines].join('\n');
}

function formatSpellLine(spell) {
  const loreLabel = spell.lore === 'petty' ? 'Petty' : WINDS_OF_MAGIC[spell.lore]?.title || spell.lore;
  const cn = spell.cn != null ? `CN ${spell.cn}` : 'CN ?';
  const effect = spell.effect ? ` — ${spell.effect}` : '';
  return `- ${spell.name} (${loreLabel}, ${cn}, ${spell.range || '?'}, ${spell.duration || '?'})${effect}`;
}
