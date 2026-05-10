const MAX_PLAYER_INPUT_LENGTH = 2000;

export function wrapPlayerInput(text) {
  if (typeof text !== 'string') return '<PLAYER_INPUT></PLAYER_INPUT>';
  const trimmed = text.slice(0, MAX_PLAYER_INPUT_LENGTH);
  return `<PLAYER_INPUT>${trimmed}</PLAYER_INPUT>`;
}
