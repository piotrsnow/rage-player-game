// Living World Phase 7 — dungeon content tables.
//
// Static, deterministic data that the dungeon seed generator rolls against
// to populate rooms. Two themes at MVP scope: catacomb (undead/demons,
// ruiny bestiary) and cave (monsters, jaskinia bestiary). Three difficulty
// tiers: easy / medium / hard.
//
// User-facing text is stored as `{ pl, en }` pairs. Callers resolve via
// `localize(obj, lang)` from contentLocalizer.js based on the user's
// `User.contentLanguage` preference (default 'pl'). Missing `en` silently
// falls back to `pl` so new languages can be added incrementally without
// breaking seeding.
//
// Bestiary references (`BESTIARY` names from equipment/bestiary.js) are the
// canonical enemy source — they already carry `locations: ['jaskinia'|'ruiny']`
// so encounter tables don't duplicate stat data. Bestiary names stay
// monolingual for now (Phase 8+ localization).

// ── TRAPS ──
// Each trap: { id, label, dc, stat, damage: "<dice>" | null, effect, weight }
// `stat` = RPGon attribute key for the skill check; damage uses game dice
// notation ("2d6", "1d10+2", etc.). `label`/`effect` are i18n maps.
export const TRAPS = {
  catacomb: {
    easy: [
      { id: 'dust_cloud', dc: 10, stat: 'zrecznosc', damage: null, weight: 3,
        label: { pl: 'Chmura pyłu', en: 'Dust cloud' },
        effect: {
          pl: 'Chmura gryzącego pyłu — kaszel, -5 do testów percepcji na 1 turę.',
          en: 'A cloud of biting dust — coughing fit, -5 to perception checks for 1 turn.',
        } },
      { id: 'floor_pit', dc: 12, stat: 'zrecznosc', damage: '1d6', weight: 3,
        label: { pl: 'Dziura w posadzce', en: 'Floor pit' },
        effect: {
          pl: 'Spróchniała płyta posadzki zapada się pod ciężarem.',
          en: 'A rotted floor slab gives way underfoot.',
        } },
      { id: 'tripwire_bell', dc: 10, stat: 'spostrzegawczosc', damage: null, weight: 2,
        label: { pl: 'Dzwoneczek ostrzegawczy', en: 'Tripwire bell' },
        effect: {
          pl: 'Cienka linka z dzwoneczkiem — dźwięk alarmuje wszystko w pobliżu.',
          en: 'A thin wire strung with a bell — the chime alerts everything nearby.',
        } },
    ],
    medium: [
      { id: 'dart_trap', dc: 14, stat: 'zrecznosc', damage: '2d6', weight: 3,
        label: { pl: 'Pułapka z rzutkami', en: 'Dart trap' },
        effect: {
          pl: 'Seria zatrutych rzutek wystrzeliwuje z ukrytych otworów w ścianie.',
          en: 'A volley of poisoned darts fires from hidden wall slits.',
        } },
      { id: 'poison_cloud', dc: 13, stat: 'wytrzymalosc', damage: '1d6', weight: 2,
        label: { pl: 'Komora z trucizną', en: 'Poison chamber' },
        effect: {
          pl: 'Zielonkawa mgła — słabość fizyczna, -10 do Siły na scenę.',
          en: 'A greenish mist — physical weakness, -10 to Strength for the scene.',
        } },
      { id: 'scythe_trap', dc: 15, stat: 'zrecznosc', damage: '3d6', weight: 2,
        label: { pl: 'Kosa wahadłowa', en: 'Swinging scythe' },
        effect: {
          pl: 'Ostra kosa spada z sufitu w dół korytarza.',
          en: 'A razor-edged scythe sweeps down the corridor from the ceiling.',
        } },
      { id: 'grasping_bones', dc: 13, stat: 'sila', damage: '1d8', weight: 2,
        label: { pl: 'Chwytające kości', en: 'Grasping bones' },
        effect: {
          pl: 'Kościane ręce wyłaniają się z podłogi — unieruchamiają na 1 turę.',
          en: 'Skeletal hands erupt from the floor — restrained for 1 turn.',
        } },
    ],
    hard: [
      { id: 'spike_pit', dc: 16, stat: 'zrecznosc', damage: '4d6', weight: 3,
        label: { pl: 'Zapadnia z kolcami', en: 'Spiked pit' },
        effect: {
          pl: 'Głęboka dziura z kolcami u dna — trudna do wyjścia.',
          en: 'A deep spiked pit — hard to climb back out.',
        } },
      { id: 'necrotic_ward', dc: 17, stat: 'inteligencja', damage: '3d8', weight: 2,
        label: { pl: 'Nekrotyczne glify', en: 'Necrotic wards' },
        effect: {
          pl: 'Glify rozbłyskują — ciemna energia drenuje życie.',
          en: 'Glyphs flare — dark energy drains life force.',
        } },
      { id: 'collapse_ceiling', dc: 17, stat: 'zrecznosc', damage: '5d6', weight: 2,
        label: { pl: 'Zawalenie stropu', en: 'Ceiling collapse' },
        effect: {
          pl: 'Kamienny blok spada z sufitu — obszarowe obrażenia.',
          en: 'A stone block crashes down from above — area damage.',
        } },
    ],
  },
  cave: {
    easy: [
      { id: 'slippery_slope', dc: 10, stat: 'zrecznosc', damage: '1d4', weight: 3,
        label: { pl: 'Śliski zjazd', en: 'Slippery slope' },
        effect: {
          pl: 'Wilgotny, porośnięty mchem skos — ślizgasz się w głąb jaskini.',
          en: 'A mossy, damp slope — you slide deeper into the cave.',
        } },
      { id: 'web_tangle', dc: 11, stat: 'sila', damage: null, weight: 3,
        label: { pl: 'Pajęczyny', en: 'Web tangle' },
        effect: {
          pl: 'Gruba sieć pajęcza — unieruchomiony do czasu przecięcia.',
          en: 'Thick spider webs — restrained until cut free.',
        } },
      { id: 'loose_rocks', dc: 10, stat: 'zrecznosc', damage: '1d4', weight: 2,
        label: { pl: 'Lawina drobnych kamieni', en: 'Loose rock slide' },
        effect: {
          pl: 'Luźne kamienie sypią się po zboczu — hałas alarmuje wrogów.',
          en: 'Loose rocks cascade down the slope — the noise alerts nearby enemies.',
        } },
    ],
    medium: [
      { id: 'gas_vent', dc: 13, stat: 'wytrzymalosc', damage: '2d4', weight: 3,
        label: { pl: 'Otwór z gazem', en: 'Gas vent' },
        effect: {
          pl: 'Siarkowa para — zawroty głowy, -5 do ataków na 2 tury.',
          en: 'Sulfurous vapor — dizziness, -5 to attacks for 2 turns.',
        } },
      { id: 'falling_stalactite', dc: 14, stat: 'spostrzegawczosc', damage: '2d8', weight: 2,
        label: { pl: 'Spadający stalaktyt', en: 'Falling stalactite' },
        effect: {
          pl: 'Ciężki stalaktyt spada z sufitu celując w niewprawnych.',
          en: 'A heavy stalactite plunges down, targeting the unwary.',
        } },
      { id: 'flood_chamber', dc: 13, stat: 'zrecznosc', damage: '2d6', weight: 2,
        label: { pl: 'Komora zalewowa', en: 'Flood chamber' },
        effect: {
          pl: 'Drzwi zamykają się, woda zaczyna wypełniać komorę od dołu.',
          en: 'The doors slam shut and water starts flooding in from below.',
        } },
    ],
    hard: [
      { id: 'lava_crack', dc: 16, stat: 'zrecznosc', damage: '4d6', weight: 3,
        label: { pl: 'Szczelina z lawą', en: 'Lava crack' },
        effect: {
          pl: 'Świecąca czerwonym szczelina — żar pali przy przejściu.',
          en: 'A red-glowing fissure — the heat scorches anyone crossing.',
        } },
      { id: 'cave_in', dc: 17, stat: 'zrecznosc', damage: '4d8', weight: 2,
        label: { pl: 'Zawalenie jaskini', en: 'Cave-in' },
        effect: {
          pl: 'Cała komora wali się — obszarowe obrażenia + blokuje tył.',
          en: 'The whole chamber collapses — area damage plus the way back is sealed.',
        } },
      { id: 'living_stone', dc: 16, stat: 'sila', damage: '3d6', weight: 2,
        label: { pl: 'Żywe kamienie', en: 'Living stone' },
        effect: {
          pl: 'Skała zamyka się wokół nóg — wymaga testu Siły by się wyrwać.',
          en: 'Stone closes around the legs — a Strength check is needed to break free.',
        } },
    ],
  },
};

