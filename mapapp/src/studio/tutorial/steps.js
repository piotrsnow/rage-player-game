// Declarative tutorial steps for the Tileset Studio.
//
// Predicates receive the `useStudioStore` state. Anchors referenced by
// `targetId` are placed in `StudioPage.jsx` via `data-tutorial-id="..."`.

export const STUDIO_STEPS = [
  {
    id: 'upload',
    title: 'Zaimportuj tileset',
    body:
      'Po prawej znajdziesz pole upload — wrzuć na nie PNG z tilesetem ' +
      'albo zaimportuj gotową paczkę ZIP z lewego paska.',
    targetId: 'studio-upload',
    predicate: (s) => Array.isArray(s.tilesets) && s.tilesets.length > 0,
  },
  {
    id: 'pickPack',
    title: 'Wybierz paczkę',
    body:
      'Kliknij paczkę w lewym pasku "Packs" — to kontener na tilesety, ' +
      'reguły i grupy autotile.',
    targetId: 'studio-packs',
    predicate: (s) => s.selectedPackId !== null && s.selectedPackId !== undefined,
  },
  {
    id: 'pickTileset',
    title: 'Wybierz tileset',
    body:
      'Paczka może mieć kilka tilesetów. Kliknij zakładkę tilesetu — ' +
      'pod spodem pojawi się jego siatka kafli.',
    targetId: 'studio-tileset-tabs',
    predicate: (s) => s.selectedTilesetId !== null && s.selectedTilesetId !== undefined,
  },
  {
    id: 'autodetect',
    title: 'Auto-detect A1/A2 (opcjonalnie)',
    body:
      'Jeśli tileset jest w formacie RPG Maker A1/A2, kliknij "Auto-detect ' +
      'A1/A2 groups" — wykryje krawędzie i rogi autotile za ciebie. ' +
      'Jeśli nie dotyczy, po prostu kliknij "Dalej".',
    targetId: 'studio-autodetect',
    manual: true,
  },
  {
    id: 'pickTile',
    title: 'Zaznacz kafelek',
    body:
      'Kliknij dowolny kafel w siatce (Shift/Ctrl = wielokrotny wybór). ' +
      'Wybrane kafle otworzą się w prawym inspektorze.',
    targetId: 'studio-tilegrid',
    predicate: (s) => s.selection && s.selection.size > 0,
  },
  {
    id: 'inspect',
    title: 'Oznacz kafle atomami',
    body:
      'W prawym panelu ustaw atomy (np. wall, water, door) i traits — ' +
      'to reguły określające, jak kafel zachowuje się po wrzuceniu go na ' +
      'mapę w edytorze.',
    targetId: 'studio-inspector',
    manual: true,
  },
  {
    id: 'rules',
    title: 'Reguły (opcjonalnie)',
    body:
      'W sekcji "Rules" edytujesz reguły animacji i wariantów tilesetu. ' +
      'Możesz pominąć, jeśli nie używasz animowanych kafli.',
    targetId: 'studio-rules',
    manual: true,
  },
  {
    id: 'done',
    title: 'Gotowe!',
    body:
      'Tileset jest oznaczony i gotowy do użycia. Przejdź do edytora map ' +
      'i dodaj paczkę w panelu "Packs" — kafle pojawią się w Palecie.',
    targetId: null,
    manual: true,
    isFinal: true,
  },
];
