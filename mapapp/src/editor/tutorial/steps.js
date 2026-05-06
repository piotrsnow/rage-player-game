// Declarative tutorial steps for the Map Editor.
//
// Each step:
//   id       — stable key, used for dedupe + localStorage analytics
//   title    — short label shown in the checklist
//   body     — Polish copy shown when this step is active
//   targetId — value of data-tutorial-id on the DOM element to spotlight
//              (null → no ring; used for the final "done" card)
//   predicate(editorState) — if defined, returning true auto-advances
//   manual   — if true, no predicate; user clicks "Dalej" / "Pomiń"
//
// Predicates only receive the editor store state, so the list stays
// trivially serialisable and testable.

export const EDITOR_STEPS = [
  {
    id: 'pack',
    title: 'Wybierz paczkę kafelków',
    body:
      'W lewym panelu w sekcji "Packs" zaznacz przynajmniej jedną paczkę. ' +
      'Jeśli lista jest pusta, dodaj paczkę w Studio — samouczek poczeka.',
    targetId: 'packs-section',
    predicate: (s) => Array.isArray(s.packIds) && s.packIds.length > 0,
  },
  {
    id: 'tile',
    title: 'Kliknij kafelek w Palecie',
    body:
      'Z prawej strony otwiera się Paleta. Kliknij dowolny kafelek — ' +
      'zostanie aktywnym pędzlem do malowania.',
    targetId: 'palette-right',
    predicate: (s) => typeof s.selectedPaletteIndex === 'number' && s.selectedPaletteIndex >= 0,
  },
  {
    id: 'brush',
    title: 'Wybierz narzędzie Brush',
    body:
      'U góry wybierz narzędzie "Brush" (albo naciśnij klawisz B). ' +
      'To podstawowe narzędzie do malowania pojedynczych kafli.',
    targetId: 'tool-brush',
    predicate: (s) => s.tool === 'brush',
  },
  {
    id: 'paint',
    title: 'Namaluj coś na mapie',
    body:
      'Klikaj lub przeciągaj lewym przyciskiem myszy po płótnie, żeby ' +
      'malować. Prawy przycisk wymazuje. Ctrl+Z cofa całe pociągnięcie.',
    targetId: 'map-canvas',
    predicate: (s) => (Array.isArray(s.history) && s.history.length > 0) || s.dirty,
  },
  {
    id: 'layer',
    title: 'Przełącz warstwę',
    body:
      'Edytor ma trzy warstwy: ground, overlay, objects. Przełącz się na ' +
      '"overlay" (klawisz 2) — tam rysujesz obiekty nad podłożem.',
    targetId: 'layers-panel',
    predicate: (s) => s.activeLayer && s.activeLayer !== 'ground',
  },
  {
    id: 'autotile',
    title: 'Poznaj Autotile (opcjonalnie)',
    body:
      'Narzędzie Autotile (A) automatycznie łączy sąsiadujące kafle z tej ' +
      'samej grupy, obliczając krawędzie i rogi. Wymaga tilesetu z grupami ' +
      'autotile — jeśli nie masz, po prostu kliknij "Dalej".',
    targetId: 'tool-autotile',
    manual: true,
  },
  {
    id: 'actors',
    title: 'Postaw punkt startu gracza',
    body:
      'Wybierz narzędzie "Start" (P) i kliknij na mapie, żeby ustawić ' +
      'miejsce, w którym gracz pojawia się po wejściu na tę mapę. ' +
      'Opcjonalnie: "NPC place" (N) dodaje punkty spawnu NPC.',
    targetId: 'tool-playerStart',
    predicate: (s) =>
      Array.isArray(s.objects) && s.objects.some((o) => o && o.kind === 'player_start'),
  },
  {
    id: 'save',
    title: 'Zapisz mapę',
    body:
      'Kliknij "Save" w lewym górnym rogu (lub Ctrl+S). Po zapisie ' +
      'odblokowuje się przycisk "▶ Play" — możesz przejść mapę postacią.',
    targetId: 'save-button',
    predicate: (s) => !!s.mapId && !s.dirty,
  },
  {
    id: 'done',
    title: 'Gotowe!',
    body:
      'Znasz podstawy edytora. Pełną listę skrótów klawiszowych otworzysz ' +
      'klawiszem "?" w dowolnym momencie. Samouczek możesz wznowić ' +
      'przyciskiem "Tutorial" w pasku statusu na dole.',
    targetId: null,
    manual: true,
    isFinal: true,
  },
];
