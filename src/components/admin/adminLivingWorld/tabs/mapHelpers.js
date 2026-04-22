// Pure helpers for MapTab SVG render. Kept free of JSX so they can be
// unit-tested without a DOM.

export const LOCATION_TYPE_COLORS = {
  capital:    '#ffd166',
  city:       '#ef476f',
  town:       '#f78c6b',
  village:    '#06d6a0',
  hamlet:     '#118ab2',
  dungeon:    '#7209b7',
  forest:     '#2a9d8f',
  wilderness: '#3a5a40',
  interior:   '#6c757d',
  generic:    '#adb5bd',
};

export function edgeColour(difficulty) {
  switch (difficulty) {
    case 'deadly':    return '#e63946';
    case 'dangerous': return '#f48c06';
    case 'moderate':  return '#ffd166';
    default:          return '#8ecae6';
  }
}

export function nodeRadius(locationType) {
  switch (locationType) {
    case 'capital': return 10;
    case 'city':    return 8;
    case 'town':    return 6;
    case 'village': return 5;
    case 'hamlet':  return 4;
    case 'dungeon': return 6;
    default:        return 5;
  }
}
