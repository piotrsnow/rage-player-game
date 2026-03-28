/**
 * Parses player action text into typed segments, distinguishing
 * quoted dialogue ("...") from unquoted action descriptions.
 *
 * Incomplete quotes (no closing `"`) are left as plain action text.
 *
 * @param {string} text
 * @returns {Array<{type: 'action'|'dialogue', text: string}>}
 */
export function parseActionSegments(text) {
  if (!text) return [];

  const QUOTE_PAIRS = {
    '"': '"',
    '„': '”',
    '“': '”',
    '«': '»',
  };
  const OPEN_QUOTES = new Set(Object.keys(QUOTE_PAIRS));

  const segments = [];
  let cursor = 0;
  let actionStart = 0;

  while (cursor < text.length) {
    const ch = text[cursor];
    if (!OPEN_QUOTES.has(ch)) {
      cursor += 1;
      continue;
    }

    const closeQuote = QUOTE_PAIRS[ch];
    const closeIndex = text.indexOf(closeQuote, cursor + 1);
    if (closeIndex < 0) {
      // Unbalanced quote -> treat the rest as action text.
      break;
    }

    if (cursor > actionStart) {
      segments.push({ type: 'action', text: text.slice(actionStart, cursor) });
    }
    segments.push({ type: 'dialogue', text: text.slice(cursor, closeIndex + 1) });

    cursor = closeIndex + 1;
    actionStart = cursor;
  }

  if (actionStart < text.length) {
    segments.push({ type: 'action', text: text.slice(actionStart) });
  }

  return segments;
}

/**
 * Extracts only the action (non-dialogue) parts, joined and trimmed.
 * @param {string} text
 * @returns {string}
 */
export function extractActionParts(text) {
  return parseActionSegments(text)
    .filter((s) => s.type === 'action')
    .map((s) => s.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts only the dialogue parts (with quotes), joined.
 * @param {string} text
 * @returns {string}
 */
export function extractDialogueParts(text) {
  return parseActionSegments(text)
    .filter((s) => s.type === 'dialogue')
    .map((s) => s.text)
    .join(' ')
    .trim();
}

/**
 * Returns true if the text contains at least one complete quoted dialogue.
 * @param {string} text
 * @returns {boolean}
 */
export function hasDialogue(text) {
  return parseActionSegments(text).some((s) => s.type === 'dialogue');
}
