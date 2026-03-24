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

  const segments = [];
  const regex = /"([^"]*)"/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'action', text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'dialogue', text: match[0] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'action', text: text.slice(lastIndex) });
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
