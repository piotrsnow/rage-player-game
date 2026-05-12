export function difficultyLabel(val) {
  return val < 25 ? 'Easy' : val < 50 ? 'Normal' : val < 75 ? 'Hard' : 'Expert';
}

export function narrativeLabel(val) {
  return val < 25 ? 'Predictable' : val < 50 ? 'Balanced' : val < 75 ? 'Chaotic' : 'Wild';
}

export function responseLengthLabel(val) {
  return val < 20 ? 'very short (1-2 sentences)'
    : val < 40 ? 'short (2-3 sentences)'
    : val < 60 ? 'medium (4-6 sentences)'
    : val < 80 ? 'long (1-2 paragraphs)'
    : 'very long (3+ paragraphs)';
}

export function sliderLabel(val, labels) {
  return val < 25 ? labels[0] : val < 50 ? labels[1] : val < 75 ? labels[2] : labels[3];
}

export function formatMoney(money) {
  if (!money) return '0 CP';
  const parts = [];
  if (money.gold) parts.push(`${money.gold} GC`);
  if (money.silver) parts.push(`${money.silver} SS`);
  if (money.copper) parts.push(`${money.copper} CP`);
  return parts.join(' ') || '0 CP';
}
