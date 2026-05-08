import { gameData } from '../../../services/gameDataService';

export const COLORS = {
  bg: '#0e0e10',
  bgGrad: '#141416',
  card: '#19191c',
  cardBorder: '#2a2a2e',
  primary: '#c59aff',
  primaryDim: '#9547f7',
  error: '#ff6e84',
  errorDim: '#b8344a',
  tertiary: '#ffefd5',
  text: '#fffbfe',
  textDim: '#adaaad',
  outline: '#48474a',
  green: '#66bb6a',
  movementZone: 'rgba(197,154,255,0.08)',
  movementZoneBorder: 'rgba(197,154,255,0.25)',
  meleeArc: 'rgba(255,239,213,0.12)',
  yardLine: 'rgba(72,71,74,0.15)',
  yardText: 'rgba(72,71,74,0.4)',
};

export const TOKEN_RADIUS = 26;
export const BATTLEFIELD_PAD_X = 40;
export const BATTLEFIELD_PAD_TOP = 8;

const PARTICLE_COUNT = 35;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function yardToX(position, canvasW) {
  const usable = canvasW - BATTLEFIELD_PAD_X * 2;
  return BATTLEFIELD_PAD_X + (position / gameData.BATTLEFIELD_MAX) * usable;
}

export function xToYard(x, canvasW) {
  const usable = canvasW - BATTLEFIELD_PAD_X * 2;
  const raw = ((x - BATTLEFIELD_PAD_X) / usable) * gameData.BATTLEFIELD_MAX;
  return Math.max(0, Math.min(gameData.BATTLEFIELD_MAX, Math.round(raw)));
}

export function initParticles(w, h) {
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.6 - 0.2,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
      hue: Math.random() > 0.5 ? 275 : 15,
    });
  }
  return particles;
}

export function drawBackground(ctx, w, h, now, anim) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, COLORS.bg);
  grad.addColorStop(1, COLORS.bgGrad);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, 'rgba(197,154,255,0.015)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  if (!anim.particles.length) anim.particles = initParticles(w, h);
  for (const p of anim.particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
    if (p.x < -5) p.x = w + 5;
    if (p.x > w + 5) p.x = -5;
    const flicker = 0.6 + 0.4 * Math.sin(now / 800 + p.x);
    ctx.globalAlpha = p.alpha * flicker;
    ctx.fillStyle = `hsl(${p.hue}, 80%, 70%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawBattlefield(ctx, w, bfTop, bfH, _now) {
  ctx.fillStyle = 'rgba(25,25,28,0.3)';
  roundRect(ctx, BATTLEFIELD_PAD_X - 12, bfTop - 4, w - (BATTLEFIELD_PAD_X - 12) * 2, bfH + 8, 6);
  ctx.fill();

  for (let yard = 0; yard <= gameData.BATTLEFIELD_MAX; yard++) {
    const x = yardToX(yard, w);
    const isMajor = yard % 5 === 0;
    ctx.strokeStyle = isMajor ? 'rgba(72,71,74,0.25)' : COLORS.yardLine;
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, bfTop + 2);
    ctx.lineTo(x, bfTop + bfH - 2);
    ctx.stroke();

    if (isMajor) {
      ctx.font = '8px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = COLORS.yardText;
      ctx.fillText(`${yard}`, x, bfTop + bfH - 12);
    }
  }
}

export function drawMovementZone(ctx, w, bfTop, bfH, myCombatant, hoverYard) {
  const remaining = myCombatant.movementAllowance - (myCombatant.movementUsed || 0);
  if (remaining <= 0) return;

  const pos = myCombatant.position ?? 0;
  const minYard = Math.max(0, pos - remaining);
  const maxYard = Math.min(gameData.BATTLEFIELD_MAX, pos + remaining);
  const x1 = yardToX(minYard, w);
  const x2 = yardToX(maxYard, w);

  ctx.fillStyle = COLORS.movementZone;
  ctx.fillRect(x1, bfTop, x2 - x1, bfH);

  ctx.strokeStyle = COLORS.movementZoneBorder;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x1, bfTop, x2 - x1, bfH);
  ctx.setLineDash([]);

  if (hoverYard !== null && hoverYard >= minYard && hoverYard <= maxYard && hoverYard !== pos) {
    const ghostX = yardToX(hoverYard, w);
    const ghostY = bfTop + bfH / 2;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, TOKEN_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.primary;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawMeleeEngagements(ctx, combatants, w, centerY, now) {
  const active = combatants.filter((c) => !c.isDefeated);
  const friendlyActive = active.filter((c) => c.type === 'player' || c.type === 'ally');
  const enemyActive = active.filter((c) => c.type === 'enemy');

  ctx.save();
  for (const f of friendlyActive) {
    for (const e of enemyActive) {
      const dist = Math.abs((f.position ?? 0) - (e.position ?? 0));
      if (dist <= gameData.MELEE_RANGE) {
        const x1 = yardToX(f.position ?? 0, w);
        const x2 = yardToX(e.position ?? 0, w);
        const midX = (x1 + x2) / 2;
        const arcH = 20 + Math.sin(now / 1200) * 4;

        ctx.strokeStyle = COLORS.meleeArc;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, centerY);
        ctx.quadraticCurveTo(midX, centerY - arcH, x2, centerY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = COLORS.tertiary;
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(now / 600);
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('\u2694', midX, centerY - arcH + 2);
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore();
}

export function drawRangeIndicator(ctx, fromCombatant, toCombatant, w, centerY) {
  if (!fromCombatant || !toCombatant) return;
  const x1 = yardToX(fromCombatant.position ?? 0, w);
  const x2 = yardToX(toCombatant.position ?? 0, w);
  const dist = Math.abs((fromCombatant.position ?? 0) - (toCombatant.position ?? 0));

  ctx.save();
  ctx.strokeStyle = 'rgba(197,154,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, centerY);
  ctx.lineTo(x2, centerY);
  ctx.stroke();
  ctx.setLineDash([]);

  const midX = (x1 + x2) / 2;
  ctx.fillStyle = 'rgba(197,154,255,0.6)';
  ctx.font = 'bold 10px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${dist}y`, midX, centerY - 4);
  ctx.restore();
}

