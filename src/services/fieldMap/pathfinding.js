import { CHUNK_SIZE, worldToChunk, chunkKey } from './constants.js';

class MinHeap {
  constructor() { this._data = []; }
  get size() { return this._data.length; }

  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._data[i].f >= this._data[p].f) break;
      [this._data[i], this._data[p]] = [this._data[p], this._data[i]];
      i = p;
    }
  }

  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[smallest].f) smallest = l;
      if (r < n && this._data[r].f < this._data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
      i = smallest;
    }
  }
}

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

function isPassableAt(wx, wy, chunks) {
  const { cx, cy, lx, ly } = worldToChunk(wx, wy, CHUNK_SIZE);
  const chunk = chunks[chunkKey(cx, cy)];
  if (!chunk) return false;
  return chunk.passable[ly * chunk.size + lx];
}

export function findPath(startX, startY, endX, endY, chunks, maxSteps = 200) {
  if (startX === endX && startY === endY) return [];
  if (!isPassableAt(endX, endY, chunks)) return null;

  const open = new MinHeap();
  const closed = new Set();
  const gScore = new Map();
  const cameFrom = new Map();

  const startKey = `${startX},${startY}`;
  gScore.set(startKey, 0);
  open.push({ x: startX, y: startY, f: heuristic(startX, startY, endX, endY) });

  let iterations = 0;
  const maxIterations = maxSteps * 10;

  while (open.size > 0 && iterations++ < maxIterations) {
    const current = open.pop();
    const curKey = `${current.x},${current.y}`;

    if (current.x === endX && current.y === endY) {
      return _reconstructPath(cameFrom, endX, endY);
    }

    if (closed.has(curKey)) continue;
    closed.add(curKey);

    const curG = gScore.get(curKey);

    for (const { dx, dy } of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nKey = `${nx},${ny}`;

      if (closed.has(nKey)) continue;
      if (!isPassableAt(nx, ny, chunks)) continue;

      const tentG = curG + 1;
      const prevG = gScore.get(nKey);

      if (prevG === undefined || tentG < prevG) {
        gScore.set(nKey, tentG);
        cameFrom.set(nKey, { x: current.x, y: current.y });
        open.push({ x: nx, y: ny, f: tentG + heuristic(nx, ny, endX, endY) });
      }
    }
  }

  return null;
}

function heuristic(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function _reconstructPath(cameFrom, endX, endY) {
  const path = [];
  let key = `${endX},${endY}`;
  while (cameFrom.has(key)) {
    const [sx, sy] = key.split(',').map(Number);
    path.unshift({ x: sx, y: sy });
    const prev = cameFrom.get(key);
    key = `${prev.x},${prev.y}`;
  }
  return path;
}
