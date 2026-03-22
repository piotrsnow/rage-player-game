// WFRP 4th Edition Data Definitions

export const CHARACTERISTIC_NAMES = {
  ws: 'Weapon Skill',
  bs: 'Ballistic Skill',
  s: 'Strength',
  t: 'Toughness',
  i: 'Initiative',
  ag: 'Agility',
  dex: 'Dexterity',
  int: 'Intelligence',
  wp: 'Willpower',
  fel: 'Fellowship',
};

export const CHARACTERISTIC_SHORT = {
  ws: 'WS', bs: 'BS', s: 'S', t: 'T', i: 'I',
  ag: 'Ag', dex: 'Dex', int: 'Int', wp: 'WP', fel: 'Fel',
};

export const CHARACTERISTIC_KEYS = ['ws', 'bs', 's', 't', 'i', 'ag', 'dex', 'int', 'wp', 'fel'];

// Species definitions: base modifier is added to 2d10 for each characteristic
export const SPECIES = {
  Human: {
    name: 'Human',
    characteristics: { ws: 20, bs: 20, s: 20, t: 20, i: 20, ag: 20, dex: 20, int: 20, wp: 20, fel: 20 },
    fate: 2, resilience: 1, extraPoints: 3, movement: 4,
    skills: ['Animal Care', 'Charm', 'Cool', 'Evaluate', 'Gossip', 'Haggle', 'Language (Reikspiel)', 'Leadership', 'Lore (Reikland)', 'Melee (Basic)', 'Ranged (Bow)'],
    talents: ['Doomed', 'Savvy or Suave'],
  },
  Halfling: {
    name: 'Halfling',
    characteristics: { ws: 10, bs: 30, s: 10, t: 20, i: 20, ag: 20, dex: 20, int: 20, wp: 30, fel: 30 },
    fate: 0, resilience: 2, extraPoints: 3, movement: 3,
    skills: ['Charm', 'Consume Alcohol', 'Dodge', 'Gamble', 'Haggle', 'Intuition', 'Language (Halfling)', 'Language (Reikspiel)', 'Lore (Reikland)', 'Perception', 'Stealth (Any)'],
    talents: ['Night Vision', 'Resistance (Chaos)', 'Small'],
  },
  Dwarf: {
    name: 'Dwarf',
    characteristics: { ws: 30, bs: 20, s: 20, t: 30, i: 20, ag: 10, dex: 30, int: 20, wp: 40, fel: 10 },
    fate: 0, resilience: 2, extraPoints: 2, movement: 3,
    skills: ['Consume Alcohol', 'Cool', 'Endurance', 'Entertain (Storytelling)', 'Evaluate', 'Intimidate', 'Language (Khazalid)', 'Language (Reikspiel)', 'Lore (Dwarfs)', 'Melee (Basic)', 'Trade (Any)'],
    talents: ['Magic Resistance', 'Night Vision', 'Read/Write', 'Resolute', 'Sturdy'],
  },
  'High Elf': {
    name: 'High Elf',
    characteristics: { ws: 30, bs: 30, s: 20, t: 20, i: 40, ag: 30, dex: 30, int: 30, wp: 30, fel: 20 },
    fate: 0, resilience: 0, extraPoints: 2, movement: 5,
    skills: ['Cool', 'Entertain (Sing)', 'Evaluate', 'Language (Eltharin)', 'Language (Reikspiel)', 'Leadership', 'Melee (Basic)', 'Navigation', 'Perception', 'Play (Any)', 'Ranged (Bow)'],
    talents: ['Acute Sense (Sight)', 'Coolheaded or Savvy', 'Night Vision', 'Second Sight or Sixth Sense', 'Read/Write'],
  },
  'Wood Elf': {
    name: 'Wood Elf',
    characteristics: { ws: 30, bs: 30, s: 20, t: 20, i: 40, ag: 30, dex: 30, int: 30, wp: 30, fel: 20 },
    fate: 0, resilience: 0, extraPoints: 2, movement: 5,
    skills: ['Athletics', 'Climb', 'Endurance', 'Entertain (Sing)', 'Intimidate', 'Language (Eltharin)', 'Language (Reikspiel)', 'Melee (Basic)', 'Outdoor Survival', 'Perception', 'Ranged (Bow)', 'Stealth (Rural)'],
    talents: ['Acute Sense (Sight)', 'Hardy or Second Sight', 'Night Vision', 'Read/Write', 'Rover'],
  },
};

export const SPECIES_LIST = Object.keys(SPECIES);

// Skills with linked characteristic
export const SKILLS = {
  basic: [
    { name: 'Art', characteristic: 'dex', grouped: true },
    { name: 'Athletics', characteristic: 'ag' },
    { name: 'Bribery', characteristic: 'fel' },
    { name: 'Charm', characteristic: 'fel' },
    { name: 'Charm Animal', characteristic: 'wp' },
    { name: 'Climb', characteristic: 's' },
    { name: 'Cool', characteristic: 'wp' },
    { name: 'Consume Alcohol', characteristic: 't' },
    { name: 'Dodge', characteristic: 'ag' },
    { name: 'Drive', characteristic: 'ag' },
    { name: 'Endurance', characteristic: 't' },
    { name: 'Entertain', characteristic: 'fel', grouped: true },
    { name: 'Gamble', characteristic: 'int' },
    { name: 'Gossip', characteristic: 'fel' },
    { name: 'Haggle', characteristic: 'fel' },
    { name: 'Intimidate', characteristic: 's' },
    { name: 'Intuition', characteristic: 'i' },
    { name: 'Leadership', characteristic: 'fel' },
    { name: 'Melee', characteristic: 'ws', grouped: true },
    { name: 'Navigation', characteristic: 'i' },
    { name: 'Outdoor Survival', characteristic: 'int' },
    { name: 'Perception', characteristic: 'i' },
    { name: 'Ride', characteristic: 'ag', grouped: true },
    { name: 'Row', characteristic: 's' },
    { name: 'Stealth', characteristic: 'ag', grouped: true },
  ],
  advanced: [
    { name: 'Animal Care', characteristic: 'int' },
    { name: 'Animal Training', characteristic: 'int', grouped: true },
    { name: 'Channelling', characteristic: 'wp' },
    { name: 'Evaluate', characteristic: 'int' },
    { name: 'Heal', characteristic: 'int' },
    { name: 'Language', characteristic: 'int', grouped: true },
    { name: 'Lore', characteristic: 'int', grouped: true },
    { name: 'Perform', characteristic: 'ag', grouped: true },
    { name: 'Pick Lock', characteristic: 'dex' },
    { name: 'Play', characteristic: 'dex', grouped: true },
    { name: 'Pray', characteristic: 'fel' },
    { name: 'Ranged', characteristic: 'bs', grouped: true },
    { name: 'Research', characteristic: 'int' },
    { name: 'Sail', characteristic: 'ag' },
    { name: 'Secret Signs', characteristic: 'int', grouped: true },
    { name: 'Set Trap', characteristic: 'dex' },
    { name: 'Sleight of Hand', characteristic: 'dex' },
    { name: 'Swim', characteristic: 's' },
    { name: 'Track', characteristic: 'i' },
    { name: 'Trade', characteristic: 'dex', grouped: true },
  ],
};

export function getSkillCharacteristic(skillName) {
  const baseName = skillName.replace(/\s*\(.*\)/, '');
  const all = [...SKILLS.basic, ...SKILLS.advanced];
  const found = all.find((s) => s.name === baseName || s.name === skillName);
  return found?.characteristic || 'int';
}

// Common talents
export const TALENTS = [
  'Acute Sense', 'Ambidextrous', 'Animal Affinity', 'Arcane Magic',
  'Argumentative', 'Artistic', 'Attractive', 'Beat Blade',
  'Beneath Notice', 'Berserk Charge', 'Blather', 'Bless',
  'Bookish', 'Break and Enter', 'Briber', 'Cardsharp',
  'Careful Strike', 'Carouser', 'Cat-tongued', 'Chaos Magic',
  'Combat Aware', 'Combat Master', 'Combat Reflexes', 'Commanding Presence',
  'Concoct', 'Contortionist', 'Coolheaded', 'Crack the Whip',
  'Craftsman', 'Criminal', 'Deadeye Shot', 'Dealmaker',
  'Detect Artefact', 'Diceman', 'Dirty Fighting', 'Disarm',
  'Distract', 'Doomed', 'Drilled', 'Dual Wielder',
  'Embezzle', 'Enclosed Fighter', 'Etiquette', 'Fast Hands',
  'Fast Shot', 'Fearless', 'Feint', 'Field Dressing',
  'Flee!', 'Fleet Footed', 'Frenzy', 'Frightening',
  'Furious Assault', 'Gregarious', 'Gunner', 'Hardy',
  'Hatred', 'Holy Hatred', 'Holy Visions', 'Hunter\'s Eye',
  'Impassioned Zeal', 'Inspiring', 'Instinctive Diction',
  'Invoke', 'Iron Jaw', 'Iron Will', 'Jump Up',
  'Kingpin', 'Lightning Reflexes', 'Linguistics', 'Lip Reading',
  'Luck', 'Magic Resistance', 'Magical Sense', 'Marksman',
  'Master Tradesman', 'Menacing', 'Mimic', 'Night Vision',
  'Noble Blood', 'Nose for Trouble', 'Numismatics', 'Old Salt',
  'Orientation', 'Panhandle', 'Perfect Pitch', 'Petty Magic',
  'Pharmacist', 'Pilot', 'Public Speaking', 'Pure Soul',
  'Rapid Reload', 'Read/Write', 'Reaction Strike', 'Resolute',
  'Resistance', 'Reversal', 'Riposte', 'River Guide',
  'Robust', 'Rover', 'Savant', 'Savvy',
  'Scale Sheer Surface', 'Schemer', 'Sea Legs', 'Second Sight',
  'Secret Identity', 'Shadow', 'Sharp', 'Sharpshooter',
  'Shieldsman', 'Sixth Sense', 'Slayer', 'Small',
  'Sniper', 'Sprinter', 'Step Aside', 'Stone Soup',
  'Stout-hearted', 'Strider', 'Strike Mighty Blow', 'Strike to Injure',
  'Strike to Stun', 'Strong Back', 'Strong Legs', 'Strong-minded',
  'Sturdy', 'Suave', 'Super Numerate', 'Sure Shot',
  'Surgery', 'Tenacious', 'Tower of Memories', 'Trapper',
  'Trick Riding', 'Tunnel Rat', 'Unshakable', 'Very Resilient',
  'Very Strong', 'War Leader', 'War Wizard', 'Warrior Born',
  'Waterman', 'Wealthy', 'Well-prepared', 'Witch!',
];

// Career classes
export const CAREER_CLASSES = [
  'Academics', 'Burghers', 'Courtiers', 'Peasants',
  'Rangers', 'Riverfolk', 'Rogues', 'Warriors',
];