// ── LOOT ──
// Each entry: { id, name, rarity, quantity: "<dice or number>", category }
// Categories: 'gold' (raw SK/ZK/MK), 'gear' (weapon/armor ref), 'consumable',
// 'material', 'trinket' (flavor, possibly quest-linked).
export const LOOT = {
  catacomb: {
    easy: [
      { id: 'copper_coins', rarity: 'common', quantity: '2d10 MK', category: 'gold', weight: 4,
        name: { pl: 'Garść miedziaków', en: 'Handful of coppers' } },
      { id: 'dusty_ring', rarity: 'common', quantity: 1, category: 'trinket', weight: 3,
        name: { pl: 'Zakurzony pierścień', en: 'Dusty ring' } },
      { id: 'tattered_shroud', rarity: 'common', quantity: 1, category: 'material', weight: 2,
        name: { pl: 'Postrzępiony całun', en: 'Tattered shroud' } },
      { id: 'bone_dust', rarity: 'common', quantity: '1d4', category: 'material', weight: 2,
        name: { pl: 'Proszek kostny', en: 'Bone dust' } },
      { id: 'rusty_dagger', rarity: 'common', quantity: 1, category: 'gear', weight: 3,
        name: { pl: 'Zardzewiały sztylet', en: 'Rusty dagger' } },
    ],
    medium: [
      { id: 'silver_coins', rarity: 'common', quantity: '2d10 SK', category: 'gold', weight: 4,
        name: { pl: 'Srebrne korony', en: 'Silver crowns' } },
      { id: 'silver_locket', rarity: 'uncommon', quantity: 1, category: 'trinket', weight: 3,
        name: { pl: 'Srebrny medalion', en: 'Silver locket' } },
      { id: 'healing_potion', rarity: 'uncommon', quantity: '1d3', category: 'consumable', weight: 3,
        name: { pl: 'Mikstura leczenia', en: 'Healing potion' } },
      { id: 'ancestral_blade', rarity: 'uncommon', quantity: 1, category: 'gear', weight: 2,
        name: { pl: 'Oręż przodków', en: 'Ancestral blade' } },
      { id: 'scroll_light', rarity: 'uncommon', quantity: 1, category: 'consumable', weight: 2,
        name: { pl: 'Zwój Światła', en: 'Scroll of Light' } },
    ],
    hard: [
      { id: 'gold_coins', rarity: 'uncommon', quantity: '3d10 ZK', category: 'gold', weight: 4,
        name: { pl: 'Złote korony', en: 'Gold crowns' } },
      { id: 'noble_signet', rarity: 'rare', quantity: 1, category: 'trinket', weight: 3,
        name: { pl: 'Sygnet szlachecki', en: 'Noble signet ring' } },
      { id: 'enchanted_blade', rarity: 'rare', quantity: 1, category: 'gear', weight: 2,
        name: { pl: 'Zaczarowane ostrze', en: 'Enchanted blade' } },
      { id: 'scroll_exorcism', rarity: 'rare', quantity: 1, category: 'consumable', weight: 2,
        name: { pl: 'Zwój Egzorcyzmu', en: 'Scroll of Exorcism' } },
      { id: 'ancient_tome', rarity: 'rare', quantity: 1, category: 'trinket', weight: 2,
        name: { pl: 'Starożytny grymuar', en: 'Ancient grimoire' } },
    ],
  },
  cave: {
    easy: [
      { id: 'copper_coins', rarity: 'common', quantity: '2d8 MK', category: 'gold', weight: 4,
        name: { pl: 'Garść miedziaków', en: 'Handful of coppers' } },
      { id: 'raw_ore', rarity: 'common', quantity: '1d4', category: 'material', weight: 3,
        name: { pl: 'Surowa ruda', en: 'Raw ore' } },
      { id: 'animal_hide', rarity: 'common', quantity: '1d3', category: 'material', weight: 3,
        name: { pl: 'Skóra zwierzęca', en: 'Animal hide' } },
      { id: 'crude_club', rarity: 'common', quantity: 1, category: 'gear', weight: 2,
        name: { pl: 'Prymitywna maczuga', en: 'Crude club' } },
      { id: 'dried_mushrooms', rarity: 'common', quantity: '1d6', category: 'consumable', weight: 2,
        name: { pl: 'Suszone grzyby', en: 'Dried mushrooms' } },
    ],
    medium: [
      { id: 'silver_coins', rarity: 'common', quantity: '1d10 SK', category: 'gold', weight: 4,
        name: { pl: 'Srebrne korony', en: 'Silver crowns' } },
      { id: 'gem_rough', rarity: 'uncommon', quantity: '1d3', category: 'material', weight: 3,
        name: { pl: 'Surowy klejnot', en: 'Uncut gemstone' } },
      { id: 'hunter_bow', rarity: 'uncommon', quantity: 1, category: 'gear', weight: 2,
        name: { pl: 'Łowiecki łuk', en: 'Hunter\'s bow' } },
      { id: 'potion_endurance', rarity: 'uncommon', quantity: '1d2', category: 'consumable', weight: 3,
        name: { pl: 'Mikstura wytrzymałości', en: 'Potion of endurance' } },
      { id: 'rare_pelt', rarity: 'uncommon', quantity: 1, category: 'material', weight: 2,
        name: { pl: 'Rzadka skóra', en: 'Rare pelt' } },
    ],
    hard: [
      { id: 'gold_coins', rarity: 'uncommon', quantity: '2d8 ZK', category: 'gold', weight: 4,
        name: { pl: 'Złote korony', en: 'Gold crowns' } },
      { id: 'polished_gem', rarity: 'rare', quantity: '1d2', category: 'trinket', weight: 3,
        name: { pl: 'Oszlifowany klejnot', en: 'Polished gemstone' } },
      { id: 'legendary_weapon', rarity: 'rare', quantity: 1, category: 'gear', weight: 2,
        name: { pl: 'Legendarna broń', en: 'Legendary weapon' } },
      { id: 'dragon_scale', rarity: 'rare', quantity: '1d3', category: 'material', weight: 2,
        name: { pl: 'Smocza łuska', en: 'Dragon scale' } },
      { id: 'potion_giant', rarity: 'rare', quantity: 1, category: 'consumable', weight: 2,
        name: { pl: 'Mikstura siły olbrzyma', en: 'Potion of giant\'s strength' } },
    ],
  },
};

