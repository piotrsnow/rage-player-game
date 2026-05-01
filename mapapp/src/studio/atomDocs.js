// atomDocs — single source of truth for human-readable descriptions of
// every tile atom, trait key, autotile layout and rule "via" mode.
//
// Consumed by:
//   TileInspector      — tooltips on atom chips + trait rows
//   AutotileGroupPicker— layout dropdown explainers
//   RulesEditor        — via dropdown + RuleRow trait previews
//   OntologyIntroCard  — onboarding summary
//
// Keep copy in Polish (UI language per AGENTS.md). Keep keys stable —
// the ATOM_DOCS key set mirrors shared/mapSchemas/atoms.js.

export const ATOM_GROUPS = {
  passability: { labelPl: 'Przechodzenie', descPl: 'Czy bohater może wejść na kafel i jak się on zachowuje fizycznie.' },
  structure: { labelPl: 'Struktura', descPl: 'Rola kafla w budynku/otoczeniu (ściana, podłoga, drzwi…).' },
  edge: { labelPl: 'Krawędzie', descPl: '8 kierunków styku biomu z sąsiednim biomem. Używane do budowania rogów/brzegów.' },
  role: { labelPl: 'Rola w zestawie', descPl: 'Gdzie dany kafel ląduje w grupie autotile (narożnik, krawędź, wklęsły narożnik, wypełnienie).' },
  layer: { labelPl: 'Warstwa w edytorze', descPl: 'Sugestia dla edytora mapy: na której warstwie kafel domyślnie ma wylądować.' },
};

export const ATOM_DOCS = {
  // Passability
  solid: {
    labelPl: 'Blokuje',
    descPl: 'Kafel jest stały — bohater nie może przez niego przejść. Typowo ściany, duże skały, woda bez brodu.',
    group: 'passability',
    diagram: { preset: 'fill' },
  },
  walkable: {
    labelPl: 'Przechodni',
    descPl: 'Kafel jest przechodni — bohater swobodnie na niego wchodzi. Trawa, ścieżka, podłoga.',
    group: 'passability',
    diagram: { highlight: { center: true } },
  },
  water: {
    labelPl: 'Woda',
    descPl: 'Kafel jest wodą. Engine używa tego do animacji, pływania, zatrzymania ruchu lądowego.',
    group: 'passability',
    diagram: { preset: 'fill' },
  },
  hazard: {
    labelPl: 'Pułapka',
    descPl: 'Kafel zadaje obrażenia / ma negatywny efekt (lawa, kolce). Zazwyczaj też blokuje lub jest przechodni zależnie od gry.',
    group: 'passability',
    diagram: { preset: 'fill' },
  },

  // Structure
  wall: {
    labelPl: 'Ściana',
    descPl: 'Element ściany — blokuje ruch, może mieć krawędzie NE/NW/SE/SW dla narożników.',
    group: 'structure',
    diagram: { preset: 'fill' },
  },
  floor: {
    labelPl: 'Podłoga',
    descPl: 'Podłoga wewnątrz budynku. Przechodzi pod nakładką.',
    group: 'structure',
    diagram: { highlight: { center: true } },
  },
  door: {
    labelPl: 'Drzwi',
    descPl: 'Drzwi — interaktywne, mogą blokować lub otwierać przejście.',
    group: 'structure',
    diagram: { highlight: { center: true, N: true } },
  },
  window: {
    labelPl: 'Okno',
    descPl: 'Okno w ścianie — widoczność tak, ruch nie.',
    group: 'structure',
    diagram: { highlight: { center: true } },
  },
  stairs: {
    labelPl: 'Schody',
    descPl: 'Schody — zmiana warstwy/poziomu albo wizualny skrót między piętrami.',
    group: 'structure',
    diagram: { highlight: { N: true, center: true, S: true } },
  },

  // Edges
  edge_N: {
    labelPl: 'Od północy',
    descPl: 'Kafel ma krawędź od strony północnej — biom kończy się tu, dalej jest inny.',
    group: 'edge',
    diagram: { highlight: { N: true } },
  },
  edge_E: {
    labelPl: 'Od wschodu',
    descPl: 'Kafel ma krawędź od wschodu.',
    group: 'edge',
    diagram: { highlight: { E: true } },
  },
  edge_S: {
    labelPl: 'Od południa',
    descPl: 'Kafel ma krawędź od południa.',
    group: 'edge',
    diagram: { highlight: { S: true } },
  },
  edge_W: {
    labelPl: 'Od zachodu',
    descPl: 'Kafel ma krawędź od zachodu.',
    group: 'edge',
    diagram: { highlight: { W: true } },
  },
  edge_NE: {
    labelPl: 'Róg NE',
    descPl: 'Kafel rogu północno-wschodniego — styk biomów po skosie.',
    group: 'edge',
    diagram: { highlight: { NE: true } },
  },
  edge_NW: {
    labelPl: 'Róg NW',
    descPl: 'Kafel rogu północno-zachodniego.',
    group: 'edge',
    diagram: { highlight: { NW: true } },
  },
  edge_SE: {
    labelPl: 'Róg SE',
    descPl: 'Kafel rogu południowo-wschodniego.',
    group: 'edge',
    diagram: { highlight: { SE: true } },
  },
  edge_SW: {
    labelPl: 'Róg SW',
    descPl: 'Kafel rogu południowo-zachodniego.',
    group: 'edge',
    diagram: { highlight: { SW: true } },
  },

  // Roles
  autotile_role_corner: {
    labelPl: 'Narożnik',
    descPl: 'Kafel jest rogiem grupy autotile — stosowany na skrajach biomu.',
    group: 'role',
    diagram: { preset: 'corner' },
  },
  autotile_role_edge: {
    labelPl: 'Krawędź',
    descPl: 'Kafel jest bokiem grupy autotile — łączy wnętrze z zewnętrzem wzdłuż jednej osi.',
    group: 'role',
    diagram: { preset: 'edge' },
  },
  autotile_role_inner: {
    labelPl: 'Wklęsły narożnik',
    descPl: 'Kafel jest środkiem grupy (typowo wklęsłe rogi — "wycięte" z wypełnienia).',
    group: 'role',
    diagram: { preset: 'inner' },
  },
  autotile_role_fill: {
    labelPl: 'Wypełnienie',
    descPl: 'Kafel bazowy biomu — wnętrze obszaru, pełna powierzchnia.',
    group: 'role',
    diagram: { preset: 'fill' },
  },

  // Layer hints
  layer_hint_ground: {
    labelPl: 'Ziemia',
    descPl: 'Edytor domyślnie umieści kafel na warstwie ziemi (pod postaciami i nakładkami).',
    group: 'layer',
    diagram: { highlight: { center: true } },
  },
  layer_hint_overlay: {
    labelPl: 'Nakładka',
    descPl: 'Kafel ląduje na warstwie nakładki (nad ziemią, pod obiektami — np. trawa, kwiaty).',
    group: 'layer',
    diagram: { highlight: { center: true } },
  },
  layer_hint_object: {
    labelPl: 'Obiekt',
    descPl: 'Kafel to obiekt (drzewo, budynek) — najwyższa warstwa, zasłania postać.',
    group: 'layer',
    diagram: { highlight: { N: true, center: true } },
  },
};