// Full career definitions: 8 classes × 8 careers × 4 tiers
export const CAREERS = [
  // ── ACADEMICS ──
  {
    name: 'Apothecary', class: 'Academics',
    tiers: [
      { name: 'Apothecary\'s Apprentice', status: 'Brass 3', skills: ['Consume Alcohol', 'Heal', 'Language (Classical)', 'Lore (Chemistry)', 'Lore (Medicine)', 'Lore (Plants)', 'Trade (Apothecary)', 'Trade (Poisons)'], talents: ['Concoct', 'Craftsman (Apothecary)', 'Etiquette (Scholar)', 'Read/Write'] },
      { name: 'Apothecary', status: 'Silver 1', skills: ['Charm', 'Haggle', 'Lore (Science)', 'Gossip'], talents: ['Criminal', 'Dealmaker', 'Pharmacist', 'Savvy'] },
      { name: 'Master Apothecary', status: 'Silver 3', skills: ['Drive', 'Evaluate', 'Language (Any)', 'Research'], talents: ['Bookish', 'Master Tradesman (Apothecary)', 'Resistance (Poison)', 'Savant (Apothecary)'] },
      { name: 'Apothecary-General', status: 'Gold 1', skills: ['Intimidate', 'Leadership'], talents: ['Acute Sense (Taste)', 'Coolheaded', 'Inspiring', 'Savant (Medicine)'] },
    ],
  },
  {
    name: 'Engineer', class: 'Academics',
    tiers: [
      { name: 'Student Engineer', status: 'Brass 4', skills: ['Consume Alcohol', 'Cool', 'Drive', 'Endurance', 'Language (Classical)', 'Lore (Engineering)', 'Perception', 'Trade (Engineer)'], talents: ['Artistic', 'Craftsman (Engineer)', 'Read/Write', 'Tinker'] },
      { name: 'Engineer', status: 'Silver 2', skills: ['Dodge', 'Ranged (Blackpowder)', 'Research', 'Trade (Blacksmith)'], talents: ['Crack the Whip', 'Gunner', 'Marksman', 'Super Numerate'] },
      { name: 'Master Engineer', status: 'Silver 4', skills: ['Language (Any)', 'Leadership', 'Lore (Science)', 'Navigation'], talents: ['Bookish', 'Deadeye Shot', 'Master Tradesman (Engineer)', 'Savant (Engineering)'] },
      { name: 'Chartered Engineer', status: 'Gold 2', skills: ['Evaluate', 'Intimidate'], talents: ['Coolheaded', 'Inspiring', 'Savvy', 'War Leader'] },
    ],
  },
  {
    name: 'Lawyer', class: 'Academics',
    tiers: [
      { name: 'Student Lawyer', status: 'Brass 4', skills: ['Consume Alcohol', 'Endurance', 'Gossip', 'Haggle', 'Language (Classical)', 'Lore (Law)', 'Lore (Theology)', 'Research'], talents: ['Argumentative', 'Etiquette (Guilds)', 'Read/Write', 'Savvy'] },
      { name: 'Lawyer', status: 'Silver 3', skills: ['Art (Writing)', 'Charm', 'Intuition', 'Perception'], talents: ['Bookish', 'Cat-tongued', 'Dealmaker', 'Suave'] },
      { name: 'Barrister', status: 'Gold 1', skills: ['Cool', 'Evaluate', 'Intimidate', 'Lore (Any)'], talents: ['Commanding Presence', 'Linguistics', 'Public Speaking', 'Savant (Law)'] },
      { name: 'Judge', status: 'Gold 2', skills: ['Bribery', 'Leadership'], talents: ['Coolheaded', 'Inspiring', 'Iron Will', 'Schemer'] },
    ],
  },
  {
    name: 'Nun', class: 'Academics',
    tiers: [
      { name: 'Novitiate', status: 'Brass 1', skills: ['Art (Writing)', 'Cool', 'Endurance', 'Entertain (Storytelling)', 'Gossip', 'Heal', 'Lore (Theology)', 'Pray'], talents: ['Bless (Any)', 'Etiquette (Cult)', 'Read/Write', 'Stone Soup'] },
      { name: 'Nun', status: 'Brass 4', skills: ['Charm', 'Melee (Basic)', 'Research', 'Trade (Any)'], talents: ['Coolheaded', 'Holy Visions', 'Invoke (Any)', 'Pure Soul'] },
      { name: 'Abbess', status: 'Silver 2', skills: ['Intimidate', 'Leadership', 'Lore (Local)', 'Perception'], talents: ['Commanding Presence', 'Inspiring', 'Resistance (Any)', 'Savant (Theology)'] },
      { name: 'Prioress General', status: 'Silver 5', skills: ['Language (Classical)', 'Lore (Politics)'], talents: ['Iron Will', 'Public Speaking', 'Schemer', 'Strong-minded'] },
    ],
  },
  {
    name: 'Physician', class: 'Academics',
    tiers: [
      { name: 'Physician\'s Apprentice', status: 'Brass 4', skills: ['Bribery', 'Cool', 'Drive', 'Endurance', 'Gossip', 'Heal', 'Perception', 'Sleight of Hand'], talents: ['Bookish', 'Field Dressing', 'Read/Write', 'Savvy'] },
      { name: 'Physician', status: 'Silver 3', skills: ['Charm', 'Haggle', 'Language (Classical)', 'Lore (Medicine)'], talents: ['Coolheaded', 'Etiquette (Guilds)', 'Pharmacist', 'Surgery'] },
      { name: 'Doktor', status: 'Silver 5', skills: ['Consume Alcohol', 'Intimidate', 'Leadership', 'Research'], talents: ['Acute Sense (Sight)', 'Nimble Fingers', 'Resistance (Disease)', 'Savant (Medicine)'] },
      { name: 'Court Physician', status: 'Gold 1', skills: ['Evaluate', 'Lore (Any)'], talents: ['Etiquette (Nobles)', 'Hardy', 'Inspiring', 'Iron Will'] },
    ],
  },
  {
    name: 'Priest', class: 'Academics',
    tiers: [
      { name: 'Initiate', status: 'Brass 2', skills: ['Athletics', 'Cool', 'Endurance', 'Intuition', 'Lore (Theology)', 'Perception', 'Pray', 'Research'], talents: ['Bless (Any)', 'Etiquette (Cult)', 'Read/Write', 'Suave'] },
      { name: 'Priest', status: 'Silver 1', skills: ['Charm', 'Entertain (Storytelling)', 'Gossip', 'Heal'], talents: ['Coolheaded', 'Holy Visions', 'Invoke (Any)', 'Public Speaking'] },
      { name: 'High Priest', status: 'Gold 1', skills: ['Art (Writing)', 'Intimidate', 'Language (Classical)', 'Leadership'], talents: ['Commanding Presence', 'Inspiring', 'Pure Soul', 'Savant (Theology)'] },
      { name: 'Lector', status: 'Gold 2', skills: ['Evaluate', 'Lore (Politics)'], talents: ['Iron Will', 'Resistance (Any)', 'Schemer', 'Strong-minded'] },
    ],
  },
  {
    name: 'Scholar', class: 'Academics',
    tiers: [
      { name: 'Student', status: 'Brass 3', skills: ['Consume Alcohol', 'Entertain (Storytelling)', 'Gamble', 'Gossip', 'Language (Classical)', 'Lore (Any)', 'Perception', 'Research'], talents: ['Bookish', 'Etiquette (Scholar)', 'Read/Write', 'Super Numerate'] },
      { name: 'Scholar', status: 'Silver 2', skills: ['Art (Writing)', 'Evaluate', 'Haggle', 'Language (Any)'], talents: ['Linguistics', 'Savant (Any)', 'Savvy', 'Tower of Memories'] },
      { name: 'Fellow', status: 'Silver 5', skills: ['Charm', 'Cool', 'Intuition', 'Leadership'], talents: ['Bookish', 'Commanding Presence', 'Public Speaking', 'Savant (Any)'] },
      { name: 'Professor', status: 'Gold 1', skills: ['Intimidate', 'Lore (Any)'], talents: ['Coolheaded', 'Inspiring', 'Iron Will', 'Savant (Any)'] },
    ],
  },
  {
    name: 'Wizard', class: 'Academics',
    tiers: [
      { name: 'Wizard\'s Apprentice', status: 'Brass 3', skills: ['Channelling', 'Dodge', 'Intuition', 'Language (Magick)', 'Lore (Magic)', 'Melee (Basic)', 'Perception', 'Research'], talents: ['Aethyric Attunement', 'Magical Sense', 'Petty Magic', 'Read/Write'] },
      { name: 'Wizard', status: 'Silver 3', skills: ['Charm', 'Cool', 'Gossip', 'Language (Any)'], talents: ['Arcane Magic (Any)', 'Instinctive Diction', 'Second Sight', 'Sixth Sense'] },
      { name: 'Master Wizard', status: 'Gold 1', skills: ['Intimidate', 'Language (Classical)', 'Leadership', 'Lore (Any)'], talents: ['Bookish', 'Magical Sense', 'Savant (Magic)', 'War Wizard'] },
      { name: 'Wizard Lord', status: 'Gold 2', skills: ['Evaluate', 'Lore (Any)'], talents: ['Coolheaded', 'Inspiring', 'Iron Will', 'Strong-minded'] },
    ],
  },

  // ── BURGHERS ──
  {
    name: 'Agitator', class: 'Burghers',
    tiers: [
      { name: 'Pamphleteer', status: 'Brass 1', skills: ['Art (Writing)', 'Charm', 'Consume Alcohol', 'Cool', 'Dodge', 'Entertain (Storytelling)', 'Gossip', 'Haggle'], talents: ['Blather', 'Gregarious', 'Panhandle', 'Read/Write'] },
      { name: 'Agitator', status: 'Brass 2', skills: ['Bribery', 'Intimidate', 'Leadership', 'Perception'], talents: ['Argumentative', 'Cat-tongued', 'Public Speaking', 'Schemer'] },
      { name: 'Demagogue', status: 'Brass 3', skills: ['Gamble', 'Intuition', 'Lore (Politics)', 'Melee (Basic)'], talents: ['Blather', 'Commanding Presence', 'Inspiring', 'Suave'] },
      { name: 'Rabble Rouser', status: 'Brass 5', skills: ['Lore (Local)', 'Stealth (Urban)'], talents: ['Coolheaded', 'Fearless (Watchmen)', 'Menacing', 'War Leader'] },
    ],
  },
  {
    name: 'Artisan', class: 'Burghers',
    tiers: [
      { name: 'Apprentice Artisan', status: 'Brass 2', skills: ['Athletics', 'Cool', 'Consume Alcohol', 'Dodge', 'Endurance', 'Evaluate', 'Stealth (Urban)', 'Trade (Any)'], talents: ['Artistic', 'Craftsman (Any)', 'Strong Back', 'Very Strong'] },
      { name: 'Artisan', status: 'Silver 1', skills: ['Charm', 'Gossip', 'Haggle', 'Perception'], talents: ['Dealmaker', 'Etiquette (Guilds)', 'Nimble Fingers', 'Sturdy'] },
      { name: 'Master Artisan', status: 'Silver 3', skills: ['Intuition', 'Leadership', 'Research', 'Trade (Any)'], talents: ['Acute Sense (Touch)', 'Master Tradesman (Any)', 'Read/Write', 'Savant (Any)'] },
      { name: 'Guildmaster', status: 'Gold 1', skills: ['Bribery', 'Intimidate'], talents: ['Commanding Presence', 'Inspiring', 'Savvy', 'Wealthy'] },
    ],
  },
  {
    name: 'Beggar', class: 'Burghers',
    tiers: [
      { name: 'Pauper', status: 'Brass 0', skills: ['Athletics', 'Charm', 'Consume Alcohol', 'Cool', 'Dodge', 'Endurance', 'Intuition', 'Stealth (Urban)'], talents: ['Beneath Notice', 'Criminal', 'Panhandle', 'Resistance (Disease)'] },
      { name: 'Beggar', status: 'Brass 2', skills: ['Entertain (Any)', 'Gossip', 'Haggle', 'Perception'], talents: ['Alley Cat', 'Blather', 'Dirty Fighting', 'Stone Soup'] },
      { name: 'Master Beggar', status: 'Brass 4', skills: ['Charm Animal', 'Leadership', 'Lore (Local)', 'Sleight of Hand'], talents: ['Cat-tongued', 'Etiquette (Criminals)', 'Gregarious', 'Hardy'] },
      { name: 'Beggar King', status: 'Silver 2', skills: ['Bribery', 'Intimidate'], talents: ['Commanding Presence', 'Kingpin', 'Menacing', 'Schemer'] },
    ],
  },
  {
    name: 'Investigator', class: 'Burghers',
    tiers: [
      { name: 'Sleuth', status: 'Silver 1', skills: ['Charm', 'Cool', 'Gossip', 'Intuition', 'Perception', 'Research', 'Stealth (Urban)', 'Track'], talents: ['Beneath Notice', 'Nose for Trouble', 'Read/Write', 'Sharp'] },
      { name: 'Investigator', status: 'Silver 2', skills: ['Consume Alcohol', 'Dodge', 'Evaluate', 'Lore (Law)'], talents: ['Bookish', 'Criminal', 'Savvy', 'Shadow'] },
      { name: 'Master Investigator', status: 'Silver 3', skills: ['Intimidate', 'Leadership', 'Lore (Any)', 'Pick Lock'], talents: ['Acute Sense (Any)', 'Coolheaded', 'Linguistics', 'Sixth Sense'] },
      { name: 'Detective', status: 'Silver 5', skills: ['Bribery', 'Melee (Basic)'], talents: ['Fearless (Any)', 'Hardy', 'Savant (Any)', 'Suave'] },
    ],
  },
  {
    name: 'Merchant', class: 'Burghers',
    tiers: [
      { name: 'Trader', status: 'Silver 2', skills: ['Animal Care', 'Charm', 'Drive', 'Evaluate', 'Gamble', 'Gossip', 'Haggle', 'Perception'], talents: ['Dealmaker', 'Etiquette (Any)', 'Numismatics', 'Savvy'] },
      { name: 'Merchant', status: 'Silver 5', skills: ['Bribery', 'Cool', 'Intimidate', 'Language (Any)'], talents: ['Cat-tongued', 'Gregarious', 'Read/Write', 'Suave'] },
      { name: 'Master Merchant', status: 'Gold 2', skills: ['Intuition', 'Lore (Local)', 'Navigation', 'Research'], talents: ['Bookish', 'Coolheaded', 'Linguistics', 'Numismatics'] },
      { name: 'Merchant Prince', status: 'Gold 5', skills: ['Leadership', 'Lore (Any)'], talents: ['Commanding Presence', 'Inspiring', 'Savant (Any)', 'Wealthy'] },
    ],
  },
  {
    name: 'Rat Catcher', class: 'Burghers',
    tiers: [
      { name: 'Rat Hunter', status: 'Brass 3', skills: ['Athletics', 'Animal Training (Dog)', 'Charm Animal', 'Consume Alcohol', 'Endurance', 'Melee (Basic)', 'Perception', 'Stealth (Underground)'], talents: ['Night Vision', 'Resistance (Disease)', 'Sturdy', 'Very Resilient'] },
      { name: 'Rat Catcher', status: 'Silver 1', skills: ['Gossip', 'Haggle', 'Lore (Poison)', 'Set Trap'], talents: ['Enclosed Fighter', 'Hardy', 'Tunnel Rat', 'Trapper'] },
      { name: 'Sewer Jack', status: 'Silver 2', skills: ['Cool', 'Dodge', 'Ranged (Sling)', 'Track'], talents: ['Fearless (Skaven)', 'Nose for Trouble', 'Robust', 'Strong Legs'] },
      { name: 'Exterminator', status: 'Silver 3', skills: ['Intimidate', 'Leadership'], talents: ['Deadeye Shot', 'Fearless (Any)', 'Hardy', 'Menacing'] },
    ],
  },
  {
    name: 'Townsman', class: 'Burghers',
    tiers: [
      { name: 'Citizen', status: 'Silver 1', skills: ['Charm', 'Climb', 'Consume Alcohol', 'Drive', 'Dodge', 'Gamble', 'Gossip', 'Melee (Basic)'], talents: ['Alley Cat', 'Beneath Notice', 'Etiquette (Any)', 'Sturdy'] },
      { name: 'Townsman', status: 'Silver 2', skills: ['Bribery', 'Evaluate', 'Haggle', 'Intuition'], talents: ['Coolheaded', 'Dealmaker', 'Gregarious', 'Savvy'] },
      { name: 'Town Councillor', status: 'Silver 5', skills: ['Cool', 'Leadership', 'Lore (Law)', 'Perception'], talents: ['Commanding Presence', 'Etiquette (Guilds)', 'Public Speaking', 'Schemer'] },
      { name: 'Burgomeister', status: 'Gold 1', skills: ['Intimidate', 'Lore (Politics)'], talents: ['Inspiring', 'Iron Will', 'Suave', 'Wealthy'] },
    ],
  },
  {
    name: 'Watchman', class: 'Burghers',
    tiers: [
      { name: 'Watch Recruit', status: 'Brass 3', skills: ['Athletics', 'Climb', 'Consume Alcohol', 'Dodge', 'Endurance', 'Gamble', 'Melee (Basic)', 'Perception'], talents: ['Drilled', 'Hardy', 'Strike to Stun', 'Warrior Born'] },
      { name: 'Watchman', status: 'Silver 1', skills: ['Cool', 'Gossip', 'Intimidate', 'Lore (Local)'], talents: ['Etiquette (Any)', 'Nose for Trouble', 'Sprinter', 'Tenacious'] },
      { name: 'Watch Sergeant', status: 'Silver 3', skills: ['Intuition', 'Leadership', 'Ranged (Crossbow)', 'Track'], talents: ['Disarm', 'Fearless (Criminals)', 'Jump Up', 'Unshakable'] },
      { name: 'Watch Captain', status: 'Gold 1', skills: ['Bribery', 'Lore (Law)'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'Schemer'] },
    ],
  },

  // ── COURTIERS ──
  {
    name: 'Advisor', class: 'Courtiers',
    tiers: [
      { name: 'Aide', status: 'Silver 2', skills: ['Bribery', 'Consume Alcohol', 'Evaluate', 'Gossip', 'Haggle', 'Language (Classical)', 'Lore (Politics)', 'Perception'], talents: ['Beneath Notice', 'Etiquette (Nobles)', 'Read/Write', 'Savvy'] },
      { name: 'Advisor', status: 'Silver 4', skills: ['Charm', 'Cool', 'Intimidate', 'Research'], talents: ['Argumentative', 'Cat-tongued', 'Schemer', 'Suave'] },
      { name: 'Counsellor', status: 'Gold 1', skills: ['Intuition', 'Leadership', 'Lore (Any)', 'Perception'], talents: ['Bookish', 'Commanding Presence', 'Linguistics', 'Savant (Any)'] },
      { name: 'Chancellor', status: 'Gold 3', skills: ['Language (Any)', 'Lore (Any)'], talents: ['Coolheaded', 'Inspiring', 'Iron Will', 'Public Speaking'] },
    ],
  },
  {
    name: 'Artist', class: 'Courtiers',
    tiers: [
      { name: 'Apprentice Artist', status: 'Brass 3', skills: ['Art (Any)', 'Cool', 'Consume Alcohol', 'Evaluate', 'Endurance', 'Gossip', 'Perception', 'Stealth (Urban)'], talents: ['Artistic', 'Carouser', 'Sharp', 'Read/Write'] },
      { name: 'Artist', status: 'Silver 1', skills: ['Charm', 'Gamble', 'Haggle', 'Trade (Any)'], talents: ['Dealmaker', 'Etiquette (Any)', 'Nimble Fingers', 'Savvy'] },
      { name: 'Master Artist', status: 'Silver 3', skills: ['Intuition', 'Leadership', 'Research', 'Trade (Art Supplies)'], talents: ['Acute Sense (Sight)', 'Coolheaded', 'Gregarious', 'Inspiring'] },
      { name: 'Maestro', status: 'Gold 2', skills: ['Evaluate', 'Lore (Art)'], talents: ['Commanding Presence', 'Savant (Art)', 'Suave', 'Wealthy'] },
    ],
  },
  {
    name: 'Duellist', class: 'Courtiers',
    tiers: [
      { name: 'Fencer', status: 'Silver 1', skills: ['Athletics', 'Charm', 'Cool', 'Dodge', 'Endurance', 'Melee (Fencing)', 'Melee (Parry)', 'Perception'], talents: ['Beat Blade', 'Combat Reflexes', 'Etiquette (Any)', 'Feint'] },
      { name: 'Duellist', status: 'Silver 3', skills: ['Gossip', 'Intimidate', 'Intuition', 'Ranged (Blackpowder)'], talents: ['Disarm', 'Dual Wielder', 'Reaction Strike', 'Riposte'] },
      { name: 'Duelmaster', status: 'Silver 5', skills: ['Leadership', 'Melee (Any)', 'Perform (Fight)', 'Track'], talents: ['Combat Master', 'Fearless (Any)', 'Furious Assault', 'Step Aside'] },
      { name: 'Judicial Champion', status: 'Gold 1', skills: ['Evaluate', 'Lore (Law)'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'Strike Mighty Blow'] },
    ],
  },
  {
    name: 'Envoy', class: 'Courtiers',
    tiers: [
      { name: 'Herald', status: 'Silver 2', skills: ['Athletics', 'Charm', 'Cool', 'Dodge', 'Gossip', 'Haggle', 'Language (Any)', 'Ride (Horse)'], talents: ['Etiquette (Nobles)', 'Gregarious', 'Seasoned Traveller', 'Suave'] },
      { name: 'Envoy', status: 'Silver 5', skills: ['Art (Writing)', 'Evaluate', 'Intuition', 'Perception'], talents: ['Attractive', 'Cat-tongued', 'Read/Write', 'Schemer'] },
      { name: 'Diplomat', status: 'Gold 2', skills: ['Bribery', 'Intimidate', 'Language (Any)', 'Lore (Politics)'], talents: ['Argumentative', 'Coolheaded', 'Linguistics', 'Public Speaking'] },
      { name: 'Ambassador', status: 'Gold 5', skills: ['Leadership', 'Lore (Any)'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'Noble Blood'] },
    ],
  },
  {
    name: 'Noble', class: 'Courtiers',
    tiers: [
      { name: 'Scion', status: 'Gold 1', skills: ['Bribery', 'Consume Alcohol', 'Gamble', 'Gossip', 'Haggle', 'Language (Classical)', 'Leadership', 'Melee (Fencing)'], talents: ['Etiquette (Nobles)', 'Noble Blood', 'Read/Write', 'Wealthy'] },
      { name: 'Noble', status: 'Gold 3', skills: ['Charm', 'Evaluate', 'Intimidate', 'Ride (Horse)'], talents: ['Attractive', 'Coolheaded', 'Luck', 'Schemer'] },
      { name: 'Magnate', status: 'Gold 5', skills: ['Intuition', 'Language (Any)', 'Lore (Politics)', 'Perception'], talents: ['Commanding Presence', 'Gregarious', 'Public Speaking', 'Suave'] },
      { name: 'Noble Lord', status: 'Gold 7', skills: ['Leadership', 'Lore (Any)'], talents: ['Inspiring', 'Iron Will', 'Savant (Any)', 'War Leader'] },
    ],
  },
  {
    name: 'Servant', class: 'Courtiers',
    tiers: [
      { name: 'Menial', status: 'Silver 1', skills: ['Athletics', 'Climb', 'Consume Alcohol', 'Drive', 'Dodge', 'Endurance', 'Intuition', 'Stealth (Any)'], talents: ['Beneath Notice', 'Strong Back', 'Strong Legs', 'Sturdy'] },
      { name: 'Servant', status: 'Silver 3', skills: ['Cool', 'Evaluate', 'Gossip', 'Perception'], talents: ['Etiquette (Servants)', 'Shadow', 'Tenacious', 'Well-prepared'] },
      { name: 'Attendant', status: 'Silver 5', skills: ['Charm', 'Language (Any)', 'Lore (Any)', 'Sleight of Hand'], talents: ['Acute Sense (Any)', 'Attractive', 'Resistance (Any)', 'Suave'] },
      { name: 'Majordomo', status: 'Gold 1', skills: ['Intimidate', 'Leadership'], talents: ['Commanding Presence', 'Coolheaded', 'Numismatics', 'Savvy'] },
    ],
  },
  {
    name: 'Spy', class: 'Courtiers',
    tiers: [
      { name: 'Informer', status: 'Brass 3', skills: ['Bribery', 'Charm', 'Cool', 'Gossip', 'Haggle', 'Perception', 'Stealth (Urban)', 'Sleight of Hand'], talents: ['Beneath Notice', 'Criminal', 'Gregarious', 'Shadow'] },
      { name: 'Spy', status: 'Silver 3', skills: ['Consume Alcohol', 'Dodge', 'Entertain (Any)', 'Intuition'], talents: ['Attractive', 'Cat-tongued', 'Lip Reading', 'Secret Identity'] },
      { name: 'Agent', status: 'Gold 1', skills: ['Language (Any)', 'Leadership', 'Lore (Any)', 'Pick Lock'], talents: ['Coolheaded', 'Linguistics', 'Read/Write', 'Schemer'] },
      { name: 'Spymaster', status: 'Gold 4', skills: ['Evaluate', 'Intimidate'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'Suave'] },
    ],
  },
  {
    name: 'Warden', class: 'Courtiers',
    tiers: [
      { name: 'Custodian', status: 'Silver 1', skills: ['Athletics', 'Charm', 'Consume Alcohol', 'Cool', 'Dodge', 'Endurance', 'Lore (Local)', 'Perception'], talents: ['Etiquette (Any)', 'Hardy', 'Sharp', 'Sturdy'] },
      { name: 'Warden', status: 'Silver 3', skills: ['Gossip', 'Intimidate', 'Leadership', 'Melee (Basic)'], talents: ['Commanding Presence', 'Nose for Trouble', 'Resolute', 'Tenacious'] },
      { name: 'Seneschal', status: 'Silver 5', skills: ['Evaluate', 'Intuition', 'Language (Any)', 'Lore (Any)'], talents: ['Coolheaded', 'Numismatics', 'Savvy', 'Unshakable'] },
      { name: 'Governor', status: 'Gold 3', skills: ['Bribery', 'Lore (Politics)'], talents: ['Inspiring', 'Iron Will', 'Public Speaking', 'Schemer'] },
    ],
  },

  // ── PEASANTS ──
  {
    name: 'Bailiff', class: 'Peasants',
    tiers: [
      { name: 'Tax Collector', status: 'Silver 1', skills: ['Cool', 'Dodge', 'Endurance', 'Gossip', 'Haggle', 'Intimidate', 'Melee (Basic)', 'Perception'], talents: ['Embezzle', 'Numismatics', 'Read/Write', 'Tenacious'] },
      { name: 'Bailiff', status: 'Silver 5', skills: ['Bribery', 'Charm', 'Evaluate', 'Leadership'], talents: ['Argumentative', 'Coolheaded', 'Dealmaker', 'Etiquette (Any)'] },
      { name: 'Reeve', status: 'Gold 1', skills: ['Intuition', 'Lore (Local)', 'Navigation', 'Ride (Horse)'], talents: ['Commanding Presence', 'Public Speaking', 'Savvy', 'Schemer'] },
      { name: 'Magistrate', status: 'Gold 3', skills: ['Language (Classical)', 'Lore (Law)'], talents: ['Inspiring', 'Iron Will', 'Suave', 'Wealthy'] },
    ],
  },
  {
    name: 'Hedge Witch', class: 'Peasants',
    tiers: [
      { name: 'Hedge Apprentice', status: 'Brass 1', skills: ['Channelling', 'Charm Animal', 'Endurance', 'Heal', 'Intuition', 'Lore (Herbs)', 'Outdoor Survival', 'Perception'], talents: ['Aethyric Attunement', 'Petty Magic', 'Rover', 'Sixth Sense'] },
      { name: 'Hedge Witch', status: 'Brass 2', skills: ['Cool', 'Gossip', 'Haggle', 'Lore (Local)'], talents: ['Acute Sense (Any)', 'Animal Affinity', 'Hardy', 'Strider (Any)'] },
      { name: 'Hedge Master', status: 'Brass 3', skills: ['Charm', 'Intimidate', 'Language (Any)', 'Trade (Herbalist)'], talents: ['Coolheaded', 'Magical Sense', 'Resistance (Any)', 'Savant (Herbs)'] },
      { name: 'Hedgewise', status: 'Brass 5', skills: ['Evaluate', 'Leadership'], talents: ['Inspiring', 'Iron Will', 'Pure Soul', 'Strong-minded'] },
    ],
  },
  {
    name: 'Herbalist', class: 'Peasants',
    tiers: [
      { name: 'Herb Gatherer', status: 'Brass 2', skills: ['Charm Animal', 'Climb', 'Endurance', 'Lore (Herbs)', 'Lore (Local)', 'Outdoor Survival', 'Perception', 'Trade (Herbalist)'], talents: ['Acute Sense (Taste)', 'Orientation', 'Rover', 'Strider (Any)'] },
      { name: 'Herbalist', status: 'Brass 4', skills: ['Consume Alcohol', 'Cool', 'Gossip', 'Heal'], talents: ['Concoct', 'Dealmaker', 'Nimble Fingers', 'Pharmacist'] },
      { name: 'Herb Master', status: 'Silver 1', skills: ['Evaluate', 'Haggle', 'Language (Any)', 'Research'], talents: ['Coolheaded', 'Read/Write', 'Resistance (Poison)', 'Savant (Herbs)'] },
      { name: 'Herbwise', status: 'Silver 3', skills: ['Charm', 'Leadership'], talents: ['Inspiring', 'Master Tradesman (Herbalist)', 'Savvy', 'Sharp'] },
    ],
  },
  {
    name: 'Hunter', class: 'Peasants',
    tiers: [
      { name: 'Trapper', status: 'Brass 2', skills: ['Charm Animal', 'Climb', 'Endurance', 'Lore (Beasts)', 'Outdoor Survival', 'Perception', 'Ranged (Bow)', 'Set Trap'], talents: ['Hardy', 'Rover', 'Strider (Any)', 'Trapper'] },
      { name: 'Hunter', status: 'Brass 4', skills: ['Cool', 'Intuition', 'Stealth (Rural)', 'Track'], talents: ['Accurate Shot', 'Hunter\'s Eye', 'Marksman', 'Sniper'] },
      { name: 'Tracker', status: 'Silver 1', skills: ['Dodge', 'Navigation', 'Ride (Horse)', 'Swim'], talents: ['Acute Sense (Any)', 'Deadeye Shot', 'Fearless (Any)', 'Orientation'] },
      { name: 'Huntmaster', status: 'Silver 3', skills: ['Animal Training (Any)', 'Leadership'], talents: ['Commanding Presence', 'Hardy', 'Robust', 'Sure Shot'] },
    ],
  },
  {
    name: 'Miner', class: 'Peasants',
    tiers: [
      { name: 'Prospector', status: 'Brass 2', skills: ['Climb', 'Cool', 'Endurance', 'Evaluate', 'Lore (Local)', 'Melee (Two-Handed)', 'Outdoor Survival', 'Perception'], talents: ['Enclosed Fighter', 'Night Vision', 'Sturdy', 'Tenacious'] },
      { name: 'Miner', status: 'Brass 4', skills: ['Consume Alcohol', 'Dodge', 'Intuition', 'Trade (Miner)'], talents: ['Hardy', 'Strider (Underground)', 'Strong Back', 'Very Strong'] },
      { name: 'Master Miner', status: 'Brass 5', skills: ['Gossip', 'Leadership', 'Lore (Geology)', 'Stealth (Underground)'], talents: ['Acute Sense (Any)', 'Fearless (Any)', 'Orientation', 'Tunnel Rat'] },
      { name: 'Mine Foreman', status: 'Silver 4', skills: ['Intimidate', 'Navigation'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'Strong-minded'] },
    ],
  },
  {
    name: 'Mystic', class: 'Peasants',
    tiers: [
      { name: 'Fortune Teller', status: 'Brass 1', skills: ['Charm', 'Consume Alcohol', 'Cool', 'Dodge', 'Entertain (Fortune Telling)', 'Gossip', 'Intuition', 'Perception'], talents: ['Attractive', 'Luck', 'Second Sight', 'Sixth Sense'] },
      { name: 'Mystic', status: 'Brass 2', skills: ['Haggle', 'Heal', 'Lore (Astrology)', 'Sleight of Hand'], talents: ['Blather', 'Coolheaded', 'Holy Visions', 'Suave'] },
      { name: 'Sage', status: 'Brass 3', skills: ['Evaluate', 'Leadership', 'Lore (Any)', 'Pray'], talents: ['Inspiring', 'Iron Will', 'Nose for Trouble', 'Read/Write'] },
      { name: 'Seer', status: 'Brass 5', skills: ['Intimidate', 'Language (Any)'], talents: ['Savant (Any)', 'Sixth Sense', 'Strong-minded', 'Well-prepared'] },
    ],
  },
  {
    name: 'Scout', class: 'Peasants',
    tiers: [
      { name: 'Outrider', status: 'Brass 2', skills: ['Athletics', 'Charm Animal', 'Climb', 'Endurance', 'Navigation', 'Outdoor Survival', 'Perception', 'Ride (Horse)'], talents: ['Combat Aware', 'Orientation', 'Rover', 'Strider (Any)'] },
      { name: 'Scout', status: 'Brass 4', skills: ['Cool', 'Dodge', 'Ranged (Bow)', 'Stealth (Rural)'], talents: ['Acute Sense (Sight)', 'Fleet Footed', 'Marksman', 'Sixth Sense'] },
      { name: 'Pathfinder', status: 'Silver 1', skills: ['Gossip', 'Intuition', 'Swim', 'Track'], talents: ['Hardy', 'Nose for Trouble', 'Seasoned Traveller', 'Sniper'] },
      { name: 'Explorer', status: 'Silver 5', skills: ['Language (Any)', 'Leadership'], talents: ['Commanding Presence', 'Fearless (Any)', 'Inspiring', 'Savant (Any)'] },
    ],
  },
  {
    name: 'Villager', class: 'Peasants',
    tiers: [
      { name: 'Peasant', status: 'Brass 2', skills: ['Animal Care', 'Athletics', 'Consume Alcohol', 'Dodge', 'Drive', 'Endurance', 'Gossip', 'Melee (Brawling)'], talents: ['Hardy', 'Rover', 'Stone Soup', 'Strong Back'] },
      { name: 'Villager', status: 'Brass 3', skills: ['Charm', 'Haggle', 'Outdoor Survival', 'Trade (Any)'], talents: ['Craftsman (Any)', 'Dealmaker', 'Sturdy', 'Tenacious'] },
      { name: 'Headman', status: 'Brass 5', skills: ['Cool', 'Evaluate', 'Leadership', 'Perception'], talents: ['Commanding Presence', 'Etiquette (Any)', 'Gregarious', 'Savvy'] },
      { name: 'Elder', status: 'Silver 2', skills: ['Intimidate', 'Lore (Local)'], talents: ['Coolheaded', 'Inspiring', 'Public Speaking', 'Strong-minded'] },
    ],
  },

  // ── RANGERS ──
  {
    name: 'Bounty Hunter', class: 'Rangers',
    tiers: [
      { name: 'Thief-taker', status: 'Silver 1', skills: ['Athletics', 'Charm', 'Endurance', 'Gossip', 'Intuition', 'Melee (Basic)', 'Outdoor Survival', 'Perception'], talents: ['Break and Enter', 'Marksman', 'Shadow', 'Suave'] },
      { name: 'Bounty Hunter', status: 'Silver 3', skills: ['Bribery', 'Cool', 'Intimidate', 'Track'], talents: ['Nose for Trouble', 'Seasoned Traveller', 'Sixth Sense', 'Tenacious'] },
      { name: 'Master Bounty Hunter', status: 'Silver 5', skills: ['Dodge', 'Leadership', 'Ranged (Crossbow)', 'Stealth (Any)'], talents: ['Fearless (Any)', 'Hardy', 'Relentless', 'Robust'] },
      { name: 'Bounty Hunter General', status: 'Gold 1', skills: ['Language (Any)', 'Lore (Law)'], talents: ['Commanding Presence', 'Coolheaded', 'Inspiring', 'Iron Will'] },
    ],
  },
  {
    name: 'Coachman', class: 'Rangers',
    tiers: [
      { name: 'Postilion', status: 'Silver 1', skills: ['Animal Care', 'Climb', 'Drive', 'Endurance', 'Lore (Local)', 'Navigation', 'Perception', 'Ride (Horse)'], talents: ['Animal Affinity', 'Crack the Whip', 'Seasoned Traveller', 'Sturdy'] },
      { name: 'Coachman', status: 'Silver 2', skills: ['Cool', 'Dodge', 'Gossip', 'Ranged (Crossbow)'], talents: ['Coolheaded', 'Fleet Footed', 'Nose for Trouble', 'Trick Riding'] },
      { name: 'Coach Master', status: 'Silver 3', skills: ['Charm', 'Haggle', 'Intimidate', 'Melee (Basic)'], talents: ['Dealmaker', 'Etiquette (Any)', 'Fearless (Any)', 'Marksman'] },
      { name: 'Route Master', status: 'Silver 5', skills: ['Leadership', 'Lore (Any)'], talents: ['Commanding Presence', 'Hardy', 'Inspiring', 'Orientation'] },
    ],
  },
  {
    name: 'Entertainer', class: 'Rangers',
    tiers: [
      { name: 'Busker', status: 'Brass 3', skills: ['Athletics', 'Charm', 'Entertain (Any)', 'Gossip', 'Haggle', 'Perform (Any)', 'Play (Any)', 'Stealth (Urban)'], talents: ['Attractive', 'Mimic', 'Perfect Pitch', 'Public Speaking'] },
      { name: 'Entertainer', status: 'Brass 5', skills: ['Dodge', 'Entertain (Any)', 'Ride (Horse)', 'Sleight of Hand'], talents: ['Contortionist', 'Diceman', 'Gregarious', 'Luck'] },
      { name: 'Troubadour', status: 'Silver 3', skills: ['Cool', 'Evaluate', 'Language (Any)', 'Perception'], talents: ['Cat-tongued', 'Dealmaker', 'Etiquette (Any)', 'Suave'] },
      { name: 'Maestro', status: 'Gold 1', skills: ['Intimidate', 'Leadership'], talents: ['Commanding Presence', 'Coolheaded', 'Inspiring', 'Savant (Any)'] },
    ],
  },
  {
    name: 'Flagellant', class: 'Rangers',
    tiers: [
      { name: 'Zealot', status: 'Brass 0', skills: ['Art (Writing)', 'Cool', 'Dodge', 'Endurance', 'Heal', 'Intimidate', 'Lore (Sigmar)', 'Melee (Flail)'], talents: ['Berserk Charge', 'Flagellant', 'Frenzy', 'Hardy'] },
      { name: 'Flagellant', status: 'Brass 0', skills: ['Athletics', 'Charm', 'Gossip', 'Intuition'], talents: ['Fearless (Any)', 'Hatred (Any)', 'Impassioned Zeal', 'Stone Soup'] },
      { name: 'Penitent', status: 'Brass 0', skills: ['Language (Classical)', 'Lore (Theology)', 'Perception', 'Pray'], talents: ['Iron Will', 'Pure Soul', 'Resistance (Any)', 'Stout-hearted'] },
      { name: 'Prophet of Doom', status: 'Brass 0', skills: ['Entertain (Storytelling)', 'Leadership'], talents: ['Commanding Presence', 'Inspiring', 'Strong-minded', 'Unshakable'] },
    ],
  },
  {
    name: 'Messenger', class: 'Rangers',
    tiers: [
      { name: 'Runner', status: 'Brass 3', skills: ['Athletics', 'Charm', 'Cool', 'Dodge', 'Endurance', 'Gossip', 'Navigation', 'Perception'], talents: ['Fleet Footed', 'Orientation', 'Sprinter', 'Strider (Any)'] },
      { name: 'Messenger', status: 'Silver 1', skills: ['Animal Care', 'Haggle', 'Language (Any)', 'Ride (Horse)'], talents: ['Crack the Whip', 'Read/Write', 'Seasoned Traveller', 'Trick Riding'] },
      { name: 'Courier', status: 'Silver 3', skills: ['Climb', 'Intuition', 'Melee (Basic)', 'Outdoor Survival'], talents: ['Hardy', 'Nose for Trouble', 'Rover', 'Tenacious'] },
      { name: 'Courier-General', status: 'Silver 5', skills: ['Intimidate', 'Leadership'], talents: ['Commanding Presence', 'Fearless (Any)', 'Inspiring', 'Savvy'] },
    ],
  },
  {
    name: 'Pedlar', class: 'Rangers',
    tiers: [
      { name: 'Tinker', status: 'Brass 1', skills: ['Charm', 'Consume Alcohol', 'Dodge', 'Drive', 'Evaluate', 'Gossip', 'Haggle', 'Outdoor Survival'], talents: ['Dealmaker', 'Gregarious', 'Numismatics', 'Rover'] },
      { name: 'Pedlar', status: 'Brass 4', skills: ['Animal Care', 'Cool', 'Entertain (Storytelling)', 'Perception'], talents: ['Cat-tongued', 'Orientation', 'Seasoned Traveller', 'Sturdy'] },
      { name: 'Master Pedlar', status: 'Silver 1', skills: ['Intimidate', 'Language (Any)', 'Navigation', 'Ride (Horse)'], talents: ['Attractive', 'Nose for Trouble', 'Read/Write', 'Suave'] },
      { name: 'Wandering Trader', status: 'Silver 3', skills: ['Leadership', 'Lore (Any)'], talents: ['Coolheaded', 'Inspiring', 'Savant (Any)', 'Sharp'] },
    ],
  },
  {
    name: 'Roadwarden', class: 'Rangers',
    tiers: [
      { name: 'Road Patrol', status: 'Silver 1', skills: ['Charm Animal', 'Endurance', 'Intimidate', 'Melee (Basic)', 'Navigation', 'Outdoor Survival', 'Perception', 'Ride (Horse)'], talents: ['Combat Aware', 'Crack the Whip', 'Etiquette (Any)', 'Marksman'] },
      { name: 'Roadwarden', status: 'Silver 2', skills: ['Bribery', 'Cool', 'Gossip', 'Ranged (Crossbow)'], talents: ['Fearless (Any)', 'Nose for Trouble', 'Seasoned Traveller', 'Trick Riding'] },
      { name: 'Road Sergeant', status: 'Silver 3', skills: ['Dodge', 'Leadership', 'Lore (Local)', 'Track'], talents: ['Hardy', 'Orientation', 'Robust', 'Tenacious'] },
      { name: 'Road Captain', status: 'Silver 5', skills: ['Language (Any)', 'Lore (Law)'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'War Leader'] },
    ],
  },
  {
    name: 'Witch Hunter', class: 'Rangers',
    tiers: [
      { name: 'Interrogator', status: 'Silver 1', skills: ['Charm', 'Cool', 'Heal', 'Intimidate', 'Intuition', 'Lore (Torture)', 'Melee (Basic)', 'Perception'], talents: ['Menacing', 'Read/Write', 'Resolute', 'Shadow'] },
      { name: 'Witch Hunter', status: 'Silver 3', skills: ['Dodge', 'Gossip', 'Leadership', 'Ranged (Crossbow)'], talents: ['Fearless (Witches)', 'Marksman', 'Nose for Trouble', 'Sixth Sense'] },
      { name: 'Inquisitor', status: 'Silver 5', skills: ['Cool', 'Lore (Law)', 'Lore (Witches)', 'Track'], talents: ['Hatred (Witches)', 'Iron Will', 'Magic Resistance', 'Stout-hearted'] },
      { name: 'Witchfinder General', status: 'Gold 1', skills: ['Language (Any)', 'Lore (Any)'], talents: ['Commanding Presence', 'Frightening', 'Inspiring', 'Pure Soul'] },
    ],
  },

  // ── RIVERFOLK ──
  {
    name: 'Boatman', class: 'Riverfolk',
    tiers: [
      { name: 'Boat-hand', status: 'Silver 1', skills: ['Consume Alcohol', 'Dodge', 'Endurance', 'Gossip', 'Melee (Basic)', 'Row', 'Sail', 'Swim'], talents: ['Dirty Fighting', 'Fisherman', 'Strong Back', 'Strong Legs'] },
      { name: 'Boatman', status: 'Silver 2', skills: ['Athletics', 'Cool', 'Navigation', 'Perception'], talents: ['Etiquette (Any)', 'Seasoned Traveller', 'Sea Legs', 'Waterman'] },
      { name: 'Boat Master', status: 'Silver 3', skills: ['Charm', 'Evaluate', 'Haggle', 'Lore (Riverways)'], talents: ['Dealmaker', 'Nose for Trouble', 'Old Salt', 'Pilot'] },
      { name: 'Barge Master', status: 'Silver 5', skills: ['Intimidate', 'Leadership'], talents: ['Commanding Presence', 'Coolheaded', 'Inspiring', 'Orientation'] },
    ],
  },
  {
    name: 'Huffer', class: 'Riverfolk',
    tiers: [
      { name: 'Riverhand', status: 'Brass 4', skills: ['Athletics', 'Consume Alcohol', 'Dodge', 'Endurance', 'Gossip', 'Melee (Basic)', 'Row', 'Swim'], talents: ['Dirty Fighting', 'Hardy', 'Strong Back', 'Very Strong'] },
      { name: 'Huffer', status: 'Silver 1', skills: ['Cool', 'Intimidate', 'Navigation', 'Perception'], talents: ['Etiquette (Any)', 'Sea Legs', 'Sturdy', 'Waterman'] },
      { name: 'Riverwise', status: 'Silver 3', skills: ['Charm Animal', 'Lore (Riverways)', 'Outdoor Survival', 'Sail'], talents: ['Nose for Trouble', 'Orientation', 'Pilot', 'River Guide'] },
      { name: 'River Elder', status: 'Silver 5', skills: ['Charm', 'Leadership'], talents: ['Commanding Presence', 'Coolheaded', 'Inspiring', 'Old Salt'] },
    ],
  },
  {
    name: 'Riverwoman', class: 'Riverfolk',
    tiers: [
      { name: 'River Dweller', status: 'Brass 2', skills: ['Athletics', 'Consume Alcohol', 'Endurance', 'Gossip', 'Outdoor Survival', 'Perception', 'Row', 'Swim'], talents: ['Fisherman', 'Hardy', 'Rover', 'Strider (Marshes)'] },
      { name: 'Riverwoman', status: 'Brass 3', skills: ['Charm Animal', 'Heal', 'Lore (Herbs)', 'Trade (Herbalist)'], talents: ['Acute Sense (Any)', 'Concoct', 'Pharmacist', 'Waterman'] },
      { name: 'Riverwise', status: 'Brass 5', skills: ['Cool', 'Haggle', 'Lore (Riverways)', 'Navigation'], talents: ['Coolheaded', 'Nose for Trouble', 'Orientation', 'River Guide'] },
      { name: 'River Elder', status: 'Silver 2', skills: ['Entertain (Storytelling)', 'Leadership'], talents: ['Commanding Presence', 'Inspiring', 'Savant (Any)', 'Strong-minded'] },
    ],
  },
  {
    name: 'Riverwarden', class: 'Riverfolk',
    tiers: [
      { name: 'River Recruit', status: 'Silver 1', skills: ['Athletics', 'Dodge', 'Endurance', 'Melee (Basic)', 'Perception', 'Row', 'Sail', 'Swim'], talents: ['Dirty Fighting', 'Marksman', 'Strong Back', 'Waterman'] },
      { name: 'Riverwarden', status: 'Silver 2', skills: ['Cool', 'Gossip', 'Intimidate', 'Ranged (Crossbow)'], talents: ['Etiquette (Any)', 'Fearless (Any)', 'Nose for Trouble', 'Sea Legs'] },
      { name: 'River Sergeant', status: 'Silver 3', skills: ['Leadership', 'Lore (Riverways)', 'Navigation', 'Track'], talents: ['Hardy', 'Old Salt', 'Pilot', 'River Guide'] },
      { name: 'River Captain', status: 'Silver 5', skills: ['Language (Any)', 'Lore (Law)'], talents: ['Commanding Presence', 'Coolheaded', 'Inspiring', 'War Leader'] },
    ],
  },
  {
    name: 'Seaman', class: 'Riverfolk',
    tiers: [
      { name: 'Landsman', status: 'Silver 1', skills: ['Athletics', 'Climb', 'Consume Alcohol', 'Dodge', 'Endurance', 'Melee (Brawling)', 'Row', 'Swim'], talents: ['Dirty Fighting', 'Hardy', 'Sea Legs', 'Strong Legs'] },
      { name: 'Seaman', status: 'Silver 1', skills: ['Cool', 'Gossip', 'Sail', 'Perception'], talents: ['Catfall', 'Old Salt', 'Strong Back', 'Sturdy'] },
      { name: 'Boatswain', status: 'Silver 3', skills: ['Intimidate', 'Leadership', 'Navigation', 'Trade (Carpenter)'], talents: ['Etiquette (Any)', 'Nose for Trouble', 'Orientation', 'Waterman'] },
      { name: 'Ship\'s Master', status: 'Silver 5', skills: ['Charm', 'Language (Any)'], talents: ['Commanding Presence', 'Inspiring', 'Pilot', 'War Leader'] },
    ],
  },
  {
    name: 'Smuggler', class: 'Riverfolk',
    tiers: [
      { name: 'River Runner', status: 'Brass 2', skills: ['Athletics', 'Bribery', 'Cool', 'Consume Alcohol', 'Dodge', 'Row', 'Sail', 'Stealth (Urban)'], talents: ['Criminal', 'Flee!', 'Rover', 'Waterman'] },
      { name: 'Smuggler', status: 'Brass 3', skills: ['Charm', 'Gossip', 'Haggle', 'Lore (Local)'], talents: ['Dealmaker', 'Etiquette (Criminals)', 'Nose for Trouble', 'Secret Identity'] },
      { name: 'Master Smuggler', status: 'Brass 5', skills: ['Evaluate', 'Intimidate', 'Navigation', 'Perception'], talents: ['Coolheaded', 'Hardy', 'Linguistics', 'Orientation'] },
      { name: 'Smuggler King', status: 'Silver 2', skills: ['Language (Any)', 'Leadership'], talents: ['Commanding Presence', 'Inspiring', 'Kingpin', 'Schemer'] },
    ],
  },
  {
    name: 'Stevedore', class: 'Riverfolk',
    tiers: [
      { name: 'Dockhand', status: 'Brass 3', skills: ['Athletics', 'Climb', 'Consume Alcohol', 'Dodge', 'Endurance', 'Gossip', 'Melee (Basic)', 'Swim'], talents: ['Dirty Fighting', 'Hardy', 'Strong Back', 'Very Strong'] },
      { name: 'Stevedore', status: 'Silver 1', skills: ['Bribery', 'Cool', 'Evaluate', 'Perception'], talents: ['Criminal', 'Etiquette (Guilds)', 'Sturdy', 'Tenacious'] },
      { name: 'Foreman', status: 'Silver 3', skills: ['Charm', 'Haggle', 'Intimidate', 'Leadership'], talents: ['Dealmaker', 'Embezzle', 'Nose for Trouble', 'Savvy'] },
      { name: 'Dock Master', status: 'Silver 5', skills: ['Language (Any)', 'Lore (Local)'], talents: ['Commanding Presence', 'Coolheaded', 'Inspiring', 'Kingpin'] },
    ],
  },
  {
    name: 'Wrecker', class: 'Riverfolk',
    tiers: [
      { name: 'Cargo Scavenger', status: 'Brass 2', skills: ['Athletics', 'Climb', 'Consume Alcohol', 'Dodge', 'Endurance', 'Melee (Basic)', 'Row', 'Swim'], talents: ['Criminal', 'Dirty Fighting', 'Flee!', 'Hardy'] },
      { name: 'Wrecker', status: 'Brass 3', skills: ['Cool', 'Gossip', 'Intimidate', 'Set Trap'], talents: ['Menacing', 'Night Vision', 'Rover', 'Very Strong'] },
      { name: 'River Pirate', status: 'Brass 5', skills: ['Intuition', 'Leadership', 'Perception', 'Sail'], talents: ['Fearless (Any)', 'Nose for Trouble', 'Old Salt', 'Waterman'] },
      { name: 'Wrecker Captain', status: 'Silver 2', skills: ['Language (Any)', 'Navigation'], talents: ['Commanding Presence', 'Inspiring', 'Kingpin', 'Pilot'] },
    ],
  },

  // ── ROGUES ──
  {
    name: 'Bawd', class: 'Rogues',
    tiers: [
      { name: 'Hustler', status: 'Brass 1', skills: ['Bribery', 'Charm', 'Consume Alcohol', 'Dodge', 'Entertain (Any)', 'Gamble', 'Gossip', 'Haggle'], talents: ['Attractive', 'Alley Cat', 'Beneath Notice', 'Gregarious'] },
      { name: 'Bawd', status: 'Brass 3', skills: ['Cool', 'Evaluate', 'Intimidate', 'Perception'], talents: ['Carouser', 'Criminal', 'Dealmaker', 'Suave'] },
      { name: 'Procurer', status: 'Brass 5', skills: ['Intuition', 'Leadership', 'Lore (Local)', 'Melee (Basic)'], talents: ['Coolheaded', 'Embezzle', 'Etiquette (Any)', 'Schemer'] },
      { name: 'Ringleader', status: 'Silver 3', skills: ['Language (Any)', 'Lore (Law)'], talents: ['Commanding Presence', 'Inspiring', 'Kingpin', 'Savvy'] },
    ],
  },
  {
    name: 'Charlatan', class: 'Rogues',
    tiers: [
      { name: 'Swindler', status: 'Brass 3', skills: ['Bribery', 'Charm', 'Consume Alcohol', 'Cool', 'Dodge', 'Entertain (Storytelling)', 'Gamble', 'Gossip'], talents: ['Cardsharp', 'Cat-tongued', 'Diceman', 'Luck'] },
      { name: 'Charlatan', status: 'Brass 5', skills: ['Evaluate', 'Haggle', 'Intuition', 'Sleight of Hand'], talents: ['Blather', 'Criminal', 'Fast Hands', 'Secret Identity'] },
      { name: 'Con Artist', status: 'Silver 2', skills: ['Language (Any)', 'Lore (Any)', 'Perception', 'Pick Lock'], talents: ['Attractive', 'Dealmaker', 'Gregarious', 'Read/Write'] },
      { name: 'Crime Lord', status: 'Silver 5', skills: ['Intimidate', 'Leadership'], talents: ['Commanding Presence', 'Coolheaded', 'Kingpin', 'Suave'] },
    ],
  },
  {
    name: 'Fence', class: 'Rogues',
    tiers: [
      { name: 'Broker', status: 'Brass 3', skills: ['Charm', 'Consume Alcohol', 'Dodge', 'Evaluate', 'Gamble', 'Gossip', 'Haggle', 'Melee (Basic)'], talents: ['Alley Cat', 'Criminal', 'Dealmaker', 'Numismatics'] },
      { name: 'Fence', status: 'Silver 1', skills: ['Bribery', 'Cool', 'Intimidate', 'Perception'], talents: ['Coolheaded', 'Embezzle', 'Etiquette (Criminals)', 'Gregarious'] },
      { name: 'Master Fence', status: 'Silver 3', skills: ['Intuition', 'Language (Any)', 'Lore (Local)', 'Sleight of Hand'], talents: ['Kingpin', 'Nose for Trouble', 'Savvy', 'Secret Identity'] },
      { name: 'Black Marketeer', status: 'Silver 5', skills: ['Leadership', 'Lore (Any)'], talents: ['Commanding Presence', 'Iron Will', 'Schemer', 'Wealthy'] },
    ],
  },
  {
    name: 'Grave Robber', class: 'Rogues',
    tiers: [
      { name: 'Body Snatcher', status: 'Brass 2', skills: ['Climb', 'Cool', 'Dodge', 'Endurance', 'Gossip', 'Intuition', 'Perception', 'Stealth (Any)'], talents: ['Break and Enter', 'Criminal', 'Night Vision', 'Resistance (Disease)'] },
      { name: 'Grave Robber', status: 'Brass 3', skills: ['Drive', 'Evaluate', 'Haggle', 'Lore (Medicine)'], talents: ['Alley Cat', 'Dirty Fighting', 'Flee!', 'Strong Back'] },
      { name: 'Tomb Robber', status: 'Brass 5', skills: ['Lore (Any)', 'Pick Lock', 'Set Trap', 'Swim'], talents: ['Fearless (Undead)', 'Read/Write', 'Sixth Sense', 'Tunnel Rat'] },
      { name: 'Treasure Hunter', status: 'Silver 2', skills: ['Language (Any)', 'Leadership'], talents: ['Coolheaded', 'Hardy', 'Savant (Any)', 'Tenacious'] },
    ],
  },
  {
    name: 'Outlaw', class: 'Rogues',
    tiers: [
      { name: 'Brigand', status: 'Brass 2', skills: ['Athletics', 'Consume Alcohol', 'Cool', 'Dodge', 'Endurance', 'Intimidate', 'Melee (Basic)', 'Outdoor Survival'], talents: ['Combat Aware', 'Criminal', 'Dirty Fighting', 'Rover'] },
      { name: 'Outlaw', status: 'Brass 4', skills: ['Gossip', 'Perception', 'Ranged (Bow)', 'Stealth (Rural)'], talents: ['Flee!', 'Hardy', 'Marksman', 'Strike to Stun'] },
      { name: 'Outlaw Chief', status: 'Brass 6', skills: ['Bribery', 'Charm', 'Intuition', 'Leadership'], talents: ['Fearless (Any)', 'Menacing', 'Schemer', 'Tenacious'] },
      { name: 'Bandit King', status: 'Silver 2', skills: ['Language (Any)', 'Lore (Any)'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'War Leader'] },
    ],
  },
  {
    name: 'Thief', class: 'Rogues',
    tiers: [
      { name: 'Pickpocket', status: 'Brass 1', skills: ['Athletics', 'Charm', 'Climb', 'Cool', 'Dodge', 'Perception', 'Sleight of Hand', 'Stealth (Urban)'], talents: ['Alley Cat', 'Criminal', 'Fast Hands', 'Shadow'] },
      { name: 'Thief', status: 'Brass 3', skills: ['Evaluate', 'Gossip', 'Intuition', 'Pick Lock'], talents: ['Break and Enter', 'Contortionist', 'Flee!', 'Night Vision'] },
      { name: 'Master Thief', status: 'Brass 5', skills: ['Bribery', 'Intimidate', 'Lore (Local)', 'Set Trap'], talents: ['Beneath Notice', 'Cat-tongued', 'Scale Sheer Surface', 'Sixth Sense'] },
      { name: 'Cat Burglar', status: 'Silver 3', skills: ['Language (Any)', 'Leadership'], talents: ['Coolheaded', 'Kingpin', 'Savvy', 'Step Aside'] },
    ],
  },
  {
    name: 'Racketeer', class: 'Rogues',
    tiers: [
      { name: 'Thug', status: 'Brass 3', skills: ['Consume Alcohol', 'Cool', 'Dodge', 'Endurance', 'Gossip', 'Intimidate', 'Melee (Basic)', 'Stealth (Urban)'], talents: ['Criminal', 'Dirty Fighting', 'Menacing', 'Strike to Stun'] },
      { name: 'Racketeer', status: 'Brass 5', skills: ['Bribery', 'Charm', 'Evaluate', 'Perception'], talents: ['Embezzle', 'Etiquette (Criminals)', 'Fearless (Any)', 'Iron Will'] },
      { name: 'Gang Boss', status: 'Silver 2', skills: ['Intuition', 'Leadership', 'Lore (Local)', 'Ranged (Crossbow)'], talents: ['Commanding Presence', 'Kingpin', 'Schemer', 'Savvy'] },
      { name: 'Crime Lord', status: 'Silver 5', skills: ['Language (Any)', 'Lore (Law)'], talents: ['Coolheaded', 'Frightening', 'Inspiring', 'Wealthy'] },
    ],
  },
  {
    name: 'Witch', class: 'Rogues',
    tiers: [
      { name: 'Hexer', status: 'Brass 1', skills: ['Channelling', 'Cool', 'Dodge', 'Endurance', 'Gossip', 'Intimidate', 'Intuition', 'Stealth (Rural)'], talents: ['Aethyric Attunement', 'Menacing', 'Petty Magic', 'Witch!'] },
      { name: 'Witch', status: 'Brass 2', skills: ['Charm Animal', 'Heal', 'Language (Magick)', 'Perception'], talents: ['Arcane Magic (Witchcraft)', 'Magical Sense', 'Rover', 'Sixth Sense'] },
      { name: 'Wyrd', status: 'Brass 3', skills: ['Charm', 'Lore (Magic)', 'Lore (Herbs)', 'Outdoor Survival'], talents: ['Animal Affinity', 'Coolheaded', 'Hardy', 'Second Sight'] },
      { name: 'Warlock', status: 'Brass 5', skills: ['Leadership', 'Lore (Any)'], talents: ['Frightening', 'Inspiring', 'Iron Will', 'Strong-minded'] },
    ],
  },

  // ── WARRIORS ──
  {
    name: 'Cavalryman', class: 'Warriors',
    tiers: [
      { name: 'Horseman', status: 'Silver 2', skills: ['Animal Care', 'Charm Animal', 'Endurance', 'Language (Any)', 'Melee (Basic)', 'Outdoor Survival', 'Perception', 'Ride (Horse)'], talents: ['Combat Aware', 'Crack the Whip', 'Drilled', 'Trick Riding'] },
      { name: 'Cavalryman', status: 'Silver 4', skills: ['Cool', 'Dodge', 'Melee (Cavalry)', 'Ranged (Crossbow)'], talents: ['Etiquette (Soldiers)', 'Fearless (Any)', 'Seasoned Traveller', 'Sturdy'] },
      { name: 'Cavalry Sergeant', status: 'Gold 1', skills: ['Consume Alcohol', 'Gossip', 'Intimidate', 'Leadership'], talents: ['Combat Master', 'Hardy', 'Hatred (Any)', 'War Leader'] },
      { name: 'Cavalry Officer', status: 'Gold 2', skills: ['Lore (Warfare)', 'Navigation'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'Shieldsman'] },
    ],
  },
  {
    name: 'Guard', class: 'Warriors',
    tiers: [
      { name: 'Sentry', status: 'Silver 1', skills: ['Consume Alcohol', 'Cool', 'Dodge', 'Endurance', 'Gamble', 'Gossip', 'Melee (Basic)', 'Perception'], talents: ['Diceman', 'Drilled', 'Etiquette (Any)', 'Warrior Born'] },
      { name: 'Guard', status: 'Silver 2', skills: ['Athletics', 'Intuition', 'Melee (Polearm)', 'Ranged (Crossbow)'], talents: ['Relentless', 'Shieldsman', 'Strike to Stun', 'Tenacious'] },
      { name: 'Honour Guard', status: 'Silver 3', skills: ['Heal', 'Intimidate', 'Leadership', 'Melee (Two-Handed)'], talents: ['Fearless (Any)', 'Furious Assault', 'Jump Up', 'Unshakable'] },
      { name: 'Guard Officer', status: 'Silver 5', skills: ['Charm', 'Lore (Warfare)'], talents: ['Commanding Presence', 'Hardy', 'Inspiring', 'War Leader'] },
    ],
  },
  {
    name: 'Knight', class: 'Warriors',
    tiers: [
      { name: 'Squire', status: 'Silver 3', skills: ['Athletics', 'Animal Care', 'Charm', 'Cool', 'Endurance', 'Heal', 'Melee (Cavalry)', 'Ride (Horse)'], talents: ['Drilled', 'Etiquette (Any)', 'Seasoned Traveller', 'Warrior Born'] },
      { name: 'Knight', status: 'Gold 2', skills: ['Dodge', 'Intimidate', 'Leadership', 'Melee (Any)'], talents: ['Fearless (Any)', 'Resolute', 'Shieldsman', 'Strike Mighty Blow'] },
      { name: 'First Knight', status: 'Gold 4', skills: ['Consume Alcohol', 'Lore (Heraldry)', 'Lore (Warfare)', 'Perception'], talents: ['Combat Master', 'Furious Assault', 'Iron Will', 'Stout-hearted'] },
      { name: 'Knight Commander', status: 'Gold 5', skills: ['Language (Any)', 'Lore (Any)'], talents: ['Commanding Presence', 'Inspiring', 'Noble Blood', 'War Leader'] },
    ],
  },
  {
    name: 'Pit Fighter', class: 'Warriors',
    tiers: [
      { name: 'Pugilist', status: 'Brass 4', skills: ['Athletics', 'Cool', 'Dodge', 'Endurance', 'Gamble', 'Intimidate', 'Melee (Any)', 'Melee (Brawling)'], talents: ['Dirty Fighting', 'Drilled', 'Iron Jaw', 'Warrior Born'] },
      { name: 'Pit Fighter', status: 'Silver 2', skills: ['Charm', 'Consume Alcohol', 'Gossip', 'Perception'], talents: ['Combat Reflexes', 'Dual Wielder', 'Frenzy', 'Very Strong'] },
      { name: 'Pit Champion', status: 'Silver 5', skills: ['Intuition', 'Melee (Two-Handed)', 'Perform (Fight)', 'Ranged (Any)'], talents: ['Combat Master', 'Disarm', 'Furious Assault', 'Iron Will'] },
      { name: 'Pit Legend', status: 'Gold 2', skills: ['Leadership', 'Lore (Any)'], talents: ['Fearless (Any)', 'Frightening', 'Impassioned Zeal', 'Strike Mighty Blow'] },
    ],
  },
  {
    name: 'Protagonist', class: 'Warriors',
    tiers: [
      { name: 'Brawler', status: 'Brass 2', skills: ['Athletics', 'Consume Alcohol', 'Cool', 'Dodge', 'Endurance', 'Gamble', 'Intimidate', 'Melee (Any)'], talents: ['Dirty Fighting', 'In-fighter', 'Iron Jaw', 'Menacing'] },
      { name: 'Protagonist', status: 'Silver 1', skills: ['Bribery', 'Charm', 'Gossip', 'Perception'], talents: ['Combat Reflexes', 'Criminal', 'Dual Wielder', 'Reversal'] },
      { name: 'Champion', status: 'Silver 5', skills: ['Intuition', 'Leadership', 'Melee (Any)', 'Ranged (Any)'], talents: ['Combat Master', 'Disarm', 'Furious Assault', 'Strike to Stun'] },
      { name: 'Champion of Champions', status: 'Gold 2', skills: ['Lore (Any)', 'Perform (Fight)'], talents: ['Fearless (Any)', 'Frightening', 'Iron Will', 'Strike Mighty Blow'] },
    ],
  },
  {
    name: 'Soldier', class: 'Warriors',
    tiers: [
      { name: 'Recruit', status: 'Silver 1', skills: ['Athletics', 'Climb', 'Cool', 'Dodge', 'Endurance', 'Gamble', 'Melee (Basic)', 'Ranged (Any)'], talents: ['Diceman', 'Drilled', 'Marksman', 'Warrior Born'] },
      { name: 'Soldier', status: 'Silver 3', skills: ['Consume Alcohol', 'Gossip', 'Intimidate', 'Perception'], talents: ['Etiquette (Soldiers)', 'Rapid Reload', 'Shieldsman', 'Sturdy'] },
      { name: 'Sergeant', status: 'Silver 5', skills: ['Heal', 'Intuition', 'Leadership', 'Melee (Any)'], talents: ['Combat Master', 'Fearless (Any)', 'Unshakable', 'War Leader'] },
      { name: 'Officer', status: 'Gold 1', skills: ['Language (Any)', 'Lore (Warfare)'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'Stout-hearted'] },
    ],
  },
  {
    name: 'Troll Slayer', class: 'Warriors',
    tiers: [
      { name: 'Troll Slayer', status: 'Brass 2', skills: ['Athletics', 'Consume Alcohol', 'Cool', 'Dodge', 'Endurance', 'Gamble', 'Intimidate', 'Melee (Basic)'], talents: ['Dual Wielder', 'Frenzy', 'Hardy', 'Slayer'] },
      { name: 'Giant Slayer', status: 'Brass 2', skills: ['Evaluate', 'Lore (Trolls)', 'Outdoor Survival', 'Perception'], talents: ['Fearless (Everything)', 'Furious Assault', 'Iron Will', 'Very Strong'] },
      { name: 'Dragon Slayer', status: 'Brass 2', skills: ['Heal', 'Intuition', 'Melee (Two-Handed)', 'Ranged (Throwing)'], talents: ['Combat Master', 'Impassioned Zeal', 'Resistance (Any)', 'Strike Mighty Blow'] },
      { name: 'Daemon Slayer', status: 'Brass 2', skills: ['Entertain (Storytelling)', 'Leadership'], talents: ['Fearless (Everything)', 'Frightening', 'Magic Resistance', 'Unshakable'] },
    ],
  },
  {
    name: 'Warrior Priest', class: 'Warriors',
    tiers: [
      { name: 'Novice', status: 'Brass 2', skills: ['Cool', 'Dodge', 'Endurance', 'Heal', 'Leadership', 'Lore (Theology)', 'Melee (Any)', 'Pray'], talents: ['Bless (Any)', 'Etiquette (Cult)', 'Read/Write', 'Strong-minded'] },
      { name: 'Warrior Priest', status: 'Silver 2', skills: ['Charm', 'Intimidate', 'Melee (Any)', 'Ranged (Any)'], talents: ['Dual Wielder', 'Holy Hatred', 'Invoke (Any)', 'Resolute'] },
      { name: 'Priest Captain', status: 'Gold 1', skills: ['Consume Alcohol', 'Intuition', 'Lore (Warfare)', 'Perception'], talents: ['Combat Master', 'Fearless (Any)', 'Furious Assault', 'Stout-hearted'] },
      { name: 'Templar', status: 'Gold 2', skills: ['Language (Classical)', 'Lore (Any)'], talents: ['Commanding Presence', 'Inspiring', 'Iron Will', 'War Leader'] },
    ],
  },
];

