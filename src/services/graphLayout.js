/**
 * Minimal force-directed graph layout.
 *
 * Positions nodes using Coulomb repulsion between all pairs
 * and Hooke attraction along edges, then centres the result.
 *
 * Returns a Map<nodeName, {x, y}>.
 */
export function forceDirectedLayout(nodes, edges, { width = 600, height = 400, iterations = 120 } = {}) {
  if (nodes.length === 0) return new Map();

  const REPULSION = 8000;
  const ATTRACTION = 0.04;
  const DAMPING = 0.85;
  const MIN_DIST = 1;

  const pos = new Map();
  const vel = new Map();

  const cx = width / 2;
  const cy = height / 2;

  nodes.forEach((name, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const r = Math.min(width, height) * 0.3;
    pos.set(name, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    vel.set(name, { x: 0, y: 0 });
  });

  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map();
    nodes.forEach((n) => forces.set(n, { x: 0, y: 0 }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i]);
        const b = pos.get(nodes[j]);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_DIST) dist = MIN_DIST;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.get(nodes[i]).x += fx;
        forces.get(nodes[i]).y += fy;
        forces.get(nodes[j]).x -= fx;
        forces.get(nodes[j]).y -= fy;
      }
    }

    for (const { from, to } of edges) {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const fx = dx * ATTRACTION;
      const fy = dy * ATTRACTION;
      forces.get(from).x += fx;
      forces.get(from).y += fy;
      forces.get(to).x -= fx;
      forces.get(to).y -= fy;
    }

    const temp = 1 - iter / iterations;
    nodes.forEach((name) => {
      const v = vel.get(name);
      const f = forces.get(name);
      v.x = (v.x + f.x) * DAMPING * temp;
      v.y = (v.y + f.y) * DAMPING * temp;
      const p = pos.get(name);
      p.x += v.x;
      p.y += v.y;
    });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pos.forEach(({ x, y }) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });

  const pad = 60;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((width - pad * 2) / rangeX, (height - pad * 2) / rangeY, 1);

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  const result = new Map();
  pos.forEach(({ x, y }, name) => {
    result.set(name, {
      x: cx + (x - centreX) * scale,
      y: cy + (y - centreY) * scale,
    });
  });

  return result;
}
