/**
 * Canonical world biome map.
 *
 * Source of truth: Bezier path strings copied verbatim from
 * plans/biome-tiles-proposal.svg. Strings are sampled at module load into flat
 * polygon vertex arrays; getBiomeForCoords(x, y) walks regions in reverse layer
 * order (topmost first) and returns the first hit, falling back to plains.
 *
 * Coordinate convention used by Campaign.regionX/regionY (and by callers):
 * positive Y = north. SVG-native paths use svgY = -mapY, so the sampler flips
 * Y once at parse time — paths can be pasted from the SVG without translation.
 *
 * Lookup is a small constant cost (~8 polygons × ~30 sampled vertices = ~240
 * ray-cast steps), well below per-scene LLM and DB costs. No caching needed.
 */

const BG_PLAINS = { biome: 'plains', danger: 'safe' };

const WASTELAND_NORTH_PATH = `
  M -10.5 -10.5 L 10.5 -10.5 L 10.5 -9.0
  C 8.5 -8.4, 6.5 -9.6, 4.5 -8.8
  C 2.5 -8.2, 0.5 -9.5, -1.5 -8.9
  C -3.5 -8.4, -5.5 -9.6, -7.5 -8.7
  L -10.5 -9.2 Z
`;

const WASTELAND_SOUTH_PATH = `
  M -10.5 9.2
  C -8 9.7, -6 8.5, -4 9.3
  C -2 9.8, 0 8.7, 2 9.2
  C 4 9.6, 6 8.5, 8 9.3
  L 10.5 9.0 L 10.5 10.5 L -10.5 10.5 Z
`;

const MOUNTAINS_PATH = `
  M -10.5 -10.5 L -8 -10.5
  C -7.6 -9, -7.2 -7.5, -7.4 -5.5
  C -7.6 -3.5, -6.7 -1.5, -7.0 0.5
  C -7.3 2, -7.0 3.0, -6.0 3.3
  C -4.5 3.2, -3.0 3.8, -2.3 5.0
  C -2.0 5.6, -2.6 6.2, -3.6 6.4
  C -5.2 6.5, -6.4 5.6, -6.9 5.2
  C -7.2 5.4, -7.4 6.2, -7.5 7.2
  C -7.8 8.6, -8.0 9.6, -8.2 10.5
  L -10.5 10.5 Z
`;

const HILLS_PATH = `
  M -7.3 -3.0
  C -7.1 -2.0, -7.1 0.0, -7.1 2.0
  C -6.6 2.4, -5.6 2.2, -4.6 1.6
  C -3.6 1.0, -3.0 -0.2, -3.0 -1.0
  C -3.2 -1.4, -3.5 -1.5, -3.7 -1.5
  C -4.2 -1.7, -5.2 -2.1, -6.0 -2.6
  C -6.6 -2.9, -7.1 -3.1, -7.3 -3.0 Z
`;

const FOREST_PATH = `
  M -3.6 -1.4
  C -3.0 -2.6, -3.4 -4.0, -3.0 -5.2
  C -2.4 -6.4, -1.0 -7.2, 0.6 -7.6
  C 2.4 -8.0, 4.4 -7.9, 5.8 -7.4
  C 7.4 -6.8, 9.0 -6.0, 9.8 -4.6
  C 10.5 -2.8, 10.5 -0.6, 10.5 1.4
  C 10.5 3.5, 10.5 5.5, 10.0 7.5
  C 9.0 8.2, 7.0 8.2, 5.5 7.6
  C 4.0 7.0, 3.0 5.5, 2.8 4.0
  C 2.6 2.5, 2.5 1.0, 2.5 -0.2
  C 2.5 -0.8, 2.0 -1.2, 1.0 -1.3
  C -0.5 -1.5, -2.0 -1.4, -3.6 -1.4 Z
`;

const SWAMP_PATH = `
  M 2.7 1.6
  C 3.5 1.3, 4.5 1.4, 5.5 1.6
  C 7.0 1.9, 8.5 2.0, 9.5 2.2
  C 10.0 2.4, 10.5 2.6, 10.5 3.0
  L 10.5 8.0
  C 9.5 8.4, 7.5 8.4, 6.0 8.0
  C 4.5 7.5, 3.0 6.5, 2.7 5.0
  C 2.5 3.5, 2.5 2.5, 2.7 1.6 Z
`;