// Advancement cost tables
export const ADVANCEMENT_COSTS = {
  inCareer: [
    { min: 1, max: 5, cost: 25 },
    { min: 6, max: 10, cost: 30 },
    { min: 11, max: 15, cost: 40 },
    { min: 16, max: 20, cost: 50 },
    { min: 21, max: 25, cost: 70 },
    { min: 26, max: 30, cost: 90 },
  ],
  outOfCareer: [
    { min: 1, max: 5, cost: 50 },
    { min: 6, max: 10, cost: 60 },
    { min: 11, max: 15, cost: 80 },
    { min: 16, max: 20, cost: 100 },
    { min: 21, max: 25, cost: 140 },
    { min: 26, max: 30, cost: 180 },
  ],
  talentInCareer: 100,
  talentOutOfCareer: 200,
  careerChangeSameClass: 100,
  careerChangeDifferentClass: 200,
};

export function getAdvancementCost(currentAdvances, inCareer = true) {
  const table = inCareer ? ADVANCEMENT_COSTS.inCareer : ADVANCEMENT_COSTS.outOfCareer;
  const nextAdvance = currentAdvances + 1;
  const tier = table.find((t) => nextAdvance >= t.min && nextAdvance <= t.max);
  return tier?.cost || table[table.length - 1].cost;
}

