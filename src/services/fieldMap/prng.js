export function hashSeed(seed, cx, cy) {
  let h = seed ^ 0xdeadbeef;
  h = Math.imul(h ^ cx, 2654435761);
  h = Math.imul(h ^ cy, 2246822519);
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function seededPick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function noise2D(rng, x, y) {
  const h = hashSeed(Math.floor(rng() * 0x7fffffff), x, y);
  return (h & 0xffff) / 0xffff;
}