export const TRAIT_DOCS = {
  biome: {
    labelPl: 'Podłoże',
    descPl: 'Typ terenu (grass, sand, water, stone, snow…). Podstawowa cecha dla reguł połączeń między kaflami.',
    examples: ['grass', 'sand', 'water', 'stone', 'snow', 'dirt'],
  },
  material: {
    labelPl: 'Materiał',
    descPl: 'Fizyczny materiał (wood, brick, metal, tile, thatch). Używany w budynkach i obiektach.',
    examples: ['wood', 'brick', 'stone', 'metal', 'thatch'],
  },
  theme: {
    labelPl: 'Klimat',
    descPl: 'Stylistyczna rodzina (medieval, dungeon, forest, desert). Dla doboru wizualnie pasujących packów.',
    examples: ['medieval', 'dungeon', 'forest', 'ruin'],
  },
  style: {
    labelPl: 'Styl',
    descPl: 'Artystyczny kierunek (pixel, hand-drawn, rpg_maker). Rzadko zmieniany per kafel.',
    examples: ['rpg_maker', 'pixel', 'hd'],
  },
  climate: {
    labelPl: 'Strefa',
    descPl: 'Strefa klimatyczna (temperate, tropical, arctic). Wspiera generowanie spójnych regionów.',
    examples: ['temperate', 'arctic', 'tropical', 'arid'],
  },
};

export const LAYOUT_DOCS = {
  rpgmaker_a1: {
    labelPl: 'RPG Maker A1',
    descPl: 'Animowany blok 2×3 dla wody/lawy. 3 klatki animacji × 2 kolumny.',
    cols: 2, rows: 3,
  },
  rpgmaker_a2: {
    labelPl: 'RPG Maker A2',
    descPl: 'Blok 2×3 zawierający wszystkie warianty krawędzi i rogów biomu "blob". Standard RM dla gruntu.',
    cols: 2, rows: 3,
  },
  wang_2edge: {
    labelPl: 'Wang 2-edge',
    descPl: 'Układ 4×4 = 16 permutacji 4 krawędzi (N/E/S/W). Klasyk dla teren-granica-teren.',
    cols: 4, rows: 4,
  },
  blob_47: {
    labelPl: 'Blob 47',
    descPl: 'Pełny zestaw 47 blob-tiles (8×6 z kilkoma pustymi). Bogatszy niż A2 — ostre rogi + wklęsłości.',
    cols: 8, rows: 6,
  },
  custom: {
    labelPl: 'Custom',
    descPl: 'Ręcznie dobrany układ. Użyj, gdy tileset nie pasuje do żadnego standardu.',
    cols: 2, rows: 2,
  },
};

export const VIA_DOCS = {
  autotile_group: {
    labelPl: 'Przez grupę',
    descPl: 'Reguła korzysta z konkretnej grupy autotile — engine dobiera kafle z tej grupy po rolach (narożnik/krawędź/wklęsły/wypełnienie).',
    example: 'Trawa → Piasek przez grupę "Sand A2"',
  },
  wall_bitmask: {
    labelPl: 'Przez maskę ścian',
    descPl: 'Reguła korzysta z bitmaski 9-kierunkowej (0..511) dla systemu ścian. Każdy bit = sąsiad.',
    example: 'Ściana N+E+S = maska 74',
  },
};

export function atomDoc(atom) {
  return ATOM_DOCS[atom] || { labelPl: atom, descPl: '', group: null };
}

export function groupAtoms(atoms) {
  // Bucket a list of atoms by their `group` key. Unknown atoms go into
  // `_other` so they still render somewhere instead of being dropped.
  const buckets = { passability: [], structure: [], edge: [], role: [], layer: [], _other: [] };
  for (const a of atoms) {
    const g = ATOM_DOCS[a]?.group || '_other';
    if (!buckets[g]) buckets[g] = [];
    buckets[g].push(a);
  }
  return buckets;
}
