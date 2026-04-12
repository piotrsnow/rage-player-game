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
export const TOKEN_RING_WIDTH = 4;
export const TRACK_HEIGHT = 44;
export const BATTLEFIELD_PAD_X = 40;
export const BATTLEFIELD_PAD_TOP = 12;

const PARTICLE_COUNT = 35;
const FLOAT_TEXT_DURATION = 1200;

function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

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

function yardToX(position, canvasW) {
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

export function drawInitiativeTrack(ctx, combatants, turnIndex, myPlayerId, isMultiplayer, canvasW, pulse, myCombatant) {
  const trackH = TRACK_HEIGHT;
  const circleR = 12;
  const spacing = Math.min(40, (canvasW - 60) / Math.max(combatants.length, 1));
  const totalW = (combatants.length - 1) * spacing;
  const startX = (canvasW - totalW) / 2;

  ctx.fillStyle = 'rgba(25,25,28,0.7)';
  roundRect(ctx, 8, 4, canvasW - 16, trackH - 4, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(72,71,74,0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, 8, 4, canvasW - 16, trackH - 4, 6);
  ctx.stroke();

  for (let i = 0; i < combatants.length; i++) {
    const c = combatants[i];
    const cx = startX + i * spacing;
    const cy = trackH / 2 + 2;
    const isActive = i === turnIndex;
    const isMe = myCombatant && c.id === myCombatant.id;
    const isEnemy = c.type === 'enemy';

    if (c.isDefeated) ctx.globalAlpha = 0.25;

    if (isActive && !c.isDefeated) {
      const glowR = circleR + 3 + pulse * 2;
      const glow = ctx.createRadialGradient(cx, cy, circleR - 2, cx, cy, glowR);
      glow.addColorStop(0, isEnemy ? 'rgba(255,110,132,0.35)' : 'rgba(197,154,255,0.35)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? (isEnemy ? COLORS.error : COLORS.primary) : (isEnemy ? COLORS.errorDim : COLORS.primaryDim);
    ctx.fill();

    if (isActive && !c.isDefeated) {
      ctx.strokeStyle = isEnemy ? COLORS.error : COLORS.primary;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.font = 'bold 9px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(getInitials(c.name), cx, cy);

    if (c.isDefeated) {
      ctx.strokeStyle = COLORS.error;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 5);
      ctx.lineTo(cx + 5, cy + 5);
      ctx.moveTo(cx + 5, cy - 5);
      ctx.lineTo(cx - 5, cy + 5);
      ctx.stroke();
    }

    if (isMe && !c.isDefeated) {
      ctx.fillStyle = COLORS.primary;
      ctx.beginPath();
      ctx.arc(cx, cy - circleR - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }
}

export function drawBattlefield(ctx, w, bfTop, bfH, now) {
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

export function drawToken(ctx, pos, turnIndex, allCombatants, selectedTarget, hoveredId, pulse, now, anim, canvasW) {
  const { combatant: c, x, y } = pos;
  const globalIdx = allCombatants.indexOf(c);
  const isActive = globalIdx === turnIndex;
  const isEnemy = c.type === 'enemy';
  const isSelected = c.id === selectedTarget;
  const isHovered = c.id === hoveredId;
  const r = TOKEN_RADIUS;

  ctx.save();
  if (c.isDefeated) ctx.globalAlpha = 0.3;

  const healthTarget = c.maxWounds > 0 ? c.wounds / c.maxWounds : 0;
  if (anim.healthBars[c.id] === undefined) anim.healthBars[c.id] = healthTarget;
  anim.healthBars[c.id] = lerp(anim.healthBars[c.id], healthTarget, 0.08);
  const healthPct = anim.healthBars[c.id];

  const flash = anim.flashTargets[c.id];
  let flashAlpha = 0;
  if (flash) {
    const elapsed = now - flash.start;
    if (elapsed < 500) {
      flashAlpha = Math.max(0, 1 - elapsed / 500) * 0.6;
    } else {
      delete anim.flashTargets[c.id];
    }
  }

  if (isActive && !c.isDefeated) {
    const spotR = r + 30 + pulse * 10;
    const spot = ctx.createRadialGradient(x, y, r * 0.5, x, y, spotR);
    spot.addColorStop(0, isEnemy ? 'rgba(255,110,132,0.08)' : 'rgba(197,154,255,0.08)');
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(x, y, spotR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(72,71,74,0.3)';
  ctx.beginPath();
  ctx.arc(x, y, r + TOKEN_RING_WIDTH / 2, 0, Math.PI * 2);
  ctx.lineWidth = TOKEN_RING_WIDTH;
  ctx.strokeStyle = 'rgba(72,71,74,0.3)';
  ctx.stroke();

  if (healthPct > 0 && !c.isDefeated) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + healthPct * Math.PI * 2;
    let ringColor;
    if (isEnemy) {
      ringColor = COLORS.error;
    } else if (healthPct > 0.5) {
      ringColor = COLORS.primary;
    } else if (healthPct > 0.25) {
      ringColor = '#e8a040';
    } else {
      ringColor = COLORS.error;
    }

    if (healthPct < 0.25 && !c.isDefeated) {
      ctx.globalAlpha = (c.isDefeated ? 0.3 : 1) * (0.6 + 0.4 * pulse);
    }
    ctx.beginPath();
    ctx.arc(x, y, r + TOKEN_RING_WIDTH / 2, startAngle, endAngle);
    ctx.lineWidth = TOKEN_RING_WIDTH;
    ctx.strokeStyle = ringColor;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (healthPct < 0.25 && !c.isDefeated) ctx.globalAlpha = c.isDefeated ? 0.3 : 1;
  }

  const bgGrad = ctx.createRadialGradient(x - 4, y - 4, 0, x, y, r);
  if (isEnemy) {
    bgGrad.addColorStop(0, '#3a1825');
    bgGrad.addColorStop(1, '#1e0e14');
  } else {
    bgGrad.addColorStop(0, '#2a1e3d');
    bgGrad.addColorStop(1, '#15102a');
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  if (isActive && !c.isDefeated) {
    ctx.strokeStyle = isEnemy ? COLORS.error : COLORS.primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = COLORS.error;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (isHovered && !c.isDefeated) {
    ctx.save();
    ctx.strokeStyle = isEnemy ? 'rgba(255,110,132,0.4)' : 'rgba(197,154,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,110,132,${flashAlpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = `bold 14px Manrope, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isEnemy ? COLORS.error : COLORS.primary;
  if (c.isDefeated) {
    ctx.font = '18px sans-serif';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('\u2620', x, y);
  } else {
    ctx.fillText(getInitials(c.name), x, y);
  }

  if (c.advantage > 0 && !c.isDefeated) {
    const badgeX = x + r * 0.7;
    const badgeY = y - r * 0.7;
    const badgeR = 8;
    ctx.fillStyle = 'rgba(197,154,255,0.9)';
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 8px Manrope, sans-serif';
    ctx.fillStyle = '#0e0e10';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${c.advantage}`, badgeX, badgeY);
  }

  ctx.font = '10px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.textDim;
  const nameLabel = c.name.length > 12 ? c.name.slice(0, 11) + '\u2026' : c.name;
  ctx.fillText(nameLabel, x, y + r + 6);

  ctx.font = '8px Manrope, sans-serif';
  ctx.fillStyle = isEnemy ? COLORS.errorDim : COLORS.primaryDim;
  ctx.fillText(`${c.wounds}/${c.maxWounds}`, x, y + r + 18);

  ctx.restore();
}

export function drawFloatingTexts(ctx, positions, now, anim) {
  anim.floatingTexts = anim.floatingTexts.filter((ft) => {
    const elapsed = now - ft.start;
    if (elapsed > FLOAT_TEXT_DURATION) return false;

    const pos = positions.find((p) => p.combatant.id === ft.combatantId);
    if (!pos) return false;

    const progress = elapsed / FLOAT_TEXT_DURATION;
    const alpha = 1 - progress;
    const offsetY = -progress * 40;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 16px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ft.color;
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 8;
    ctx.fillText(ft.text, pos.x, pos.y - TOKEN_RADIUS - 10 + offsetY);
    ctx.shadowBlur = 0;
    ctx.restore();

    return true;
  });
}

export function drawCombatOverOverlay(ctx, w, h, friendlies, now, anim) {
  const startTs = anim.combatOverStart || now;
  const elapsed = now - startTs;
  const fadeIn = Math.min(1, elapsed / 600);
  const scaleIn = 0.85 + 0.15 * Math.min(1, elapsed / 400);

  ctx.fillStyle = `rgba(14,14,16,${0.65 * fadeIn})`;
  ctx.fillRect(0, 0, w, h);

  const isVictory = friendlies.some((c) => !c.isDefeated);
  const textY = h * 0.32;

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