// Wilcze Pustkowia is an SVG <ellipse> in plans/biome-tiles-proposal.svg
// (cx=0.5, cy=-4.2, rx=1.4, ry=1.1). cy is flipped here to map convention.
const WILCZE_CX = 0.5;
const WILCZE_CY = 4.2;
const WILCZE_RX = 1.4;
const WILCZE_RY = 1.1;

/**
 * Parse an SVG path of M/L/C/Z commands and sample each cubic Bezier into
 * `stepsPerSegment` line segments. Returns a flat [[x, y], ...] vertex list.
 * `flipY: true` negates Y at parse (use for SVG-native paths where svgY = -mapY).
 */
function sampleSvgPath(d, { stepsPerSegment = 8, flipY = false } = {}) {
  const tokens = d.replace(/,/g, ' ').trim().split(/\s+/);
  const fy = (yy) => (flipY ? -yy : yy);
  const out = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      x = parseFloat(tokens[i++]);
      y = parseFloat(tokens[i++]);
      startX = x;
      startY = y;
      out.push([x, fy(y)]);
    } else if (cmd === 'L') {
      x = parseFloat(tokens[i++]);
      y = parseFloat(tokens[i++]);
      out.push([x, fy(y)]);
    } else if (cmd === 'C') {
      const x1 = parseFloat(tokens[i++]);
      const y1 = parseFloat(tokens[i++]);
      const x2 = parseFloat(tokens[i++]);
      const y2 = parseFloat(tokens[i++]);
      const x3 = parseFloat(tokens[i++]);
      const y3 = parseFloat(tokens[i++]);
      for (let s = 1; s <= stepsPerSegment; s++) {
        const t = s / stepsPerSegment;
        const u = 1 - t;
        const px = u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
        const py = u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        out.push([px, fy(py)]);
      }
      x = x3;
      y = y3;
    } else if (cmd === 'Z' || cmd === 'z') {
      x = startX;
      y = startY;
    } else {
      throw new Error(`biomeMap: unsupported SVG path command "${cmd}" — only M/L/C/Z are supported`);
    }
  }
  return out;
}

function sampleEllipse(cx, cy, rx, ry, steps = 32) {
  const out = [];
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * 2 * Math.PI;
    out.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return out;
}

function pointInPolygon(x, y, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i][0];
    const yi = vertices[i][1];
    const xj = vertices[j][0];
    const yj = vertices[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const SAMPLE_OPTS = { stepsPerSegment: 8, flipY: true };

// Layer order = lookup priority; later entries win over earlier when shapes
// overlap. Background plains is always entry [0] and is returned as the
// fallback when no overlay region matches.
export const BIOME_REGIONS = [
  BG_PLAINS,
  { biome: 'wasteland', danger: 'dangerous', polygon: sampleSvgPath(WASTELAND_NORTH_PATH, SAMPLE_OPTS) },
  { biome: 'wasteland', danger: 'dangerous', polygon: sampleSvgPath(WASTELAND_SOUTH_PATH, SAMPLE_OPTS) },
  { biome: 'mountains', danger: 'dangerous', polygon: sampleSvgPath(MOUNTAINS_PATH, SAMPLE_OPTS) },
  { biome: 'hills', danger: 'safe', polygon: sampleSvgPath(HILLS_PATH, SAMPLE_OPTS) },
  { biome: 'forest', danger: 'moderate', name: 'Czarnobór', polygon: sampleSvgPath(FOREST_PATH, SAMPLE_OPTS) },
  {
    biome: 'wasteland',
    danger: 'dangerous',
    name: 'Wilcze Pustkowia',
    polygon: sampleEllipse(WILCZE_CX, WILCZE_CY, WILCZE_RX, WILCZE_RY),
  },
  { biome: 'swamp', danger: 'dangerous', name: 'Szeptające Trzęsawiska', polygon: sampleSvgPath(SWAMP_PATH, SAMPLE_OPTS) },
];

/**
 * Returns the biome region descriptor for a (regionX, regionY) point. Walks
 * BIOME_REGIONS in reverse so topmost overlay (e.g. Wilcze Pustkowia inside
 * forest) wins. Always returns a region — never null. Out-of-world points
 * fall through to plains.
 */
export function getBiomeForCoords(x, y) {
  for (let i = BIOME_REGIONS.length - 1; i > 0; i--) {
    if (pointInPolygon(x, y, BIOME_REGIONS[i].polygon)) {
      return BIOME_REGIONS[i];
    }
  }
  return BG_PLAINS;
}

/**
 * Convenience: human-readable label for a biome region — uses custom `name`
 * if present, otherwise falls back to the biome enum value.
 */
export function biomeLabel(region) {
  return region.name || region.biome;
}
