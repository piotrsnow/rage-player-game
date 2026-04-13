/**
 * Repairs and parses partial/incomplete JSON from a streaming response.
 * Closes open strings, arrays, and objects so JSON.parse can work on incomplete data.
 *
 * @param {string} partial - Incomplete JSON string
 * @returns {object|null} Parsed object or null if too incomplete
 */
export function parsePartialJson(partial) {
  if (!partial || typeof partial !== 'string') return null;

  const trimmed = partial.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  // Try parsing as-is first (already complete)
  try {
    return JSON.parse(trimmed);
  } catch {
    // Need repair
  }

  // Walk the string tracking open structures
  let inString = false;
  let escaped = false;
  const stack = []; // tracks open delimiters: '{', '['

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') stack.push('{');
    else if (ch === '[') stack.push('[');
    else if (ch === '}') { if (stack.length && stack[stack.length - 1] === '{') stack.pop(); }
    else if (ch === ']') { if (stack.length && stack[stack.length - 1] === '[') stack.pop(); }
  }

  // Build closing sequence
  let repaired = trimmed;

  // If we're inside a string, close it
  if (inString) {
    // Remove trailing backslash that would escape our closing quote
    if (repaired.endsWith('\\')) {
      repaired = repaired.slice(0, -1);
    }
    repaired += '"';
  }

  // Clean up trailing commas or colons (invalid JSON after our close)
  repaired = repaired.replace(/,\s*$/, '');
  repaired = repaired.replace(/:\s*$/, ': null');

  // Close all open structures in reverse order
  for (let i = stack.length - 1; i >= 0; i--) {
    // Remove trailing commas before closing
    repaired = repaired.replace(/,\s*$/, '');
    repaired += stack[i] === '{' ? '}' : ']';
  }

  try {
    return JSON.parse(repaired);
  } catch {
    // Try more aggressive cleanup: strip the last incomplete key-value pair
    // Find the last complete value boundary before closing
    return tryAggressiveRepair(trimmed, stack, inString);
  }
}

/**
 * More aggressive repair: strip back to last valid comma or opening brace.
 */
function tryAggressiveRepair(text, _stack, _inString) {
  // Find the last successfully parseable prefix
  // Try removing characters from the end until we get valid JSON
  let candidate = text;

  for (let strip = 1; strip < Math.min(200, text.length); strip++) {
    candidate = text.slice(0, -strip);

    // Track state for this candidate
    let inStr = false;
    let esc = false;
    const stk = [];

    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') stk.push('{');
      else if (ch === '[') stk.push('[');
      else if (ch === '}') { if (stk.length && stk[stk.length - 1] === '{') stk.pop(); }
      else if (ch === ']') { if (stk.length && stk[stk.length - 1] === '[') stk.pop(); }
    }

    let repaired = candidate;
    if (inStr) {
      if (repaired.endsWith('\\')) repaired = repaired.slice(0, -1);
      repaired += '"';
    }
    repaired = repaired.replace(/,\s*$/, '');
    repaired = repaired.replace(/:\s*$/, ': null');

    for (let i = stk.length - 1; i >= 0; i--) {
      repaired = repaired.replace(/,\s*$/, '');
      repaired += stk[i] === '{' ? '}' : ']';
    }

    try {
      return JSON.parse(repaired);
    } catch {
      continue;
    }
  }

  return null;
}