// ── PUZZLES ──
// Each: { id, label, solutionHint, stat, dc }
// Short prompt the premium can narrate literally. Solution requires the
// player to describe their approach; nano intent classifier picks up
// matches against `solutionHint` keywords.
export const PUZZLES = {
  catacomb: [
    { id: 'bone_lever', dc: 12, stat: 'sila', weight: 3,
      label: { pl: 'Dźwignia z kości', en: 'Bone lever' },
      solutionHint: {
        pl: 'Pociągnąć dźwignię ukrytą wśród rozsypanych czaszek (klucz: "kości", "czaszka", "dźwignia").',
        en: 'Pull the lever hidden among the scattered skulls (keywords: "bones", "skull", "lever").',
      } },
    { id: 'sigil_riddle', dc: 14, stat: 'inteligencja', weight: 3,
      label: { pl: 'Zagadka symboli', en: 'Sigil riddle' },
      solutionHint: {
        pl: 'Trzy sigile na płytach: słońce, księżyc, gwiazda. Naciskać w kolejności świtu (słońce → gwiazda → księżyc).',
        en: 'Three sigils on floor tiles: sun, moon, star. Press in order of dawn (sun → star → moon).',
      } },
    { id: 'weighted_stones', dc: 13, stat: 'inteligencja', weight: 2,
      label: { pl: 'Kamienie równowagi', en: 'Balanced stones' },
      solutionHint: {
        pl: 'Waga ma 3 kamienie. Przełożyć tak, by obie strony ważyły tyle samo (klucz: "waga", "równowaga").',
        en: 'A scale holds 3 stones. Rearrange them so both sides balance (keywords: "scale", "balance").',
      } },
    { id: 'prayer_echo', dc: 14, stat: 'wiedza_ogolna', weight: 2,
      label: { pl: 'Echo modlitwy', en: 'Prayer echo' },
      solutionHint: {
        pl: 'Powiedzieć na głos fragment starej modlitwy do Yeriali/Sernetha (klucz: "modlę się", "imię boga").',
        en: 'Speak aloud a fragment of an old prayer to Yeriala/Serneth (keywords: "I pray", "god\'s name").',
      } },
  ],
  cave: [
    { id: 'crystal_resonance', dc: 13, stat: 'inteligencja', weight: 3,
      label: { pl: 'Rezonans kryształów', en: 'Crystal resonance' },
      solutionHint: {
        pl: 'Uderzyć kryształy w kolejności od najniższego tonu (klucz: "uderzam", "najniższy").',
        en: 'Strike the crystals in order from lowest to highest tone (keywords: "strike", "lowest").',
      } },
    { id: 'water_flow', dc: 12, stat: 'inteligencja', weight: 3,
      label: { pl: 'Kierunek wody', en: 'Water flow' },
      solutionHint: {
        pl: 'Przekierować strumień przez kamienne rynny do suchego basenu (klucz: "woda", "strumień", "rynna").',
        en: 'Redirect the stream through stone channels into the dry basin (keywords: "water", "stream", "channel").',
      } },
    { id: 'mushroom_glow', dc: 14, stat: 'wiedza_o_naturze', weight: 2,
      label: { pl: 'Świecące grzyby', en: 'Glowing mushrooms' },
      solutionHint: {
        pl: 'Niebieskie grzyby świecą tylko w ciemności — zasłonić źródło światła (klucz: "ciemność", "zasłonić").',
        en: 'Blue mushrooms only glow in darkness — cover the light source (keywords: "darkness", "cover").',
      } },
    { id: 'cave_drawing', dc: 13, stat: 'spostrzegawczosc', weight: 2,
      label: { pl: 'Rysunki naskalne', en: 'Cave drawings' },
      solutionHint: {
        pl: 'Sekwencja zwierząt na ścianie — wilk, niedźwiedź, jeleń. Odtworzyć w tej kolejności na płytach (klucz: "rysunki", "zwierzęta").',
        en: 'A sequence of animals on the wall — wolf, bear, deer. Reproduce the order on the floor tiles (keywords: "drawings", "animals").',
      } },
  ],
};