export function getCareerByName(name) {
  return CAREERS.find((c) => c.name === name);
}

export function getCareersByClass(className) {
  return CAREERS.filter((c) => c.class === className);
}

export function getCareerTierSkills(careerName, tier) {
  const career = getCareerByName(careerName);
  if (!career) return [];
  const allSkills = [];
  for (let i = 0; i <= Math.min(tier - 1, 3); i++) {
    allSkills.push(...career.tiers[i].skills);
  }
  return [...new Set(allSkills)];
}

export function getCareerTierTalents(careerName, tier) {
  const career = getCareerByName(careerName);
  if (!career) return [];
  const allTalents = [];
  for (let i = 0; i <= Math.min(tier - 1, 3); i++) {
    allTalents.push(...career.tiers[i].talents);
  }
  return [...new Set(allTalents)];
}

export function getCareerTierCharacteristics(careerName, tier) {
  const career = getCareerByName(careerName);
  if (!career) return [];
  const skills = getCareerTierSkills(careerName, tier);
  const chars = new Set();
  const allSkills = [...SKILLS.basic, ...SKILLS.advanced];
  for (const skillName of skills) {
    const baseName = skillName.replace(/\s*\(.*\)/, '');
    const def = allSkills.find((s) => s.name === baseName || s.name === skillName);
    if (def) chars.add(def.characteristic);
  }
  return [...chars];
}