export function drawCombatOverOverlay(ctx, w, h, friendlies, now, anim) {
  const startTs = anim.combatOverStart || now;
  const elapsed = now - startTs;
  const fadeIn = Math.min(1, elapsed / 600);
  const scaleIn = 0.85 + 0.15 * Math.min(1, elapsed / 400);

  ctx.fillStyle = `rgba(14,14,16,${0.65 * fadeIn})`;
  ctx.fillRect(0, 0, w, h);

  const isVictory = friendlies.some((c) => !c.isDefeated);
  const textY = h * 0.4;

  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.translate(w / 2, textY);
  ctx.scale(scaleIn, scaleIn);

  const glowColor = isVictory ? COLORS.primary : COLORS.error;
  const glowPulse = 0.6 + 0.4 * Math.sin(now / 500);

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 20 + glowPulse * 15;
  ctx.font = 'bold 32px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = glowColor;
  ctx.fillText(isVictory ? '\u2694 VICTORY' : '\u2620 DEFEAT', 0, 0);
  ctx.shadowBlur = 0;

  ctx.restore();

  if (elapsed > 200) {
    const sparkCount = 12;
    const sparkAge = elapsed - 200;
    if (sparkAge < 1500) {
      for (let i = 0; i < sparkCount; i++) {
        const angle = (i / sparkCount) * Math.PI * 2 + now / 2000;
        const dist = 30 + sparkAge * 0.08;
        const sparkAlpha = Math.max(0, 1 - sparkAge / 1500) * 0.7;
        const sx = w / 2 + Math.cos(angle) * dist;
        const sy = textY + Math.sin(angle) * dist * 0.5;
        ctx.globalAlpha = sparkAlpha;
        ctx.fillStyle = isVictory ? COLORS.tertiary : COLORS.error;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5 + Math.sin(now / 300 + i) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Compute DOM positions for combat tokens.
 * Returns array of { combatant, x, y } in canvas-relative px coords.
 */
export function computeTokenPositions(combatants, canvasW, centerY, bfH) {
  const positions = [];
  const yardSlots = {};

  for (const c of combatants) {
    const yard = c.position ?? 0;
    if (!yardSlots[yard]) yardSlots[yard] = [];
    yardSlots[yard].push(c);
  }

  for (const [yardStr, group] of Object.entries(yardSlots)) {
    const x = yardToX(Number(yardStr), canvasW);
    const slotH = TOKEN_RADIUS * 2 + 10;
    const totalGroupH = group.length * slotH;
    const startY = centerY - totalGroupH / 2 + slotH / 2;

    for (let i = 0; i < group.length; i++) {
      positions.push({
        combatant: group[i],
        x,
        y: startY + i * slotH,
      });
    }
  }

  return positions;
}
