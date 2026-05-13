// SVG path generators for node shapes (centered at 0,0).
// Each function takes a radius `r` and returns an SVG `d` path string.

export const SHAPE_PATHS = {
  circle: null, // rendered as <circle>, not <path>

  square(r) {
    return `M${-r},${-r} H${r} V${r} H${-r} Z`;
  },

  diamond(r) {
    return `M0,${-r} L${r},0 L0,${r} L${-r},0 Z`;
  },

  hexagon(r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`);
    }
    return `M${pts.join('L')} Z`;
  },

  triangle(r) {
    const h = r * 1.15;
    const x = r;
    return `M0,${-h} L${x},${r * 0.7} L${-x},${r * 0.7} Z`;
  },

  star(r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.5;
      pts.push(`${rad * Math.cos(a)},${rad * Math.sin(a)}`);
    }
    return `M${pts.join('L')} Z`;
  },

  octagon(r) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i - Math.PI / 8;
      pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`);
    }
    return `M${pts.join('L')} Z`;
  },

  shield(r) {
    const w = r * 0.9;
    const top = -r;
    const mid = r * 0.3;
    const bot = r * 1.1;
    return `M0,${top} L${w},${top * 0.4} L${w},${mid} Q${w * 0.5},${bot} 0,${bot} Q${-w * 0.5},${bot} ${-w},${mid} L${-w},${top * 0.4} Z`;
  },
};

export const AVAILABLE_SHAPES = Object.keys(SHAPE_PATHS);

export const AVAILABLE_ICONS = [
  'castle', 'skull', 'church', 'house', 'cottage', 'storefront',
  'forest', 'park', 'flag', 'swords', 'shield', 'vpn_key',
  'water_drop', 'landscape', 'auto_awesome', 'temple_buddhist',
  'explore', 'pin_drop', 'place', 'public', 'map', 'door_open',
  'location_city', 'nightlife', 'local_fire_department', 'diamond',
  'anchor', 'sailing', 'fort', 'military_tech', 'school', 'science',
  'menu_book',
];