// ── ENCOUNTERS ──
// Picks reference BESTIARY names (validated against `locations: ['jaskinia'|'ruiny']`
// and difficulty tier). `count` defaults to 1; treasure/boss rooms spike.
// Skip-chance = 0 means always an encounter; higher skip-chance = room often empty.
// Bestiary names are monolingual (Polish canonical) — Phase 8+ may introduce
// multilingual bestiary, at which point these references stay stable.
export const ENCOUNTERS = {
  catacomb: {
    easy: {
      skipChance: 0.3,
      choices: [
        { bestiary: 'Zombie', count: '1d3', weight: 4 },
        { bestiary: 'Szkielet Wojownik', count: '1d2', weight: 3 },
        { bestiary: 'Szczur Olbrzymi', count: '2d3', weight: 2 },
      ],
    },
    medium: {
      skipChance: 0.2,
      choices: [
        { bestiary: 'Upiór', count: '1d2+1', weight: 4 },
        { bestiary: 'Duch', count: 1, weight: 2 },
        { bestiary: 'Bandyta', count: '1d2+1', weight: 3 },
      ],
    },
    hard: {
      skipChance: 0.1,
      choices: [
        { bestiary: 'Demon Cieni', count: 1, weight: 3 },
        { bestiary: 'Pomniejszy Demon', count: '1d2', weight: 3 },
        { bestiary: 'Demon Ognia', count: 1, weight: 2 },
      ],
    },
  },
  cave: {
    easy: {
      skipChance: 0.3,
      choices: [
        { bestiary: 'Goblin', count: '1d3+1', weight: 4 },
        { bestiary: 'Pająk Leśny', count: '1d2+1', weight: 3 },
        { bestiary: 'Szczur Olbrzymi', count: '2d3', weight: 2 },
      ],
    },
    medium: {
      skipChance: 0.2,
      choices: [
        { bestiary: 'Ork Wojownik', count: '1d2+1', weight: 4 },
        { bestiary: 'Pająk Olbrzymi', count: 1, weight: 3 },
        { bestiary: 'Krasnolud Wojownik', count: '1d2', weight: 2 },
      ],
    },
    hard: {
      skipChance: 0.1,
      choices: [
        { bestiary: 'Ork Wódz', count: 1, weight: 3 },
        { bestiary: 'Królowa Pająków', count: 1, weight: 3 },
        { bestiary: 'Troll Jaskiniowy', count: 1, weight: 2 },
      ],
    },
  },
};