export function isCharacteristicInCareer(charKey, careerName, tier) {
  const careerChars = getCareerTierCharacteristics(careerName, tier);
  return careerChars.includes(charKey);
}

export function isSkillInCareer(skillName, careerName, tier) {
  const careerSkills = getCareerTierSkills(careerName, tier);
  const baseName = skillName.replace(/\s*\(.*\)/, '');
  return careerSkills.some((s) => {
    const base = s.replace(/\s*\(.*\)/, '');
    return s === skillName || base === baseName || base === skillName;
  });
}

export function isTalentInCareer(talentName, careerName, tier) {
  const careerTalents = getCareerTierTalents(careerName, tier);
  const baseName = talentName.replace(/\s*\(.*\)/, '');
  return careerTalents.some((t) => {
    const base = t.replace(/\s*\(.*\)/, '');
    return t === talentName || base === baseName || base === talentName;
  });
}

export function canAdvanceTier(character) {
  const { career, skills } = character;
  if (!career || career.tier >= 4) return false;
  const tierSkills = getCareerTierSkills(career.name, career.tier);
  let qualifiedSkills = 0;
  for (const sk of tierSkills) {
    if ((skills[sk] || 0) >= 5) qualifiedSkills++;
  }
  const tierTalents = getCareerTierTalents(career.name, career.tier);
  const hasTalent = tierTalents.some((t) => character.talents?.includes(t));
  return qualifiedSkills >= 8 && hasTalent;
}
