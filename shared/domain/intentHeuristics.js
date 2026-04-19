/**
 * Shared intent heuristics used by both combat and trade detection.
 *
 * Hypothesis / questioning guard: rejects inputs that describe, question, or
 * hypothesize an action rather than take it in-world. Without this, regex
 * keyword matches ("walka", "kupić") on conditional or interrogative phrasing
 * ("jakbym miał walczyć", "czy potrzebujesz kompanii?") would wrongly trigger
 * combat / trade shortcuts.
 *
 * Callers must first handle explicit system tags ([INITIATE COMBAT],
 * [ATTACK:Name]) — this helper only guards freeform text.
 */

// Using explicit negative lookbehind/lookahead on a Polish letter class
// instead of `\b`: JS word boundaries are ASCII-only, so `\b` mid-token
// around `ą/ć/ę/ł/ń/ó/ś/ź/ż` fails (e.g. `\bwyobra[zź]\b` would not match
// "wyobraź" because the trailing `ź` is a non-word char in ASCII mode and
// there's no word→non-word transition after it).
const LETTER = 'a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ';
const HYPOTHETICAL_RE = new RegExp(
  `(?<![${LETTER}])(jakby|gdyby|jakbym|gdybym|jeśli|jesli|wyobra[zź]|hipotetycznie|opowiedz|powiedz\\s+mi|co\\s+się?\\s+stanie|czy\\s+(potrzebuj|mog[eę]|mog[lł]by[mś])|boj[eę]\\s+się?|zastanawiam|pytam)(?![${LETTER}])`,
  'iu',
);

export function isHypotheticalOrQuestioning(s) {
  if (!s || typeof s !== 'string') return false;
  if (s.includes('?')) return true;
  return HYPOTHETICAL_RE.test(s);
}
