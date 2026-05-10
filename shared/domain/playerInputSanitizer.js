const MAX_PLAYER_INPUT_LENGTH = 2000;

export function wrapPlayerInput(text) {
  if (typeof text !== 'string') return '<PLAYER_INPUT></PLAYER_INPUT>';
  const trimmed = text.slice(0, MAX_PLAYER_INPUT_LENGTH);
  return `<PLAYER_INPUT>${trimmed}</PLAYER_INPUT>`;
}

/**
 * Lighter sanitizer for user-influenced strings embedded inside other prompt
 * blocks (not the main player action). Strips XML-like tags and uppercase
 * bracket section markers to prevent prompt-structure injection.
 */
export function sanitizeForPrompt(text, maxLength = 500) {
  if (typeof text !== 'string') return '';
  return text
    .slice(0, maxLength)
    .replace(/<\/?[A-Z_][A-Z_0-9]*\s*\/?>/gi, '')
    .replace(/\[\/?[A-Z_][A-Z_0-9 ]*\]/g, '');
}
