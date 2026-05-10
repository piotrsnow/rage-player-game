import {
  defaultLengthKmBetweenScales,
  directionDegForChildIndex,
  normalizeDirectionDeg,
} from '../../shared/domain/locationGraphLayout.js';

/** All nodes share the same world point — caller should use force layout instead. */
const GEO_DEGENERATE_EPS = 1e-5;

/** Raw km → px before bbox fit (scaled uniformly to fit canvas). */
const KM_TO_BASE_PX = 2.8;

function radiusForGraphScale(scale) {
  const s = Number(scale);
  const v = Number.isFinite(s) ? s : 5;
  if (v <= 1) return 28;
  if (v <= 3) return 22;
  if (v <= 5) return 18;
  return 14;
}

function stableEdgeFallbackIndex(a, b) {
  const s = `${a}:${b}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 997;
}

/** Must match GraphCanvas LAYOUT_W / LAYOUT_H / padding used with geoProjectLayout. */
export const GRAPH_LAYOUT_W = 1200;
export const GRAPH_LAYOUT_H = 900;
export const GRAPH_LAYOUT_PAD = 60;

/**
 * Bbox + scale for geo projection (forward and inverse canvas ↔ region km).
 *
 * @param {Array<{ id: string, regionX?: number, regionY?: number }>} nodes
 * @param {{ width?: number, height?: number, pad?: number }} [opts]
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, scale: number, offsetX: number, offsetY: number } | null}
 */
export function getGeoProjectionParams(nodes, { width = GRAPH_LAYOUT_W, height = GRAPH_LAYOUT_H, pad = GRAPH_LAYOUT_PAD } = {}) {
  if (!nodes?.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const x = Number(n.regionX) || 0;
    const y = Number(n.regionY) || 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rawRX = maxX - minX;
  const rawRY = maxY - minY;
  if (rawRX < GEO_DEGENERATE_EPS && rawRY < GEO_DEGENERATE_EPS) return null;

  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const scale = Math.min(
    innerW / Math.max(rawRX, 1e-9),
    innerH / Math.max(rawRY, 1e-9),
  );
  const offsetX = pad + (innerW - scale * rawRX) / 2;
  const offsetY = pad + (innerH - scale * rawRY) / 2;

  return { minX, maxX, minY, maxY, scale, offsetX, offsetY };
}

/** Inverse of geoProjectLayout pixel coords → region km (same projection as getGeoProjectionParams). */
export function layoutPxToRegion(px, py, params) {
  if (!params) return null;
  const { minX, maxY, scale, offsetX, offsetY } = params;
  return {
    regionX: minX + (px - offsetX) / scale,
    regionY: maxY - (py - offsetY) / scale,
  };
}

/**
 * Map location graph nodes (regionX/regionY in km) to canvas coordinates.
 * Matches admin CanonGraphTab projection: bbox fit, uniform scale, Y inverted (north-up).
 *
 * @param {Array<{ id: string, regionX?: number, regionY?: number }>} nodes
 * @param {{ width?: number, height?: number, pad?: number }} [opts]
 * @returns {Map<string, { x: number, y: number }> | null} null if degenerate (no spatial spread)
 */
export function geoProjectLayout(nodes, opts = {}) {
  const params = getGeoProjectionParams(nodes, opts);
  if (!params) return null;
  const { minX, maxY, scale, offsetX, offsetY } = params;

  const result = new Map();
  for (const n of nodes) {
    const x = Number(n.regionX) || 0;
    const y = Number(n.regionY) || 0;
    result.set(n.id, {
      x: offsetX + (x - minX) * scale,
      y: offsetY + (maxY - y) * scale,
    });
  }
  return result;
}

/**
 * Deterministic layout from edge metadata (directionDeg, lengthKm) + scale-based defaults.
 * directionDeg: canvas space — 0° east, 90° south (y down).
 *
 * @param {Array<{ id: string, scale?: number }>} nodes
 * @param {Array<{ id: string, fromId: string, toId: string, bidirectional?: boolean, metadata?: object }>} edges
 * @param {{ width?: number, height?: number, pad?: number, collisionIters?: number, separationPad?: number }} [opts]
 * @returns {Map<string, { x: number, y: number }>}
 */
export function directedGraphLayout(nodes, edges, {
  width = GRAPH_LAYOUT_W,
  height = GRAPH_LAYOUT_H,
  pad = GRAPH_LAYOUT_PAD,
  collisionIters = 40,
  separationPad = 8,
} = {}) {
  if (!nodes?.length) return new Map();

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ids = nodes.map((n) => n.id).filter(Boolean);

  /** @type {Map<string, Set<string>>} */
  const und = new Map();
  for (const id of ids) und.set(id, new Set());

  const edgeList = [];
  for (const e of edges || []) {
    if (!e?.fromId || !e?.toId) continue;
    if (!nodeById.has(e.fromId) || !nodeById.has(e.toId)) continue;
    edgeList.push(e);
    und.get(e.fromId).add(e.toId);
    und.get(e.toId).add(e.fromId);
  }

  function pickEdgeBetween(u, v) {
    const forwardEdge = edgeList.find((e) => e.fromId === u && e.toId === v);
    if (forwardEdge) return forwardEdge;
    const backBi = edgeList.find((e) => e.fromId === v && e.toId === u && e.bidirectional);
    if (backBi) return backBi;
    return edgeList.find((e) => e.fromId === v && e.toId === u && !e.bidirectional) || null;
  }

  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const cx = pad + innerW / 2;
  const cy = pad + innerH / 2;

  /** @type {Map<string, { x: number, y: number }>} */
  const pos = new Map();

  function getStep(u, v, forward, edge) {
    const su = nodeById.get(u)?.scale;
    const sv = nodeById.get(v)?.scale;
    const md = edge?.metadata && typeof edge.metadata === 'object' ? edge.metadata : {};
    const lenKm = typeof md.lengthKm === 'number' && Number.isFinite(md.lengthKm) && md.lengthKm >= 0
      ? md.lengthKm
      : defaultLengthKmBetweenScales(su ?? 5, sv ?? 5);
    let deg = typeof md.directionDeg === 'number' && Number.isFinite(md.directionDeg)
      ? normalizeDirectionDeg(md.directionDeg)
      : directionDegForChildIndex(stableEdgeFallbackIndex(u, v));
    if (!forward) deg = normalizeDirectionDeg(deg + 180);
    const lenPx = lenKm * KM_TO_BASE_PX;
    const rad = (deg * Math.PI) / 180;
    return { dx: Math.cos(rad) * lenPx, dy: Math.sin(rad) * lenPx };
  }

  const visited = new Set();
  const components = [];
  for (const start of [...ids].sort()) {
    if (visited.has(start)) continue;
    const comp = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const u = stack.pop();
      comp.push(u);
      for (const w of und.get(u) || []) {
        if (!visited.has(w)) {
          visited.add(w);
          stack.push(w);
        }
      }
    }
    components.push(comp);
  }

  let slotY = 0;
  for (const comp of components) {
    const root = [...comp].sort()[0];
    pos.set(root, { x: cx, y: cy + slotY });
    const q = [root];
    while (q.length) {
      const u = q.shift();
      const pu = pos.get(u);
      const neighbors = [...(und.get(u) || [])].sort();
      for (const v of neighbors) {
        if (pos.has(v)) continue;
        const edge = pickEdgeBetween(u, v);
        if (!edge) continue;
        const forward = edge.fromId === u && edge.toId === v;
        const { dx, dy } = getStep(u, v, forward, edge);
        pos.set(v, { x: pu.x + dx, y: pu.y + dy });
        q.push(v);
      }
    }
    for (const nid of [...comp].sort()) {
      if (!pos.has(nid)) {
        pos.set(nid, { x: cx + 140, y: cy + slotY + 90 });
      }
    }
    slotY += 220;
  }

  // Orphan nodes (no edges in filtered graph)
  for (const id of ids) {
    if (!pos.has(id)) {
      const i = pos.size;
      const angle = (2 * Math.PI * i) / Math.max(ids.length, 1);
      const r = Math.min(innerW, innerH) * 0.15;
      pos.set(id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
  }

  const radii = new Map(ids.map((id) => [id, radiusForGraphScale(nodeById.get(id)?.scale)]));

  for (let iter = 0; iter < collisionIters; iter++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (!pa || !pb) continue;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const minSep = radii.get(a) + radii.get(b) + separationPad;
        if (d >= minSep) continue;
        const push = (minSep - d) / 2;
        dx /= d;
        dy /= d;
        pa.x -= dx * push;
        pa.y -= dy * push;
        pb.x += dx * push;
        pb.y += dy * push;
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  pos.forEach(({ x, y }) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(innerW / rangeX, innerH / rangeY, 1);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const result = new Map();
  pos.forEach(({ x, y }, id) => {
    result.set(id, {
      x: cx + (x - midX) * scale,
      y: cy + (y - midY) * scale,
    });
  });

  return result;
}

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
