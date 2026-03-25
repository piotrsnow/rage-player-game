import * as THREE from 'three';

export function hashStringToInt(value = '') {
  let hash = 2166136261;
  const input = String(value);

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createSeededRandom(seedValue) {
  let seed = hashStringToInt(seedValue) || 1;

  return function seededRandom() {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

export function intRange(random, min, max) {
  return Math.floor(range(random, min, max + 1));
}

export function pick(random, items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(random() * items.length)] ?? items[0];
}

export function polarToPosition(angle, radius, y = 0) {
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

export function createScatter(random, count, options = {}) {
  const {
    minRadius = 4,
    maxRadius = 12,
    y = 0,
    startAngle = 0,
    endAngle = Math.PI * 2,
  } = options;

  const result = [];
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / count;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t) + range(random, -0.28, 0.28);
    const radius = range(random, minRadius, maxRadius);
    result.push({
      angle,
      radius,
      position: polarToPosition(angle, radius, y),
    });
  }
  return result;
}

export function darken(color, amount) {
  return `#${new THREE.Color(color).multiplyScalar(Math.max(0, 1 - amount)).getHexString()}`;
}

export function lighten(color, amount) {
  return `#${new THREE.Color(color).lerp(new THREE.Color('#FFFFFF'), amount).getHexString()}`;
}

export function createSceneSeed(sceneId, ...parts) {
  return [sceneId || 'scene', ...parts].filter(Boolean).join(':');
}
