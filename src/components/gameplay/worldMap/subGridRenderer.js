// Pure canvas rendering for sublocation drill-down grid.
// Mirrors tileMapRenderer.js shape (takes inputs + ctx, draws), but the grid
// is parent-scoped (capital 10×10, town 7×7, village/hamlet/dungeon 5×5) and
// there is no world-km mapping — sub-grid coords are slot indices.

const SUB_TYPE_COLOR = {
  tavern: '#a06830',
  palace: '#d4a545',
  market: '#c09030',
  barracks: '#8c4030',
  temple: '#7a78a0',
  grand_temple: '#7a78a0',
  church: '#7a78a0',
  library: '#5870a0',
  academy: '#60809c',
  arena: '#b8743c',
  shrine: '#8080a8',
  workshop: '#606850',
  hideout: '#503058',
  camp: '#8a6840',
  hut: '#8a7040',
  sawmill: '#606850',
  interior: '#5c4d38',
  generic: '#5c4d38',
};

export function subGridSizeFor(parentType) {
  if (parentType === 'capital' || parentType === 'city') return 10;
  if (parentType === 'town') return 7;
  return 5; // village, hamlet, dungeon, cave, ruins, fallback
}

export function computeSubPxPerCell(width, height, gridSize) {
  const pad = 16;
  const usable = Math.min(width, height) - pad * 2;
  return Math.max(16, usable / gridSize);
}

export function subCellToScreen(gx, gy, pxPerCell, gridSize, width, height) {
  const gridPx = gridSize * pxPerCell;
  const ox = (width - gridPx) / 2;
  const oy = (height - gridPx) / 2;
  // Center each sublocation inside its cell. Y inverted so N is up.
  return {
    x: ox + (gx + 0.5) * pxPerCell,
    y: oy + (gridSize - gy - 0.5) * pxPerCell,
  };
}

export function screenToSubCell(sx, sy, pxPerCell, gridSize, width, height) {
  const gridPx = gridSize * pxPerCell;
  const ox = (width - gridPx) / 2;
  const oy = (height - gridPx) / 2;
  return {
    x: Math.floor((sx - ox) / pxPerCell),
    y: gridSize - 1 - Math.floor((sy - oy) / pxPerCell),
  };
}

export function drawSubParchment(ctx, w, h) {
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(50,40,28,0.95)');
  grad.addColorStop(1, 'rgba(28,22,16,0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function drawSubGridLines(ctx, pxPerCell, gridSize, w, h) {
  const gridPx = gridSize * pxPerCell;
  const ox = (w - gridPx) / 2;
  const oy = (h - gridPx) / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(120,100,70,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i += 1) {
    const x = ox + i * pxPerCell;
    ctx.beginPath();
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + gridPx);
    ctx.stroke();
    const y = oy + i * pxPerCell;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + gridPx, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(160,130,85,0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, gridPx, gridPx);
  ctx.restore();
}

export function drawSubTile(ctx, sub, screen, pxPerCell, opts) {
  const { isCurrent, isHovered, pulse, fog } = opts;
  if (fog === 'hidden') return;

  const typeKey = sub.slotType || sub.category || 'generic';
  const color = SUB_TYPE_COLOR[typeKey] || SUB_TYPE_COLOR.generic;
  const r = Math.max(10, Math.min(26, pxPerCell * 0.32));

  ctx.save();

  if (isCurrent) {
    const glowR = r + 8 + pulse * 6;
    const glow = ctx.createRadialGradient(screen.x, screen.y, r, screen.x, screen.y, glowR);
    glow.addColorStop(0, 'rgba(240,212,138,0.55)');
    glow.addColorStop(1, 'rgba(240,212,138,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
  const inner = ctx.createRadialGradient(screen.x - 2, screen.y - 2, 0, screen.x, screen.y, r);
  if (isCurrent) {
    inner.addColorStop(0, '#f5d88a');
    inner.addColorStop(1, color);
  } else if (isHovered) {
    inner.addColorStop(0, lighten(color, 0.25));
    inner.addColorStop(1, color);
  } else {
    inner.addColorStop(0, lighten(color, 0.1));
    inner.addColorStop(1, color);
  }
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = isCurrent ? '#f0d48a' : 'rgba(40,30,20,0.8)';
  ctx.stroke();

  const name = sub.displayName || sub.canonicalName || sub.name || '';
  ctx.font = `${isCurrent ? 'bold ' : ''}10px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.strokeStyle = 'rgba(15,12,8,0.85)';
  ctx.lineWidth = 3;
  ctx.fillStyle = isCurrent ? '#f0d48a' : 'rgba(210,190,155,0.95)';
  ctx.strokeText(name, screen.x, screen.y + r + 3);
  ctx.fillText(name, screen.x, screen.y + r + 3);

  ctx.restore();
}

// Assigns (subGridX, subGridY) to subs missing coords, row-major starting at
// (0,0), skipping any cell already taken. Returns a NEW array; input is not
// mutated. Used for AI-generated sublocations that don't carry authored slots.
export function layoutSubsWithFallback(subs, gridSize) {
  const occupied = new Set();
  const withCoords = [];
  const pending = [];

  for (const s of subs) {
    if (Number.isFinite(s.subGridX) && Number.isFinite(s.subGridY)) {
      const key = `${s.subGridX},${s.subGridY}`;
      if (!occupied.has(key) && s.subGridX >= 0 && s.subGridX < gridSize &&
          s.subGridY >= 0 && s.subGridY < gridSize) {
        occupied.add(key);
        withCoords.push(s);
        continue;
      }
    }
    pending.push(s);
  }

  for (const s of pending) {
    let placed = false;
    for (let y = 0; y < gridSize && !placed; y += 1) {
      for (let x = 0; x < gridSize && !placed; x += 1) {
        const key = `${x},${y}`;
        if (!occupied.has(key)) {
          occupied.add(key);
          withCoords.push({ ...s, subGridX: x, subGridY: y });
          placed = true;
        }
      }
    }
    // If the grid is fully occupied, drop the overflow rather than stacking.
  }

  return withCoords;
}

export function pickSubAt(gx, gy, subs) {
  for (const s of subs) {
    if (s.subGridX === gx && s.subGridY === gy) return s;
  }
  return null;
}

function lighten(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + 255 * amt));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + 255 * amt));
  const b = Math.min(255, Math.round((n & 0xff) + 255 * amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