// ── FLAVOR SEEDS ──
// One-sentence atmospheric hints injected into the DUNGEON ROOM prompt.
// Purpose: give the AI a specific sensory cue per room so scenes don't
// collapse into "you see stone walls" x50. Picked by role + theme. Every
// entry is an i18n map.
export const FLAVOR = {
  catacomb: {
    entrance: [
      { pl: 'Ciężkie wrota wykute z czarnego kamienia, pokryte runami nagrobnymi.',
        en: 'Heavy doors cut from black stone, covered in tombstone runes.' },
      { pl: 'Stopnie prowadzą w dół, pokryte warstwą pyłu i rozsypanymi kośćmi.',
        en: 'Steps lead downward, coated in dust and scattered bones.' },
      { pl: 'Oślepiający zapach wilgotnego grobu uderza od razu.',
        en: 'A choking smell of damp grave hits you immediately.' },
    ],
    normal: [
      { pl: 'Półki wzdłuż ścian wypełnione czaszkami ułożonymi w starannych rzędach.',
        en: 'Shelves along the walls are lined with skulls in neat rows.' },
      { pl: 'W kącie komory stoi zapomniany sarkofag z wyrytym imieniem.',
        en: 'A forgotten sarcophagus stands in the corner, a name carved on its lid.' },
      { pl: 'Ze sklepienia zwisają zmurszałe flagi dawno zapomnianego rodu.',
        en: 'Moldering banners of a long-forgotten house hang from the vault.' },
      { pl: 'Suche powietrze nosi słaby zapach kadzidła — ktoś modlił się tu niedawno.',
        en: 'Dry air carries a faint scent of incense — someone prayed here recently.' },
      { pl: 'Fragmenty zbroi sterczą z rumowiska pod przeciwległą ścianą.',
        en: 'Armor fragments jut from a pile of rubble against the far wall.' },
    ],
    treasure: [
      { pl: 'Pośrodku komory stoi marmurowa skrzynia, częściowo zasłonięta pajęczyną.',
        en: 'A marble chest stands at the center of the room, half-draped in cobwebs.' },
      { pl: 'Na kamiennym ołtarzu mieni się złocony relikwiarz.',
        en: 'A gilded reliquary gleams on a stone altar.' },
      { pl: 'Na postumencie leży kruszejąca księga oprawiona w skórę.',
        en: 'A crumbling leather-bound book rests on a pedestal.' },
    ],
    puzzle: [
      { pl: 'Płyta podłogi ma wyryte trzy sigile świetlistych bóstw.',
        en: 'A floor plate is etched with three sigils of luminous deities.' },
      { pl: 'Ściany zdobią freski przedstawiające procesję modlitwy.',
        en: 'Frescoes on the walls depict a procession of prayer.' },
    ],
    boss: [
      { pl: 'Komora wznosi się w masywną kopułę. W centrum — trumna z pęknięciem, z której sączy się chłód.',
        en: 'The chamber rises into a massive dome. At the center, a cracked coffin seeps cold air.' },
      { pl: 'Gigantyczny tron wyrzeźbiony z kości spogląda na drzwi. Ktoś na nim siedzi.',
        en: 'A giant throne carved from bone faces the entrance. Someone is seated on it.' },
    ],
  },
  cave: {
    entrance: [
      { pl: 'Naturalne wejście — szczelina w skale ledwo przepuszczająca światło dzienne.',
        en: 'A natural entrance — a cleft in the rock barely admitting daylight.' },
      { pl: 'Korzenie zwisają z sufitu, splątane z kryształami kalcytu.',
        en: 'Roots dangle from the ceiling, tangled with calcite crystals.' },
      { pl: 'Wilgotny chłód i kapanie wody w oddali.',
        en: 'Damp cold and the drip of water somewhere in the distance.' },
    ],
    normal: [
      { pl: 'Ściany pokryte są niebiesko-zielonym mchem, który lekko fosforyzuje.',
        en: 'The walls are coated in blue-green moss that faintly phosphoresces.' },
      { pl: 'Mała sadzawka wody odbija sufit z kryształami.',
        en: 'A small pool of water mirrors the crystal-studded ceiling.' },
      { pl: 'Wypalona kostra ogniska pośrodku — ktoś obozował tu niedawno.',
        en: 'A burnt-out campfire sits in the middle — someone camped here recently.' },
      { pl: 'Nietoperze poruszają się w mroku sufitu.',
        en: 'Bats shift in the darkness of the ceiling.' },
      { pl: 'Strużka wody spływa po ścianie, pozostawiając białe ślady osadu.',
        en: 'A trickle of water runs down the wall, leaving pale mineral streaks.' },
    ],
    treasure: [
      { pl: 'W załomie skalnym leży stary plecak, częściowo pochłonięty przez mech.',
        en: 'An old backpack lies in a rocky alcove, half-swallowed by moss.' },
      { pl: 'Skrzynka ukryta za stalagmitami — ktoś zostawił ją w pośpiechu.',
        en: 'A small chest hidden behind stalagmites — someone left it in a hurry.' },
      { pl: 'Złocone żyły kruszcu biegną przez ścianę komory.',
        en: 'Golden veins of ore run through the chamber wall.' },
    ],
    puzzle: [
      { pl: 'Stalaktyty rozmieszczone regularnie, jakby ktoś je celowo ukształtował.',
        en: 'Stalactites arranged too regularly — as though someone shaped them on purpose.' },
      { pl: 'Sekwencja rysunków naskalnych prowadzi wzdłuż ściany.',
        en: 'A sequence of cave drawings runs along the wall.' },
    ],
    boss: [
      { pl: 'Ogromna pieczara z podziemnym jeziorem. Coś się w nim porusza.',
        en: 'A vast cavern with an underground lake. Something moves within it.' },
      { pl: 'Wielka sieć pajęcza wypełnia komorę od ściany do ściany.',
        en: 'A massive web fills the chamber from wall to wall.' },
    ],
  },
};

export const DUNGEON_THEMES = Object.keys(TRAPS);
export const DUNGEON_DIFFICULTIES = ['easy', 'medium', 'hard'];
