import { describe, it, expect } from 'vitest';
import { detectTravelIntent, detectDungeonNavigateIntent, classifyIntentHeuristic } from './intentClassifier.js';

describe('intentClassifier — detectTravelIntent', () => {
  it('matches Polish "idę do X"', () => {
    expect(detectTravelIntent('Idę do Watonga')).toEqual({ target: 'Watonga' });
  });

  it('matches Polish "wyruszam do X"', () => {
    expect(detectTravelIntent('Wyruszam do Avaltro o świcie')).toEqual({ target: 'Avaltro' });
  });

  it('matches multi-word location names', () => {
    expect(detectTravelIntent('Jadę do Czarnego Lasu')).toEqual({ target: 'Czarnego Lasu' });
  });

  it('matches English "travel to X"', () => {
    expect(detectTravelIntent('I travel to Watonga')).toEqual({ target: 'Watonga' });
  });

  it('matches "go to X"', () => {
    expect(detectTravelIntent('I go to Yeralden')).toEqual({ target: 'Yeralden' });
  });

  it('rejects lowercase targets (prevents "idę do domu" false positive)', () => {
    expect(detectTravelIntent('idę do domu')).toBeNull();
    expect(detectTravelIntent('idę do lasu')).toBeNull();
  });

  it('returns null for non-travel actions', () => {
    expect(detectTravelIntent('atakuję strażnika')).toBeNull();
    expect(detectTravelIntent('szukam skarbu')).toBeNull();
    expect(detectTravelIntent('')).toBeNull();
    expect(detectTravelIntent(null)).toBeNull();
  });

  it('strips trailing punctuation from target', () => {
    expect(detectTravelIntent('Idę do Watonga.')).toEqual({ target: 'Watonga' });
    expect(detectTravelIntent('Idę do Watonga, bo jest noc')).toEqual({ target: 'Watonga' });
  });
});

describe('intentClassifier — classifyIntentHeuristic travel flow', () => {
  it('flags travel intent with _travelTarget', () => {
    const result = classifyIntentHeuristic('Wyruszam do Avaltro');
    expect(result).not.toBeNull();
    expect(result._intent).toBe('travel');
    expect(result._travelTarget).toBe('Avaltro');
    expect(result.expand_location).toBe(true);
  });

  it('combat intent takes precedence over travel when present', () => {
    // "atakuję" is detected by detectCombatIntent before travel regex runs
    const result = classifyIntentHeuristic('atakuję strażników idąc do Watonga');
    expect(result?._intent).toBe('combat');
  });
});

describe('intentClassifier — detectDungeonNavigateIntent', () => {
  it('matches "idę na północ"', () => {
    expect(detectDungeonNavigateIntent('Idę na północ')).toEqual({ direction: 'N' });
  });

  it('matches "otwieram drzwi na wschód"', () => {
    expect(detectDungeonNavigateIntent('Otwieram drzwi na wschód')).toEqual({ direction: 'E' });
  });

  it('matches "schodzę w dół"', () => {
    expect(detectDungeonNavigateIntent('Schodzę w dół po schodach')).toEqual({ direction: 'down' });
  });

  it('matches "go north"', () => {
    expect(detectDungeonNavigateIntent('I go north through the door')).toEqual({ direction: 'N' });
  });

  it('matches "walk south"', () => {
    expect(detectDungeonNavigateIntent('I walk south carefully')).toEqual({ direction: 'S' });
  });

  it('matches "climb up"', () => {
    expect(detectDungeonNavigateIntent('I climb up the stairs')).toEqual({ direction: 'up' });
  });

  it('returns null without a direction', () => {
    expect(detectDungeonNavigateIntent('Idę dalej')).toBeNull();
    expect(detectDungeonNavigateIntent('Rozglądam się')).toBeNull();
  });

  it('returns null for non-navigation verbs', () => {
    expect(detectDungeonNavigateIntent('Północ jest daleko')).toBeNull();
    expect(detectDungeonNavigateIntent('')).toBeNull();
    expect(detectDungeonNavigateIntent(null)).toBeNull();
  });
});

describe('intentClassifier — classifyIntentHeuristic dungeon_navigate flow', () => {
  it('flags dungeon navigation with _dungeonDirection', () => {
    const result = classifyIntentHeuristic('Idę na północ');
    expect(result).not.toBeNull();
    expect(result._intent).toBe('dungeon_navigate');
    expect(result._dungeonDirection).toBe('N');
  });
});

describe('classifyIntentHeuristic — combat false-positives', () => {
  // These MUST NOT trigger _intent: 'combat'. They are discussions,
  // questions, or hypotheticals — the freeform nano classifier should
  // pick them up with full context, not the heuristic shortcut.
  const cases = [
    'powiedz mi więcej bo chciałbym wiedzieć jakbym miał z kimś walczyć w ściekach',
    'co się stanie jeśli zaatakuję bandytę?',
    'opowiedz mi o walkach z trollem',
    'jak walczyć z ogrem?',
    'chciałbym wiedzieć jakbym miał walczyć',
    'gdybym dobył miecza, co zrobiłby strażnik?',
    'wyobraź sobie walkę z demonem',
    'hipotetycznie atakuję kupca',
    'pytam karczmarza o walki z bandytami',
    'boję się ataku',
  ];
  for (const action of cases) {
    it(`does not classify as combat: "${action}"`, () => {
      const result = classifyIntentHeuristic(action);
      // Must either return null (fallthrough to nano) OR a non-combat intent.
      if (result !== null) {
        expect(result._intent).not.toBe('combat');
      }
    });
  }
});

describe('classifyIntentHeuristic — combat true-positives (regression)', () => {
  const cases = [
    'atakuję strażnika',
    '[INITIATE COMBAT]',
    '[ATTACK:Kowal]',
    'dobywam miecza i ruszam na bandytę',
    'I attack the guard',
  ];
  for (const action of cases) {
    it(`classifies as combat: "${action}"`, () => {
      const result = classifyIntentHeuristic(action);
      expect(result?._intent).toBe('combat');
    });
  }
});

describe('classifyIntentHeuristic — trade false-positives', () => {
  // User-reported case: "Czy potrzebujesz kompanii żeby pokonać smoka?"
  // previously triggered trade shortcut. None of these should fire trade.
  const cases = [
    'czy potrzebujesz kompanii żeby pokonać smoka?',
    'opowiedz mi o handlu w tym mieście',
    'czy mógłbym kupić miksturę?',
    'jak targować się ze skąpcami?',
    'gdybym sprzedał swój miecz, co bym dostał?',
    'zastanawiam się czy nie kupić konia',
    'czy sklep jest otwarty?',
    'boję się handlarzy niewolnikami',
  ];
  for (const action of cases) {
    it(`does not classify as trade: "${action}"`, () => {
      const result = classifyIntentHeuristic(action);
      if (result !== null) {
        expect(result._intent).not.toBe('trade');
        expect(result._tradeOnly).not.toBe(true);
      }
    });
  }
});

describe('classifyIntentHeuristic — trade true-positives (regression)', () => {
  const cases = [
    'kupuję miecz',
    'sprzedaję złom u kowala',
    'handluję z karczmarzem',
    'I want to buy a sword',
    'targuję się z kupcem o 10 złotych',
  ];
  for (const action of cases) {
    it(`classifies as trade: "${action}"`, () => {
      const result = classifyIntentHeuristic(action);
      expect(result?._intent).toBe('trade');
      expect(result?._tradeOnly).toBe(true);
    });
  }
});
