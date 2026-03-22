function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOCATION_KEYWORDS = {
  forest: ['forest', 'wood', 'grove', 'thicket', 'jungle', 'copse', 'glade', 'las', 'bór', 'drzew', 'puszcza', 'gaj'],
  village: ['village', 'town', 'inn', 'tavern', 'market', 'shop', 'farm', 'hamlet', 'settlement', 'wioska', 'miasto', 'karczma', 'tawerna', 'osada', 'chata'],
  mountain: ['mountain', 'peak', 'hill', 'cliff', 'cave', 'mine', 'crag', 'ridge', 'góra', 'szczyt', 'wzgórze', 'jaskinia', 'kopalnia'],
  castle: ['castle', 'fort', 'fortress', 'wall', 'keep', 'tower', 'citadel', 'stronghold', 'bastion', 'zamek', 'twierdza', 'wieża', 'baszta', 'mur'],
  water: ['river', 'lake', 'sea', 'shore', 'beach', 'port', 'harbor', 'dock', 'pond', 'swamp', 'marsh', 'rzeka', 'jezioro', 'morze', 'brzeg', 'bagno', 'staw'],
};

function inferLocationType(name, description) {
  const text = `${name} ${description || ''}`.toLowerCase();
  for (const [type, keywords] of Object.entries(LOCATION_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return 'default';
}

const TYPE_DECORATIONS = {
  forest: ['tree', 'tree', 'pine', 'pine', 'grass'],
  village: ['house', 'house', 'house', 'tree', 'grass'],
  mountain: ['mountain', 'mountain', 'rock', 'pine', 'grass'],
  castle: ['tower', 'wall', 'wall', 'rock', 'grass'],
  water: ['water', 'water', 'water', 'grass', 'rock'],
  default: ['tree', 'pine', 'grass', 'grass', 'rock'],
};

const SCATTER_TYPES = ['tree', 'pine', 'grass', 'grass', 'rock', 'tree', 'pine', 'mountain'];

/* ------------------------------------------------------------------ */
/*  Drawing functions — medieval cartography style, sepia palette     */
/* ------------------------------------------------------------------ */

function drawTree(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5c4d38';
  ctx.fillRect(-1, 0, 2, s * 0.5);

  ctx.fillStyle = '#5a6b3f';
  ctx.beginPath();
  ctx.arc(0, -s * 0.2, s * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(110,130,80,0.4)';
  ctx.beginPath();
  ctx.arc(-s * 0.15, -s * 0.35, s * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPine(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5c4d38';
  ctx.fillRect(-1, 0, 2, s * 0.4);

  ctx.fillStyle = '#4a5a35';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.9);
  ctx.lineTo(-s * 0.5, 0);
  ctx.lineTo(s * 0.5, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#5a6b3f';
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(-s * 0.35, -s * 0.3);
  ctx.lineTo(s * 0.35, -s * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawMountain(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#7a6a52';
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(-s * 0.8, s * 0.3);
  ctx.lineTo(s * 0.8, s * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(60,50,35,0.4)';
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.8, s * 0.3);
  ctx.lineTo(s * 0.1, s * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(200,190,170,0.5)';
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(-s * 0.15, -s * 0.7);
  ctx.lineTo(s * 0.15, -s * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(80,65,45,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(-s * 0.8, s * 0.3);
  ctx.lineTo(s * 0.8, s * 0.3);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function drawHouse(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);

  const bw = s * 0.7;
  const bh = s * 0.5;

  ctx.fillStyle = '#b89860';
  ctx.fillRect(-bw / 2, -bh, bw, bh);

  ctx.fillStyle = '#7a5a3a';
  ctx.beginPath();
  ctx.moveTo(0, -bh - s * 0.45);
  ctx.lineTo(-bw / 2 - s * 0.1, -bh);
  ctx.lineTo(bw / 2 + s * 0.1, -bh);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#5c4a35';
  ctx.fillRect(-s * 0.08, -s * 0.25, s * 0.16, s * 0.25);

  ctx.strokeStyle = 'rgba(80,65,45,0.5)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(-bw / 2, -bh, bw, bh);

  ctx.restore();
}

function drawTower(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);

  const tw = s * 0.45;
  const th = s * 1.2;

  ctx.fillStyle = '#8a7558';
  ctx.fillRect(-tw / 2, -th, tw, th);

  const bSize = s * 0.12;
  for (let i = -2; i <= 2; i++) {
    ctx.fillRect(i * bSize * 1.3 - bSize / 2, -th - bSize, bSize, bSize);
  }

  ctx.fillStyle = '#3a3028';
  ctx.beginPath();
  ctx.arc(0, -th * 0.6, s * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(80,65,45,0.5)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(-tw / 2, -th, tw, th);

  ctx.restore();
}

function drawWall(ctx, x, y, s, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle || 0);

  const wLen = s * 1.5;
  const wH = s * 0.25;

  ctx.fillStyle = '#7a6a50';
  ctx.fillRect(-wLen / 2, -wH, wLen, wH);

  const bSize = s * 0.1;
  const count = Math.max(2, Math.floor(wLen / (bSize * 2.5)));
  for (let i = 0; i < count; i++) {
    const bx = -wLen / 2 + (i + 0.5) * (wLen / count) - bSize / 2;
    ctx.fillRect(bx, -wH - bSize, bSize, bSize);
  }

  ctx.strokeStyle = 'rgba(80,65,45,0.4)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-wLen / 2, -wH, wLen, wH);

  ctx.restore();
}

function drawWater(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(80,115,150,0.35)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';

  for (let row = 0; row < 3; row++) {
    const oy = (row - 1) * s * 0.35;
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, oy);
    ctx.quadraticCurveTo(-s * 0.2, oy - s * 0.15, 0, oy);
    ctx.quadraticCurveTo(s * 0.2, oy + s * 0.15, s * 0.6, oy);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGrass(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(90,110,65,0.45)';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';

  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.2, 0);
    ctx.quadraticCurveTo(i * s * 0.3, -s * 0.5, i * s * 0.15, -s * 0.7);
    ctx.stroke();
  }

  ctx.restore();
}

function drawRock(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#6a5d4a';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.45, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(140,125,100,0.3)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.1, -s * 0.08, s * 0.2, s * 0.12, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

const DRAW_FNS = {
  tree: (ctx, d) => drawTree(ctx, d.x, d.y, d.scale),
  pine: (ctx, d) => drawPine(ctx, d.x, d.y, d.scale),
  mountain: (ctx, d) => drawMountain(ctx, d.x, d.y, d.scale),
  house: (ctx, d) => drawHouse(ctx, d.x, d.y, d.scale),
  tower: (ctx, d) => drawTower(ctx, d.x, d.y, d.scale),
  wall: (ctx, d) => drawWall(ctx, d.x, d.y, d.scale, d.angle),
  water: (ctx, d) => drawWater(ctx, d.x, d.y, d.scale),
  grass: (ctx, d) => drawGrass(ctx, d.x, d.y, d.scale),
  rock: (ctx, d) => drawRock(ctx, d.x, d.y, d.scale),
};

/* ------------------------------------------------------------------ */
/*  Collision helpers                                                  */
/* ------------------------------------------------------------------ */

function tooCloseToNode(x, y, positions, minDist) {
  for (const [, p] of positions) {
    if (Math.hypot(x - p.x, y - p.y) < minDist) return true;
  }
  return false;
}

function tooCloseToEdge(x, y, edges, positions, minDist) {
  for (const { from, to } of edges) {
    const a = positions.get(from);
    const b = positions.get(to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    if (Math.hypot(x - px, y - py) < minDist) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function generateMapDecorations(nodeNames, positions, locMap, edges, width, height) {
  if (nodeNames.length === 0) return [];

  const seed = hashString(nodeNames.join(','));
  const rng = mulberry32(seed);
  const decorations = [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [, p] of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const padX = (maxX - minX) * 0.35 + 80;
  const padY = (maxY - minY) * 0.35 + 80;
  const areaMinX = minX - padX;
  const areaMaxX = maxX + padX;
  const areaMinY = minY - padY;
  const areaMaxY = maxY + padY;

  const area = (areaMaxX - areaMinX) * (areaMaxY - areaMinY);
  const scatterCount = Math.min(70, Math.max(15, Math.floor(area / 2800)));

  for (let i = 0; i < scatterCount; i++) {
    const x = areaMinX + rng() * (areaMaxX - areaMinX);
    const y = areaMinY + rng() * (areaMaxY - areaMinY);

    if (tooCloseToNode(x, y, positions, 42)) continue;
    if (tooCloseToEdge(x, y, edges, positions, 18)) continue;

    const type = SCATTER_TYPES[Math.floor(rng() * SCATTER_TYPES.length)];
    const scale = 6 + rng() * 6;
    const angle = type === 'wall' ? rng() * Math.PI : 0;

    decorations.push({ type, x, y, scale, angle, alpha: 0.22 + rng() * 0.13 });
  }

  for (const name of nodeNames) {
    const pos = positions.get(name);
    if (!pos) continue;

    const loc = locMap.get(name.toLowerCase());
    const locType = inferLocationType(name, loc?.description);
    const typeList = TYPE_DECORATIONS[locType];

    const count = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * i) / count + (rng() - 0.5) * 0.5;
      const dist = 30 + rng() * 25;
      const x = pos.x + Math.cos(a) * dist;
      const y = pos.y + Math.sin(a) * dist;

      const type = typeList[i % typeList.length];
      const scale = 7 + rng() * 5;
      const wallAngle = type === 'wall' ? a + Math.PI / 2 : 0;

      decorations.push({ type, x, y, scale, angle: wallAngle, alpha: 0.38 + rng() * 0.17 });
    }
  }

  return decorations;
}

export function drawDecorations(ctx, decorations) {
  for (const dec of decorations) {
    ctx.globalAlpha = dec.alpha;
    const fn = DRAW_FNS[dec.type];
    if (fn) fn(ctx, dec);
  }
  ctx.globalAlpha = 1;
}
