export default {
  id: 'central_european',
  label: 'Central European',

  promptBlock: `NAMING CONVENTION — world aesthetic: Central-Eastern European dark fantasy.
All NEW location names, sublocation names, and NPC names MUST follow this convention:
- Settlements: Hungarian/Balkan/German-flavoured (Steinveld, Dolhrad, Brennstadt, Kronburg). Mix Slavic + Germanic roots freely. NO modern Polish village names (no -ice, -ów, -owo suffixes).
- Sublocations: use flavour words — Czarda (tavern), Tempel (temple), Grossmarkt (market), Turm (tower), Halle (hall), Brücke (bridge), Krypta (crypt). Combine with evocative modifiers ("Czarda Pod Srebrnym Rogiem", "Turm des Meisters").
- NPCs: Central-European given names — Aldric, Beren, Istvan, Dragan, Magda, Ilka, Zoltan, Havel, Sorin, Valdis. Surnames optional; if used: trade-based (Kowalcz, Steinmetz) or geographic (z Dolhradu). NO modern Polish names (Janusz, Krzysztof, Bożena, Andrzej).
- Wilderness/dungeons/ruins: atmospheric German/Slavic roots — Czernwald, Wachsteine, Sturmklamm, Drachenfels.
- Consistency: once a name appears in dialogue or narration, reuse it verbatim. Never rename.`,

  nameBanks: {
    hamlet: [
      'Dornhag', 'Felvald', 'Grünbach', 'Kohlhütt', 'Rotvald',
      'Eisborn', 'Birkfeld', 'Sumpfhag', 'Windmühl', 'Kiesgrub',
      'Moosweiler', 'Tannhag', 'Rabengrund', 'Erlenbach', 'Waldstein',
      'Brachfeld', 'Schilfdorf', 'Kupferstein', 'Holzhag', 'Schwarzbach',
      'Grauhof', 'Tiefental', 'Aschfeld', 'Bärenhag', 'Frosthain',
      'Lärchenhütt', 'Salzgrund', 'Moorweiler', 'Steinbruch', 'Farnhag',
    ],
    village: [
      'Steinveld', 'Breitental', 'Kaltenberg', 'Rabenhof', 'Dreieichen',
      'Schwarzmoor', 'Falkenstein', 'Silberbach', 'Hochfeld', 'Eisenweiler',
      'Dunkelhain', 'Grauweiler', 'Rehberg', 'Lindental', 'Kupferberg',
      'Birkenwalde', 'Sturmfeld', 'Drachental', 'Nebelstein', 'Wolfsbach',
      'Harzburg', 'Rosenfeld', 'Eschenwalde', 'Grüntal', 'Felsberg',
      'Weidenau', 'Torfmoor', 'Lichtenstein', 'Blutbach', 'Krahental',
    ],
    town: [
      'Dolhrad', 'Brennstadt', 'Silbergrád', 'Kronhain', 'Eisenstadt',
      'Schwarzburg', 'Weissenturm', 'Sturmstadt', 'Falkenhain', 'Grauburg',
      'Kupferstadt', 'Hohenmark', 'Drachenburg', 'Rabenstadt', 'Nebelburg',
      'Steinmark', 'Bluthain', 'Wolfsburg', 'Dunkelstadt', 'Lichthain',
      'Erlenstadt', 'Bärenburg', 'Hochburg', 'Kaltstadt', 'Lindenburg',
      'Salzstadt', 'Morgenstadt', 'Frostburg', 'Aschenburg', 'Tiefenstadt',
    ],
    city: [
      'Silberstadt', 'Kronburg', 'Eisenthron', 'Drachenhain', 'Hochstadt',
      'Sturmkrone', 'Blutburg', 'Weissenburg', 'Schwarzthron', 'Falkenstadt',
      'Goldhain', 'Nebelkrone', 'Kupferthron', 'Rabenthron', 'Steinburg',
      'Dunkelkrone', 'Wolfskrone', 'Lichtburg', 'Frostthron', 'Grauthron',
    ],
  },

  sublocationExamples: {
    good: '"Turm des Meisters", "Czarda Pod Srebrnym Rogiem", "Tempel der Asche"',
    bad: '"dom", "chata", "sklep"',
  },

  npcNameExamples: {
    good: 'Aldric, Beren, Istvan, Dragan, Magda, Ilka, Zoltan, Havel',
    bad: 'Janusz, Krzysztof, Bożena, Andrzej',
  },
};
