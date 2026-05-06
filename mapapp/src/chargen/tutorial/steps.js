// Declarative tutorial steps for the CharGen page.
//
// Predicates receive the `useChargenStore` state. Anchors referenced by
// `targetId` are placed in `CharGenPage.jsx` via `data-tutorial-id="..."`.
//
// Note: initial appearance is randomised on mount by `store.init()`, so
// the `race` step stays manual — the user can optionally pick a different
// race/config but isn't blocked if they don't.

export const CHARGEN_STEPS = [
  {
    id: 'race',
    title: 'Wybierz rasę i config',
    body:
      'Ustaw rasę i konfigurację (np. male/female) — config wpływa na ' +
      'to, które sloty ciała (body/head/hair/…) są dostępne. Możesz też ' +
      'zostawić domyślne losowe ustawienia.',
    targetId: 'chargen-race',
    manual: true,
  },
  {
    id: 'randomize',
    title: 'Eksperymentuj z wyglądem',
    body:
      'Kliknij "Randomize all" albo 🎲 przy pojedynczym slocie, żeby ' +
      'zobaczyć różne kombinacje. Każda zmiana odświeża podgląd po lewej.',
    targetId: 'chargen-randomize-all',
    predicate: (s) => s.dirty === true,
  },
  {
    id: 'slot',
    title: 'Dostosuj sloty',
    body:
      'W panelu slotów wybierasz indywidualnie body / head / hair / ' +
      'ekwipunek / broń. Każdy slot ma dropdown z przedmiotami i paletę ' +
      'kolorów.',
    targetId: 'chargen-slots',
    manual: true,
  },
  {
    id: 'name',
    title: 'Nadaj nazwę',
    body:
      'Wpisz nazwę postaci na górze — jest wymagana do zapisu.',
    targetId: 'chargen-name',
    predicate: (s) => typeof s.name === 'string' && s.name.trim().length > 0,
  },
  {
    id: 'tags',
    title: 'Dodaj tagi',
    body:
      'Wpisz tag i naciśnij Enter albo przecinek. Tagi służą do ' +
      'filtrowania w "Your actors" i do dopasowywania NPC w edytorze map ' +
      '(narzędzie NPC place).',
    targetId: 'chargen-tags',
    predicate: (s) => Array.isArray(s.tags) && s.tags.length > 0,
  },
  {
    id: 'save',
    title: 'Zapisz postać',
    body:
      'Kliknij Save — postać trafi do twojej biblioteki i będzie dostępna ' +
      'w edytorze map jako target narzędzia NPC place.',
    targetId: 'chargen-save',
    predicate: (s) => !!s.actorId && !s.dirty,
  },
  {
    id: 'done',
    title: 'Gotowe!',
    body:
      'Znajdziesz swoją postać w "Your actors" po lewej. Żeby wstawić ją ' +
      'na mapę, przejdź do edytora i użyj narzędzia NPC place (N).',
    targetId: null,
    manual: true,
    isFinal: true,
  },
];
