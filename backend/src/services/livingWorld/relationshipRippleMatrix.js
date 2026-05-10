/**
 * Pure macierz reakcji + computeRippleDelta. Wydzielone z
 * relationshipRippleService.js żeby testy unit (vitest) mogły importować
 * bez triggerowania całego prisma chain.
 *
 * Zobacz `relationshipRippleService.js` dla async propagacji.
 */

/**
 * RIPPLE_MATRIX — relation type → coefficient × {help, harm, death}.
 * Wartości to (-1.5..+1.5) — interpretowane jako "frakcja delty source-a"
 * do przemnożenia przez rippleStrength i bezpośredniego użycia jako delta.
 */
export const RIPPLE_MATRIX = {
  // Bliscy
  'brother of': { onHelp: 0.6, onHarm: -0.8, onDeath: -1.0 },
  'sister of':  { onHelp: 0.6, onHarm: -0.8, onDeath: -1.0 },
  'father of':  { onHelp: 0.7, onHarm: -1.0, onDeath: -1.2 },
  'mother of':  { onHelp: 0.7, onHarm: -1.0, onDeath: -1.2 },
  'son of':     { onHelp: 0.6, onHarm: -0.9, onDeath: -1.1 },
  'daughter of':{ onHelp: 0.6, onHarm: -0.9, onDeath: -1.1 },
  'lover of':   { onHelp: 0.7, onHarm: -1.0, onDeath: -1.2 },
  'spouse of':  { onHelp: 0.7, onHarm: -1.0, onDeath: -1.2 },
  'friend of':  { onHelp: 0.5, onHarm: -0.6, onDeath: -0.7 },
  'mentor of':  { onHelp: 0.5, onHarm: -0.6, onDeath: -0.8 },
  'apprentice of': { onHelp: 0.5, onHarm: -0.6, onDeath: -0.8 },
  'subordinate of': { onHelp: 0.4, onHarm: -0.3, onDeath: -0.5 },
  'ally of':    { onHelp: 0.4, onHarm: -0.5, onDeath: -0.6 },
  // Wrogowie / rywale — odwrotne znaki
  'rival of':   { onHelp: -0.4, onHarm: 0.5, onDeath: 0.3 },
  'enemy of':   { onHelp: -0.6, onHarm: 0.4, onDeath: 0.5 },
  'nemesis of': { onHelp: -0.6, onHarm: 0.4, onDeath: 0.5 },
  // Frakcyjne / zawodowe
  'leader of':  { onHelp: 0.3, onHarm: -0.4, onDeath: -0.5 },
  'member of':  { onHelp: 0.2, onHarm: -0.3, onDeath: -0.4 },
};

/**
 * Pure: oblicza ripple delta na target NPC dla danej relacji i action.
 * Zwraca liczbę całkowitą (clamp -50..+50 per pojedynczy ripple — żeby
 * pojedyncze zdarzenie nie wybiło dispositionu na max naraz).
 *
 * `rippleStrength` (0..100) — natężenie z jakim target reaguje. Mnożnik
 * stosowany na końcu: 0 = brak reakcji, 100 = pełna reakcja z macierzy.
 *
 * `actionType` (opt) — gdy obecne, używa multiplikatora dla "kill/save/etc"
 * jako alternatywy/wzmocnienia dispositionDelta. `killed` traktujemy jak
 * onDeath, `saved` jak onHelp z bonusem, `betrayed` jak onHarm z bonusem.
 */
export function computeRippleDelta(relation, { dispositionDelta = 0, alive = true, actionType = null, rippleStrength = 50 } = {}) {
  const coeffs = RIPPLE_MATRIX[String(relation || '').toLowerCase()] || null;
  if (!coeffs) return 0;
  const ripple = Math.max(0, Math.min(100, rippleStrength)) / 100;
  if (ripple === 0) return 0;

  let raw = 0;
  if (alive === false || actionType === 'killed') {
    raw += coeffs.onDeath * 30;
  } else if (actionType === 'saved') {
    raw += coeffs.onHelp * 25;
  } else if (actionType === 'betrayed') {
    raw += coeffs.onHarm * 30;
  } else if (actionType === 'aided') {
    raw += coeffs.onHelp * 15;
  } else if (actionType === 'insulted' || actionType === 'broke_promise') {
    raw += coeffs.onHarm * 10;
  } else if (actionType === 'kept_promise') {
    raw += coeffs.onHelp * 8;
  } else if (typeof dispositionDelta === 'number' && dispositionDelta !== 0) {
    if (dispositionDelta > 0) raw = dispositionDelta * coeffs.onHelp;
    else raw = Math.abs(dispositionDelta) * coeffs.onHarm;
  }

  const scaled = raw * ripple;
  const clamped = Math.max(-50, Math.min(50, scaled));
  return Math.round(clamped);
}
