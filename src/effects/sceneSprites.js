/**
 * Procedural drawing functions for 2D scene elements.
 *
 * All draw functions take (ctx, x, y, scale, time) where:
 *   ctx   — CanvasRenderingContext2D
 *   x, y  — center-bottom anchor in canvas coordinates
 *   scale — base size multiplier (1.0 ≈ ~60px tall element)
 *   time  — elapsed seconds for animation
 *
 * Convention: elements are anchored at bottom-center so y is the ground line.
 */

const BASE = 60;

function s(scale, v) { return v * scale * BASE; }

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rgba(r, g, b, a) { return `rgba(${r},${g},${b},${a})`; }

function sway(time, freq, amp) { return Math.sin(time * freq) * amp; }

function flicker(time, base, range) {
  return base + Math.sin(time * 8.3) * range * 0.3
    + Math.sin(time * 13.7) * range * 0.2
    + Math.sin(time * 23.1) * range * 0.1;
}

/* ------------------------------------------------------------------ */
/*  ENVIRONMENT: Trees                                                 */
/* ------------------------------------------------------------------ */

function drawDeciduousTree(ctx, x, y, scale, time) {
  const sw = sway(time, 1.2, 0.02 * scale);
  ctx.save();
  ctx.translate(x, y);

  // Trunk
  ctx.fillStyle = '#4a3520';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.06), 0);
  ctx.lineTo(s(scale, -0.04), s(scale, -0.45));
  ctx.lineTo(s(scale, 0.04), s(scale, -0.45));
  ctx.lineTo(s(scale, 0.06), 0);
  ctx.fill();

  // Canopy layers
  const cx = sw * s(scale, 1);
  const layers = [
    { cy: -0.55, rx: 0.28, ry: 0.2, color: '#3a5a28' },
    { cy: -0.7, rx: 0.24, ry: 0.18, color: '#4a6a35' },
    { cy: -0.82, rx: 0.18, ry: 0.14, color: '#5a7a42' },
  ];
  for (const l of layers) {
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.ellipse(cx, s(scale, l.cy), s(scale, l.rx), s(scale, l.ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leaf highlight
  ctx.fillStyle = 'rgba(120,180,80,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx + s(scale, 0.06), s(scale, -0.75), s(scale, 0.1), s(scale, 0.08), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPine(ctx, x, y, scale, time) {
  const sw = sway(time, 0.9, 0.015 * scale);
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#4a3520';
  ctx.fillRect(s(scale, -0.04), s(scale, -0.35), s(scale, 0.08), s(scale, 0.35));

  const cx = sw * s(scale, 1);
  const tiers = [
    { top: -0.9, base: -0.35, hw: 0.22 },
    { top: -1.0, base: -0.55, hw: 0.16 },
    { top: -1.08, base: -0.7, hw: 0.10 },
  ];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    ctx.fillStyle = i === 0 ? '#2a4a25' : i === 1 ? '#355730' : '#40653a';
    ctx.beginPath();
    ctx.moveTo(cx, s(scale, t.top));
    ctx.lineTo(cx - s(scale, t.hw), s(scale, t.base));
    ctx.lineTo(cx + s(scale, t.hw), s(scale, t.base));
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawDeadTree(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = s(scale, 0.04);
  ctx.lineCap = 'round';

  // Trunk
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(s(scale, 0.02), s(scale, -0.7));
  ctx.stroke();

  // Branches
  const branches = [
    [-0.7, -0.15, -0.35, -0.55],
    [-0.7, 0.12, 0.28, -0.5],
    [-0.5, -0.08, -0.2, -0.35],
    [-0.55, 0.06, 0.18, -0.4],
  ];
  ctx.lineWidth = s(scale, 0.025);
  for (const [sy, sx, ex, ey] of branches) {
    ctx.beginPath();
    ctx.moveTo(s(scale, sx * 0.3), s(scale, sy));
    ctx.lineTo(s(scale, ex), s(scale, ey));
    ctx.stroke();
  }

  ctx.restore();
}

function drawWillowTree(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#3a3018';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.07), 0);
  ctx.lineTo(s(scale, -0.05), s(scale, -0.5));
  ctx.lineTo(s(scale, 0.05), s(scale, -0.5));
  ctx.lineTo(s(scale, 0.07), 0);
  ctx.fill();

  // Canopy
  ctx.fillStyle = '#3a5a20';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.55), s(scale, 0.3), s(scale, 0.2), 0, 0, Math.PI * 2);
  ctx.fill();

  // Hanging vines
  ctx.strokeStyle = 'rgba(70,110,40,0.6)';
  ctx.lineWidth = s(scale, 0.015);
  for (let i = -3; i <= 3; i++) {
    const bx = i * s(scale, 0.08);
    const swayAmt = sway(time + i * 0.5, 0.8, 0.02);
    ctx.beginPath();
    ctx.moveTo(bx, s(scale, -0.4));
    ctx.quadraticCurveTo(bx + swayAmt * s(scale, 1), s(scale, -0.1), bx + swayAmt * s(scale, 1.5), s(scale, 0.1));
    ctx.stroke();
  }

  ctx.restore();
}

function drawPalm(ctx, x, y, scale, time) {
  const sw = sway(time, 0.7, 0.02 * scale);
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = '#6a5030';
  ctx.lineWidth = s(scale, 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(s(scale, 0.05), s(scale, -0.4), sw * s(scale, 1) + s(scale, 0.02), s(scale, -0.8));
  ctx.stroke();

  const topX = sw * s(scale, 1) + s(scale, 0.02);
  const topY = s(scale, -0.8);
  ctx.strokeStyle = '#3a6a20';
  ctx.lineWidth = s(scale, 0.025);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + sway(time + i, 0.6, 0.1);
    const len = s(scale, 0.25 + Math.random() * 0.1);
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(angle) * len * 0.7,
      topY + Math.sin(angle) * len * 0.5 - s(scale, 0.05),
      topX + Math.cos(angle) * len,
      topY + Math.sin(angle) * len * 0.8
    );
    ctx.stroke();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  ENVIRONMENT: Vegetation                                            */
/* ------------------------------------------------------------------ */

function drawBush(ctx, x, y, scale, time) {
  const sw = sway(time, 1.5, 0.01 * scale);
  ctx.save();
  ctx.translate(x + sw * s(scale, 0.5), y);

  const blobs = [
    { cx: 0, cy: -0.12, rx: 0.18, ry: 0.12, color: '#3a5a28' },
    { cx: -0.1, cy: -0.1, rx: 0.12, ry: 0.1, color: '#4a6a35' },
    { cx: 0.1, cy: -0.1, rx: 0.13, ry: 0.1, color: '#3a6030' },
  ];
  for (const b of blobs) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.ellipse(s(scale, b.cx), s(scale, b.cy), s(scale, b.rx), s(scale, b.ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFern(ctx, x, y, scale, time) {
  const sw = sway(time, 1.3, 0.015 * scale);
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#4a7a30';
  ctx.lineWidth = s(scale, 0.015);
  ctx.lineCap = 'round';

  for (let side = -1; side <= 1; side += 2) {
    const bend = side * s(scale, 0.15) + sw * s(scale, 0.3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(bend * 0.5, s(scale, -0.15), bend, s(scale, -0.28));
    ctx.stroke();

    for (let j = 0; j < 4; j++) {
      const t = (j + 1) / 5;
      const fx = bend * t * 0.5;
      const fy = s(scale, -0.28 * t);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + side * s(scale, 0.04), fy - s(scale, 0.03));
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawFlower(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = '#5a8a30';
  ctx.lineWidth = s(scale, 0.015);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s(scale, -0.2));
  ctx.stroke();

  const colors = ['#e060a0', '#e0a040', '#a060e0', '#60a0e0', '#e06060'];
  ctx.fillStyle = colors[Math.floor(x * 7) % colors.length];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      Math.cos(angle) * s(scale, 0.04),
      s(scale, -0.22) + Math.sin(angle) * s(scale, 0.04),
      s(scale, 0.025), s(scale, 0.02), angle, 0, Math.PI * 2
    );
    ctx.fill();
  }
  ctx.fillStyle = '#f0d060';
  ctx.beginPath();
  ctx.arc(0, s(scale, -0.22), s(scale, 0.015), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMushroom(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#c8b89a';
  ctx.fillRect(s(scale, -0.02), s(scale, -0.08), s(scale, 0.04), s(scale, 0.08));

  ctx.fillStyle = '#a03030';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.08), s(scale, 0.08), s(scale, 0.05), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(s(scale, -0.03), s(scale, -0.1), s(scale, 0.015), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s(scale, 0.02), s(scale, -0.07), s(scale, 0.01), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawReed(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#5a6a30';
  ctx.lineWidth = s(scale, 0.015);
  ctx.lineCap = 'round';

  for (let i = -1; i <= 1; i++) {
    const bx = i * s(scale, 0.04);
    const sw1 = sway(time + i * 0.8, 1.0, 0.015);
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.quadraticCurveTo(bx + sw1 * s(scale, 1), s(scale, -0.15), bx + sw1 * s(scale, 1.5), s(scale, -0.3));
    ctx.stroke();
  }

  ctx.fillStyle = '#7a5a30';
  ctx.beginPath();
  ctx.ellipse(sway(time, 1.0, 0.015) * s(scale, 1.5), s(scale, -0.31), s(scale, 0.025), s(scale, 0.04), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawTallGrass(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(80,110,50,0.7)';
  ctx.lineWidth = s(scale, 0.012);
  ctx.lineCap = 'round';

  for (let i = 0; i < 5; i++) {
    const bx = (i - 2) * s(scale, 0.03);
    const sw1 = sway(time + i * 0.4, 1.4, 0.02);
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.quadraticCurveTo(bx + sw1 * s(scale, 0.8), s(scale, -0.12), bx + sw1 * s(scale, 1.2), s(scale, -0.2 - i * 0.01));
    ctx.stroke();
  }

  ctx.restore();
}

function drawVine(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(60,100,30,0.6)';
  ctx.lineWidth = s(scale, 0.018);
  ctx.lineCap = 'round';

  const sw1 = sway(time, 0.5, 0.02);
  ctx.beginPath();
  ctx.moveTo(0, s(scale, -0.6));
  ctx.bezierCurveTo(
    s(scale, 0.1 + sw1), s(scale, -0.45),
    s(scale, -0.08 + sw1), s(scale, -0.25),
    s(scale, 0.05), 0
  );
  ctx.stroke();

  ctx.fillStyle = 'rgba(60,100,30,0.5)';
  for (let t = 0.2; t < 0.9; t += 0.25) {
    const lx = s(scale, 0.03 * Math.sin(t * 5) + sw1 * 0.3);
    const ly = s(scale, -0.6 + t * 0.6);
    ctx.beginPath();
    ctx.ellipse(lx, ly, s(scale, 0.025), s(scale, 0.015), t * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  ENVIRONMENT: Rocks & terrain                                       */
/* ------------------------------------------------------------------ */

function drawRock(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#6a5d4a';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.04), s(scale, 0.12), s(scale, 0.07), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(140,125,100,0.35)';
  ctx.beginPath();
  ctx.ellipse(s(scale, -0.03), s(scale, -0.06), s(scale, 0.05), s(scale, 0.03), -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBoulder(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5a5045';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.18), 0);
  ctx.lineTo(s(scale, -0.2), s(scale, -0.1));
  ctx.lineTo(s(scale, -0.12), s(scale, -0.2));
  ctx.lineTo(s(scale, 0.05), s(scale, -0.22));
  ctx.lineTo(s(scale, 0.18), s(scale, -0.12));
  ctx.lineTo(s(scale, 0.16), 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(100,90,80,0.3)';
  ctx.beginPath();
  ctx.moveTo(s(scale, 0.05), s(scale, -0.22));
  ctx.lineTo(s(scale, 0.18), s(scale, -0.12));
  ctx.lineTo(s(scale, 0.16), 0);
  ctx.lineTo(s(scale, 0.02), 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawRubble(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  const pieces = [
    { dx: -0.1, dy: -0.02, w: 0.08, h: 0.04, r: 0.3 },
    { dx: 0.05, dy: -0.03, w: 0.1, h: 0.05, r: -0.2 },
    { dx: -0.02, dy: -0.06, w: 0.06, h: 0.07, r: 0.5 },
    { dx: 0.08, dy: 0, w: 0.05, h: 0.03, r: 0.1 },
  ];
  for (const p of pieces) {
    ctx.save();
    ctx.translate(s(scale, p.dx), s(scale, p.dy));
    ctx.rotate(p.r);
    ctx.fillStyle = '#6a6055';
    ctx.fillRect(0, 0, s(scale, p.w), s(scale, p.h));
    ctx.restore();
  }
  ctx.restore();
}

function drawLog(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5a4530';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.03), s(scale, 0.2), s(scale, 0.035), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7a6040';
  ctx.beginPath();
  ctx.ellipse(s(scale, -0.2), s(scale, -0.03), s(scale, 0.035), s(scale, 0.035), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(60,45,25,0.4)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(s(scale, -0.2), s(scale, -0.03), s(scale, 0.02), 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawDriftwood(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#8a7a60';
  ctx.lineWidth = s(scale, 0.03);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.15), s(scale, -0.01));
  ctx.quadraticCurveTo(0, s(scale, -0.04), s(scale, 0.15), s(scale, -0.02));
  ctx.stroke();

  ctx.lineWidth = s(scale, 0.015);
  ctx.beginPath();
  ctx.moveTo(s(scale, 0.08), s(scale, -0.03));
  ctx.lineTo(s(scale, 0.12), s(scale, -0.08));
  ctx.stroke();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  ENVIRONMENT: Cave elements                                         */
/* ------------------------------------------------------------------ */

function drawStalactite(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5a5550';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.06), 0);
  ctx.lineTo(s(scale, 0.01), s(scale, 0.3));
  ctx.lineTo(s(scale, 0.06), 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(100,95,90,0.3)';
  ctx.beginPath();
  ctx.moveTo(s(scale, 0.01), s(scale, 0.3));
  ctx.lineTo(s(scale, 0.06), 0);
  ctx.lineTo(s(scale, 0.02), 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawStalagmite(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5a5550';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.05), 0);
  ctx.lineTo(0, s(scale, -0.25));
  ctx.lineTo(s(scale, 0.05), 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(100,95,90,0.3)';
  ctx.beginPath();
  ctx.moveTo(0, s(scale, -0.25));
  ctx.lineTo(s(scale, 0.05), 0);
  ctx.lineTo(s(scale, 0.02), 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawCrystal(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);

  const glow = 0.3 + 0.15 * Math.sin(time * 2.5);
  const colors = [
    [100, 160, 255], [160, 100, 255], [100, 255, 200],
  ];
  const c = colors[Math.floor(Math.abs(x * 3)) % colors.length];

  const shards = [
    { dx: 0, h: 0.22, w: 0.04, r: 0 },
    { dx: -0.04, h: 0.16, w: 0.03, r: -0.2 },
    { dx: 0.05, h: 0.18, w: 0.035, r: 0.15 },
  ];
  for (const sh of shards) {
    ctx.save();
    ctx.translate(s(scale, sh.dx), 0);
    ctx.rotate(sh.r);
    ctx.fillStyle = rgba(c[0], c[1], c[2], 0.6 + glow * 0.3);
    ctx.beginPath();
    ctx.moveTo(s(scale, -sh.w / 2), 0);
    ctx.lineTo(0, s(scale, -sh.h));
    ctx.lineTo(s(scale, sh.w / 2), 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Glow
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(0, s(scale, -0.1), 0, 0, s(scale, -0.1), s(scale, 0.15));
  grad.addColorStop(0, rgba(c[0], c[1], c[2], glow * 0.3));
  grad.addColorStop(1, rgba(c[0], c[1], c[2], 0));
  ctx.fillStyle = grad;
  ctx.fillRect(s(scale, -0.2), s(scale, -0.3), s(scale, 0.4), s(scale, 0.4));
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  ENVIRONMENT: Buildings & structures                                */
/* ------------------------------------------------------------------ */

function drawBuilding(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  const bw = s(scale, 0.3);
  const bh = s(scale, 0.5);

  ctx.fillStyle = '#8a7560';
  ctx.fillRect(-bw / 2, -bh, bw, bh);

  // Roof
  ctx.fillStyle = '#5a3a25';
  ctx.beginPath();
  ctx.moveTo(0, -bh - s(scale, 0.25));
  ctx.lineTo(-bw / 2 - s(scale, 0.05), -bh);
  ctx.lineTo(bw / 2 + s(scale, 0.05), -bh);
  ctx.closePath();
  ctx.fill();

  // Window
  ctx.fillStyle = '#d4a840';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(-s(scale, 0.06), -bh + s(scale, 0.1), s(scale, 0.12), s(scale, 0.1));
  ctx.globalAlpha = 1;

  // Door
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(-s(scale, 0.04), -s(scale, 0.18), s(scale, 0.08), s(scale, 0.18));

  ctx.strokeStyle = 'rgba(60,45,30,0.4)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-bw / 2, -bh, bw, bh);

  ctx.restore();
}

function drawCottage(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  const bw = s(scale, 0.25);
  const bh = s(scale, 0.3);

  ctx.fillStyle = '#a09070';
  ctx.fillRect(-bw / 2, -bh, bw, bh);

  ctx.fillStyle = '#6a4a30';
  ctx.beginPath();
  ctx.moveTo(0, -bh - s(scale, 0.18));
  ctx.lineTo(-bw / 2 - s(scale, 0.03), -bh);
  ctx.lineTo(bw / 2 + s(scale, 0.03), -bh);
  ctx.closePath();
  ctx.fill();

  // Chimney
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(s(scale, 0.06), -bh - s(scale, 0.25), s(scale, 0.04), s(scale, 0.12));

  ctx.fillStyle = '#4a3020';
  ctx.fillRect(-s(scale, 0.035), -s(scale, 0.15), s(scale, 0.07), s(scale, 0.15));

  ctx.restore();
}

function drawTent(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#8a7a5a';
  ctx.beginPath();
  ctx.moveTo(0, s(scale, -0.4));
  ctx.lineTo(s(scale, -0.2), 0);
  ctx.lineTo(s(scale, 0.2), 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(120,110,80,0.4)';
  ctx.beginPath();
  ctx.moveTo(0, s(scale, -0.4));
  ctx.lineTo(s(scale, 0.2), 0);
  ctx.lineTo(s(scale, 0.05), 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#3a2a18';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.06), 0);
  ctx.lineTo(0, s(scale, -0.15));
  ctx.lineTo(s(scale, 0.06), 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPillar(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  const pw = s(scale, 0.06);
  const ph = s(scale, 0.6);

  ctx.fillStyle = '#7a7570';
  ctx.fillRect(-pw / 2, -ph, pw, ph);

  // Capital
  ctx.fillRect(-pw * 0.8, -ph - s(scale, 0.03), pw * 1.6, s(scale, 0.03));
  // Base
  ctx.fillRect(-pw * 0.7, -s(scale, 0.025), pw * 1.4, s(scale, 0.025));

  ctx.strokeStyle = 'rgba(60,55,50,0.3)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-pw / 2, -ph, pw, ph);

  ctx.restore();
}

function drawBrokenPillar(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  const pw = s(scale, 0.06);
  const ph = s(scale, 0.35);

  ctx.fillStyle = '#7a7570';
  ctx.fillRect(-pw / 2, -ph, pw, ph);

  // Broken top — jagged
  ctx.fillStyle = '#8a8580';
  ctx.beginPath();
  ctx.moveTo(-pw / 2, -ph);
  ctx.lineTo(-pw * 0.3, -ph - s(scale, 0.04));
  ctx.lineTo(0, -ph - s(scale, 0.02));
  ctx.lineTo(pw * 0.3, -ph - s(scale, 0.05));
  ctx.lineTo(pw / 2, -ph);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(-pw * 0.7, -s(scale, 0.025), pw * 1.4, s(scale, 0.025));

  ctx.restore();
}

function drawArch(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  const hw = s(scale, 0.2);
  const ph = s(scale, 0.55);
  const pw = s(scale, 0.05);

  ctx.fillStyle = '#7a7570';
  // Left pillar
  ctx.fillRect(-hw - pw / 2, -ph, pw, ph);
  // Right pillar
  ctx.fillRect(hw - pw / 2, -ph, pw, ph);

  // Arch
  ctx.strokeStyle = '#7a7570';
  ctx.lineWidth = pw;
  ctx.beginPath();
  ctx.arc(0, -ph, hw, Math.PI, 0);
  ctx.stroke();

  // Crack detail
  ctx.strokeStyle = 'rgba(50,45,40,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.3, -ph - hw * 0.8);
  ctx.lineTo(-hw * 0.2, -ph - hw * 0.5);
  ctx.lineTo(-hw * 0.35, -ph - hw * 0.3);
  ctx.stroke();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  ENVIRONMENT: Objects & furniture                                    */
/* ------------------------------------------------------------------ */

function drawTable(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#6a5030';
  ctx.fillRect(s(scale, -0.15), s(scale, -0.18), s(scale, 0.3), s(scale, 0.03));

  // Legs
  ctx.fillRect(s(scale, -0.13), s(scale, -0.15), s(scale, 0.02), s(scale, 0.15));
  ctx.fillRect(s(scale, 0.11), s(scale, -0.15), s(scale, 0.02), s(scale, 0.15));

  ctx.restore();
}

function drawChair(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#6a5030';
  ctx.fillRect(s(scale, -0.05), s(scale, -0.1), s(scale, 0.1), s(scale, 0.02));

  ctx.fillRect(s(scale, -0.04), s(scale, -0.08), s(scale, 0.015), s(scale, 0.08));
  ctx.fillRect(s(scale, 0.03), s(scale, -0.08), s(scale, 0.015), s(scale, 0.08));

  // Back
  ctx.fillRect(s(scale, -0.05), s(scale, -0.2), s(scale, 0.015), s(scale, 0.12));
  ctx.fillRect(s(scale, -0.05), s(scale, -0.2), s(scale, 0.06), s(scale, 0.015));

  ctx.restore();
}

function drawBarrel(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#6a4a25';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.08), s(scale, 0.07), s(scale, 0.1), 0, 0, Math.PI * 2);
  ctx.fill();

  // Bands
  ctx.strokeStyle = '#4a3a20';
  ctx.lineWidth = s(scale, 0.01);
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.04), s(scale, 0.068), s(scale, 0.015), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.12), s(scale, 0.068), s(scale, 0.015), 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawCrate(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  const w = s(scale, 0.12);
  const h = s(scale, 0.1);

  ctx.fillStyle = '#7a6040';
  ctx.fillRect(-w / 2, -h, w, h);

  ctx.strokeStyle = '#5a4530';
  ctx.lineWidth = s(scale, 0.01);
  ctx.strokeRect(-w / 2, -h, w, h);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.stroke();

  ctx.restore();
}

function drawBedroll(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5a6a4a';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.025), s(scale, 0.12), s(scale, 0.025), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7a8a5a';
  ctx.beginPath();
  ctx.ellipse(s(scale, -0.1), s(scale, -0.03), s(scale, 0.04), s(scale, 0.03), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawWell(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  // Base
  ctx.fillStyle = '#6a6560';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.02), s(scale, 0.1), s(scale, 0.04), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.08), s(scale, 0.1), s(scale, 0.04), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(s(scale, -0.1), s(scale, -0.08), s(scale, 0.2), s(scale, 0.06));

  // Posts
  ctx.fillStyle = '#5a4530';
  ctx.fillRect(s(scale, -0.08), s(scale, -0.25), s(scale, 0.02), s(scale, 0.18));
  ctx.fillRect(s(scale, 0.06), s(scale, -0.25), s(scale, 0.02), s(scale, 0.18));

  // Roof
  ctx.fillStyle = '#4a3520';
  ctx.beginPath();
  ctx.moveTo(0, s(scale, -0.32));
  ctx.lineTo(s(scale, -0.12), s(scale, -0.25));
  ctx.lineTo(s(scale, 0.12), s(scale, -0.25));
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawFence(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#6a5535';
  // Posts
  ctx.fillRect(s(scale, -0.15), s(scale, -0.18), s(scale, 0.02), s(scale, 0.18));
  ctx.fillRect(s(scale, 0.13), s(scale, -0.18), s(scale, 0.02), s(scale, 0.18));
  // Rails
  ctx.fillRect(s(scale, -0.15), s(scale, -0.14), s(scale, 0.3), s(scale, 0.015));
  ctx.fillRect(s(scale, -0.15), s(scale, -0.07), s(scale, 0.3), s(scale, 0.015));

  ctx.restore();
}

function drawSignpost(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5a4530';
  ctx.fillRect(s(scale, -0.015), s(scale, -0.35), s(scale, 0.03), s(scale, 0.35));

  ctx.fillStyle = '#7a6540';
  ctx.beginPath();
  ctx.moveTo(s(scale, 0.015), s(scale, -0.3));
  ctx.lineTo(s(scale, 0.15), s(scale, -0.28));
  ctx.lineTo(s(scale, 0.15), s(scale, -0.24));
  ctx.lineTo(s(scale, 0.015), s(scale, -0.22));
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawMilestone(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#7a7570';
  ctx.beginPath();
  ctx.moveTo(s(scale, -0.04), 0);
  ctx.lineTo(s(scale, -0.035), s(scale, -0.15));
  ctx.lineTo(0, s(scale, -0.18));
  ctx.lineTo(s(scale, 0.035), s(scale, -0.15));
  ctx.lineTo(s(scale, 0.04), 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawLampPost(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#3a3535';
  ctx.fillRect(s(scale, -0.015), s(scale, -0.45), s(scale, 0.03), s(scale, 0.45));

  // Lamp
  ctx.fillStyle = '#4a4540';
  ctx.fillRect(s(scale, -0.04), s(scale, -0.48), s(scale, 0.08), s(scale, 0.04));

  // Glow
  const fl = flicker(time, 0.4, 0.15);
  const grad = ctx.createRadialGradient(0, s(scale, -0.46), 0, 0, s(scale, -0.46), s(scale, 0.15));
  grad.addColorStop(0, rgba(255, 200, 100, fl));
  grad.addColorStop(1, rgba(255, 180, 80, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(s(scale, -0.2), s(scale, -0.6), s(scale, 0.4), s(scale, 0.3));

  ctx.restore();
}

function drawCampfire(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);

  // Stones
  ctx.fillStyle = '#5a5550';
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * s(scale, 0.08), -s(scale, 0.01) + Math.sin(angle) * s(scale, 0.03), s(scale, 0.02), 0, Math.PI * 2);
    ctx.fill();
  }

  // Logs
  ctx.fillStyle = '#4a3520';
  ctx.save();
  ctx.rotate(0.3);
  ctx.fillRect(s(scale, -0.08), s(scale, -0.02), s(scale, 0.16), s(scale, 0.025));
  ctx.restore();
  ctx.save();
  ctx.rotate(-0.3);
  ctx.fillRect(s(scale, -0.08), s(scale, -0.02), s(scale, 0.16), s(scale, 0.025));
  ctx.restore();

  // Fire
  const fl = flicker(time, 1, 0.3);
  const flames = [
    { dx: 0, h: 0.12 + fl * 0.03, w: 0.04, c: [255, 180, 40] },
    { dx: -0.02, h: 0.09 + fl * 0.02, w: 0.03, c: [255, 120, 20] },
    { dx: 0.025, h: 0.1 + fl * 0.02, w: 0.03, c: [255, 140, 30] },
  ];
  for (const f of flames) {
    ctx.fillStyle = rgba(f.c[0], f.c[1], f.c[2], 0.8);
    ctx.beginPath();
    ctx.ellipse(s(scale, f.dx), s(scale, -f.h / 2 - 0.02), s(scale, f.w), s(scale, f.h / 2), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Glow
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(0, s(scale, -0.05), 0, 0, s(scale, -0.05), s(scale, 0.2));
  grad.addColorStop(0, rgba(255, 150, 50, 0.15 + fl * 0.05));
  grad.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(s(scale, -0.3), s(scale, -0.3), s(scale, 0.6), s(scale, 0.4));
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
}

function drawTorchSconce(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#4a4540';
  ctx.fillRect(s(scale, -0.01), s(scale, -0.2), s(scale, 0.02), s(scale, 0.12));

  ctx.fillRect(s(scale, -0.02), s(scale, -0.22), s(scale, 0.04), s(scale, 0.03));

  const fl = flicker(time, 0.5, 0.2);
  ctx.fillStyle = rgba(255, 160, 40, 0.7 + fl * 0.2);
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.26), s(scale, 0.02), s(scale, 0.04 + fl * 0.01), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(0, s(scale, -0.24), 0, 0, s(scale, -0.24), s(scale, 0.12));
  grad.addColorStop(0, rgba(255, 160, 60, 0.12 + fl * 0.04));
  grad.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(s(scale, -0.15), s(scale, -0.4), s(scale, 0.3), s(scale, 0.3));
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
}

function drawBanner(ctx, x, y, scale, time) {
  const sw = sway(time, 1.5, 0.02 * scale);
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#4a4540';
  ctx.fillRect(s(scale, -0.01), s(scale, -0.4), s(scale, 0.02), s(scale, 0.4));

  ctx.fillStyle = '#8a2020';
  ctx.beginPath();
  ctx.moveTo(s(scale, 0.01), s(scale, -0.38));
  ctx.lineTo(s(scale, 0.14) + sw * s(scale, 0.5), s(scale, -0.36));
  ctx.lineTo(s(scale, 0.12) + sw * s(scale, 0.5), s(scale, -0.28));
  ctx.lineTo(s(scale, 0.14) + sw * s(scale, 0.5), s(scale, -0.2));
  ctx.lineTo(s(scale, 0.01), s(scale, -0.22));
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawArmorStand(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  // Stand
  ctx.fillStyle = '#5a5040';
  ctx.fillRect(s(scale, -0.01), s(scale, -0.35), s(scale, 0.02), s(scale, 0.35));
  ctx.fillRect(s(scale, -0.06), 0, s(scale, 0.12), s(scale, 0.015));

  // Crossbar
  ctx.fillRect(s(scale, -0.1), s(scale, -0.3), s(scale, 0.2), s(scale, 0.015));

  // Helmet shape
  ctx.fillStyle = '#6a6a6a';
  ctx.beginPath();
  ctx.arc(0, s(scale, -0.38), s(scale, 0.04), 0, Math.PI * 2);
  ctx.fill();

  // Chest plate
  ctx.fillStyle = '#7a7a7a';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.22), s(scale, 0.06), s(scale, 0.08), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMug(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#6a5535';
  ctx.fillRect(s(scale, -0.025), s(scale, -0.06), s(scale, 0.05), s(scale, 0.06));

  ctx.strokeStyle = '#5a4525';
  ctx.lineWidth = s(scale, 0.008);
  ctx.beginPath();
  ctx.arc(s(scale, 0.035), s(scale, -0.035), s(scale, 0.015), -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  ctx.restore();
}

function drawChandelier(ctx, x, y, scale, time) {
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = '#4a4540';
  ctx.lineWidth = s(scale, 0.01);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s(scale, 0.15));
  ctx.stroke();

  // Ring
  ctx.beginPath();
  ctx.ellipse(0, s(scale, 0.16), s(scale, 0.12), s(scale, 0.03), 0, 0, Math.PI * 2);
  ctx.stroke();

  // Candles
  const fl = flicker(time, 0.4, 0.15);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const cx = Math.cos(angle) * s(scale, 0.1);
    const cy = s(scale, 0.16) + Math.sin(angle) * s(scale, 0.02);
    ctx.fillStyle = rgba(255, 200, 100, 0.6 + fl * 0.2);
    ctx.beginPath();
    ctx.arc(cx, cy - s(scale, 0.02), s(scale, 0.012), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawShelf(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#5a4530';
  ctx.fillRect(s(scale, -0.15), s(scale, -0.3), s(scale, 0.3), s(scale, 0.015));
  ctx.fillRect(s(scale, -0.15), s(scale, -0.15), s(scale, 0.3), s(scale, 0.015));

  // Bottles
  ctx.fillStyle = '#4a6a4a';
  ctx.fillRect(s(scale, -0.1), s(scale, -0.34), s(scale, 0.02), s(scale, 0.04));
  ctx.fillStyle = '#6a4a3a';
  ctx.fillRect(s(scale, -0.04), s(scale, -0.35), s(scale, 0.02), s(scale, 0.05));
  ctx.fillStyle = '#3a4a6a';
  ctx.fillRect(s(scale, 0.04), s(scale, -0.34), s(scale, 0.02), s(scale, 0.04));

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  ENVIRONMENT: Sky / atmospheric                                     */
/* ------------------------------------------------------------------ */

function drawCloud(ctx, x, y, scale, time) {
  const drift = time * 3;
  ctx.save();
  ctx.translate(x + drift % (scale * BASE * 3), y);
  ctx.globalAlpha = 0.25;

  ctx.fillStyle = '#c0c8d0';
  const blobs = [
    { dx: 0, dy: 0, rx: 0.15, ry: 0.06 },
    { dx: -0.1, dy: 0.01, rx: 0.1, ry: 0.05 },
    { dx: 0.1, dy: 0.01, rx: 0.1, ry: 0.05 },
    { dx: 0, dy: -0.03, rx: 0.08, ry: 0.04 },
  ];
  for (const b of blobs) {
    ctx.beginPath();
    ctx.ellipse(s(scale, b.dx), s(scale, b.dy), s(scale, b.rx), s(scale, b.ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawStar(ctx, x, y, scale, time) {
  const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(time * (1 + scale) + x));
  ctx.save();
  ctx.globalAlpha = twinkle;
  ctx.fillStyle = '#fffbe0';
  ctx.beginPath();
  ctx.arc(x, y, s(scale, 0.008), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawMoon(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#e0dcc0';
  ctx.beginPath();
  ctx.arc(0, 0, s(scale, 0.08), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(200,195,170,0.3)';
  ctx.beginPath();
  ctx.arc(s(scale, -0.02), s(scale, -0.02), s(scale, 0.025), 0, Math.PI * 2);
  ctx.fill();

  // Glow
  const grad = ctx.createRadialGradient(0, 0, s(scale, 0.08), 0, 0, s(scale, 0.25));
  grad.addColorStop(0, 'rgba(180,180,200,0.12)');
  grad.addColorStop(1, 'rgba(180,180,200,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(s(scale, -0.3), s(scale, -0.3), s(scale, 0.6), s(scale, 0.6));

  ctx.restore();
}

function drawSeagull(ctx, x, y, scale, time) {
  const wingPhase = Math.sin(time * 4 + x) * 0.3;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = s(scale, 0.012);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(s(scale, -0.06), s(scale, wingPhase * 0.03));
  ctx.quadraticCurveTo(s(scale, -0.02), s(scale, -0.03 + wingPhase * 0.05), 0, 0);
  ctx.quadraticCurveTo(s(scale, 0.02), s(scale, -0.03 + wingPhase * 0.05), s(scale, 0.06), s(scale, wingPhase * 0.03));
  ctx.stroke();

  ctx.restore();
}

function drawSeashell(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#d0b090';
  ctx.beginPath();
  ctx.ellipse(0, s(scale, -0.015), s(scale, 0.025), s(scale, 0.015), 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}

function drawWillOWisp(ctx, x, y, scale, time) {
  const bob = Math.sin(time * 2 + x) * s(scale, 0.03);
  const glow = 0.3 + 0.2 * Math.sin(time * 3 + y);
  ctx.save();
  ctx.translate(x, y + bob);

  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s(scale, 0.08));
  grad.addColorStop(0, rgba(120, 255, 120, glow));
  grad.addColorStop(1, 'rgba(120,255,120,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(s(scale, -0.1), s(scale, -0.1), s(scale, 0.2), s(scale, 0.2));

  ctx.fillStyle = rgba(200, 255, 200, glow + 0.2);
  ctx.beginPath();
  ctx.arc(0, 0, s(scale, 0.015), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  CHARACTER rendering                                                */
/* ------------------------------------------------------------------ */

export function drawCharacter(ctx, x, y, scale, opts = {}) {
  const {
    species = 'Human',
    role = 'neutral',
    name = '',
    weapon = null,
    isActive = false,
    healthPct = 1,
    time = 0,
  } = opts;

  const proportions = {
    Human: { h: 1.0, w: 1.0 },
    Dwarf: { h: 0.7, w: 1.2 },
    Elf: { h: 1.05, w: 0.85 },
    Halfling: { h: 0.6, w: 0.9 },
  }[species] || { h: 1.0, w: 1.0 };

  const colors = {
    player:  { body: [160, 120, 220], outline: [200, 170, 255], glow: [180, 140, 255] },
    ally:    { body: [80, 160, 90], outline: [120, 200, 130], glow: [100, 200, 120] },
    enemy:   { body: [180, 60, 60], outline: [220, 90, 90], glow: [220, 70, 70] },
    neutral: { body: [140, 140, 140], outline: [180, 180, 180], glow: [170, 170, 170] },
  }[role] || { body: [140, 140, 140], outline: [180, 180, 180], glow: [170, 170, 170] };

  const bob = Math.sin(time * 1.5 + x) * s(scale, 0.008);
  const h = s(scale, 0.4) * proportions.h;
  const w = s(scale, 0.12) * proportions.w;

  ctx.save();
  ctx.translate(x, y + bob);

  // Glow aura for active / player
  if (isActive || role === 'player') {
    const grad = ctx.createRadialGradient(0, -h / 2, 0, 0, -h / 2, h * 0.7);
    grad.addColorStop(0, rgba(colors.glow[0], colors.glow[1], colors.glow[2], 0.15));
    grad.addColorStop(1, rgba(colors.glow[0], colors.glow[1], colors.glow[2], 0));
    ctx.fillStyle = grad;
    ctx.fillRect(-h * 0.7, -h * 1.2, h * 1.4, h * 1.4);
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.8, s(scale, 0.015), 0, 0, Math.PI * 2);
  ctx.fill();

  // Body silhouette
  ctx.fillStyle = rgba(colors.body[0], colors.body[1], colors.body[2], 0.85);
  ctx.beginPath();
  // Legs
  ctx.moveTo(-w * 0.35, 0);
  ctx.lineTo(-w * 0.25, -h * 0.4);
  ctx.lineTo(w * 0.25, -h * 0.4);
  ctx.lineTo(w * 0.35, 0);
  // Torso
  ctx.lineTo(w * 0.25, -h * 0.4);
  ctx.lineTo(w * 0.4, -h * 0.55);
  ctx.lineTo(w * 0.35, -h * 0.75);
  ctx.lineTo(-w * 0.35, -h * 0.75);
  ctx.lineTo(-w * 0.4, -h * 0.55);
  ctx.lineTo(-w * 0.25, -h * 0.4);
  ctx.closePath();
  ctx.fill();

  // Head
  const headR = w * 0.4;
  ctx.beginPath();
  ctx.arc(0, -h * 0.75 - headR * 0.9, headR, 0, Math.PI * 2);
  ctx.fill();

  // Outline
  ctx.strokeStyle = rgba(colors.outline[0], colors.outline[1], colors.outline[2], 0.5);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Weapon hint
  if (weapon) {
    ctx.strokeStyle = rgba(colors.outline[0], colors.outline[1], colors.outline[2], 0.6);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    if (weapon === 'staff') {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, -h * 0.1);
      ctx.lineTo(w * 0.4, -h * 1.05);
      ctx.stroke();
    } else if (weapon === 'bow') {
      ctx.beginPath();
      ctx.arc(-w * 0.6, -h * 0.55, h * 0.2, -0.8, 0.8);
      ctx.stroke();
    } else {
      // Sword / generic
      ctx.beginPath();
      ctx.moveTo(w * 0.5, -h * 0.3);
      ctx.lineTo(w * 0.6, -h * 0.7);
      ctx.stroke();
    }
  }

  // Health bar (combat)
  if (healthPct < 1) {
    const barW = w * 1.6;
    const barH = s(scale, 0.015);
    const barY = -h - headR * 2 - s(scale, 0.04);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-barW / 2, barY, barW, barH);

    const hpColor = healthPct > 0.5 ? [80, 200, 80] : healthPct > 0.25 ? [220, 180, 40] : [220, 50, 50];
    ctx.fillStyle = rgba(hpColor[0], hpColor[1], hpColor[2], 0.8);
    ctx.fillRect(-barW / 2, barY, barW * Math.max(0, healthPct), barH);
  }

  // Name label
  if (name) {
    ctx.font = `${Math.max(8, s(scale, 0.04))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(colors.outline[0], colors.outline[1], colors.outline[2], 0.8);
    ctx.fillText(name, 0, s(scale, 0.06));
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  DISPATCH TABLE                                                     */
/* ------------------------------------------------------------------ */

export const SPRITE_DRAW = {
  deciduousTree: drawDeciduousTree,
  pine: drawPine,
  deadTree: (ctx, x, y, sc, _t) => drawDeadTree(ctx, x, y, sc),
  willowTree: drawWillowTree,
  palm: drawPalm,
  bush: drawBush,
  fern: drawFern,
  flower: (ctx, x, y, sc, _t) => drawFlower(ctx, x, y, sc),
  mushroom: (ctx, x, y, sc, _t) => drawMushroom(ctx, x, y, sc),
  reed: drawReed,
  tallGrass: drawTallGrass,
  vine: drawVine,
  rock: (ctx, x, y, sc, _t) => drawRock(ctx, x, y, sc),
  boulder: (ctx, x, y, sc, _t) => drawBoulder(ctx, x, y, sc),
  rubble: (ctx, x, y, sc, _t) => drawRubble(ctx, x, y, sc),
  log: (ctx, x, y, sc, _t) => drawLog(ctx, x, y, sc),
  driftwood: (ctx, x, y, sc, _t) => drawDriftwood(ctx, x, y, sc),
  stalactite: (ctx, x, y, sc, _t) => drawStalactite(ctx, x, y, sc),
  stalagmite: (ctx, x, y, sc, _t) => drawStalagmite(ctx, x, y, sc),
  crystal: drawCrystal,
  building: (ctx, x, y, sc, _t) => drawBuilding(ctx, x, y, sc),
  cottage: (ctx, x, y, sc, _t) => drawCottage(ctx, x, y, sc),
  tent: (ctx, x, y, sc, _t) => drawTent(ctx, x, y, sc),
  pillar: (ctx, x, y, sc, _t) => drawPillar(ctx, x, y, sc),
  brokenPillar: (ctx, x, y, sc, _t) => drawBrokenPillar(ctx, x, y, sc),
  arch: (ctx, x, y, sc, _t) => drawArch(ctx, x, y, sc),
  table: (ctx, x, y, sc, _t) => drawTable(ctx, x, y, sc),
  chair: (ctx, x, y, sc, _t) => drawChair(ctx, x, y, sc),
  barrel: (ctx, x, y, sc, _t) => drawBarrel(ctx, x, y, sc),
  crate: (ctx, x, y, sc, _t) => drawCrate(ctx, x, y, sc),
  bedroll: (ctx, x, y, sc, _t) => drawBedroll(ctx, x, y, sc),
  well: (ctx, x, y, sc, _t) => drawWell(ctx, x, y, sc),
  fence: (ctx, x, y, sc, _t) => drawFence(ctx, x, y, sc),
  signpost: (ctx, x, y, sc, _t) => drawSignpost(ctx, x, y, sc),
  milestone: (ctx, x, y, sc, _t) => drawMilestone(ctx, x, y, sc),
  lampPost: drawLampPost,
  campfire: drawCampfire,
  torchSconce: drawTorchSconce,
  banner: drawBanner,
  armorStand: (ctx, x, y, sc, _t) => drawArmorStand(ctx, x, y, sc),
  mug: (ctx, x, y, sc, _t) => drawMug(ctx, x, y, sc),
  chandelier: drawChandelier,
  shelf: (ctx, x, y, sc, _t) => drawShelf(ctx, x, y, sc),
  cloud: drawCloud,
  star: drawStar,
  moon: (ctx, x, y, sc, _t) => drawMoon(ctx, x, y, sc),
  seagull: drawSeagull,
  seashell: (ctx, x, y, sc, _t) => drawSeashell(ctx, x, y, sc),
  willOWisp: drawWillOWisp,
};
