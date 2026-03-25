import { useRef, useEffect, useCallback, useMemo } from 'react';

const COLORS = {
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
};

const ICON_GLYPHS = {
  player: '\u2694',
  ally: '\u2694',
  enemy: '\u2620',
};

function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
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

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

export default function CombatCanvas({
  combat,
  myPlayerId,
  isMultiplayer = false,
  selectedTarget,
  onSelectTarget,
  combatOver,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizeRef = useRef({ w: 600, h: 300 });
  const animRef = useRef({
    healthBars: {},
    flashTargets: {},
    prevWounds: {},
    time: 0,
  });
  const hoveredRef = useRef(null);
  const rafRef = useRef(0);
  const hitRectsRef = useRef([]);

  const friendlies = useMemo(
    () => combat.combatants.filter((c) => c.type === 'player' || c.type === 'ally'),
    [combat.combatants]
  );
  const enemies = useMemo(
    () => combat.combatants.filter((c) => c.type === 'enemy'),
    [combat.combatants]
  );

  useEffect(() => {
    for (const c of combat.combatants) {
      const prev = animRef.current.prevWounds[c.id];
      if (prev !== undefined && prev !== c.wounds) {
        if (c.wounds < prev) {
          animRef.current.flashTargets[c.id] = { start: performance.now(), type: 'damage' };
        }
      }
      animRef.current.prevWounds[c.id] = c.wounds;
    }
  }, [combat.combatants]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        sizeRef.current = { w: width, h: height };
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = sizeRef.current;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const now = performance.now();
    animRef.current.time = now;
    const pulse = 0.5 + 0.5 * Math.sin(now / 400);
    const hitRects = [];

    drawBackground(ctx, w, h);
    drawInitiativeTrack(ctx, combat.combatants, combat.turnIndex, myPlayerId, isMultiplayer, w, pulse);
    const trackH = 50;
    const bodyY = trackH + 8;
    const bodyH = h - bodyY - 8;

    drawCenterDivider(ctx, w, bodyY, bodyH, combat.round, combatOver, friendlies, pulse);
    drawCombatantColumn(ctx, friendlies, 'friendly', 16, bodyY, w / 2 - 32, bodyH,
      combat.turnIndex, combat.combatants, myPlayerId, isMultiplayer,
      selectedTarget, hoveredRef.current, pulse, now, animRef.current, hitRects);
    drawCombatantColumn(ctx, enemies, 'enemy', w / 2 + 16, bodyY, w / 2 - 32, bodyH,
      combat.turnIndex, combat.combatants, myPlayerId, isMultiplayer,
      selectedTarget, hoveredRef.current, pulse, now, animRef.current, hitRects);

    hitRectsRef.current = hitRects;

    if (combatOver) {
      drawCombatOverBanner(ctx, w, h, friendlies);
    }
  }, [combat, myPlayerId, isMultiplayer, selectedTarget, combatOver, friendlies, enemies]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  const handlePointerMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let found = null;
    for (const hr of hitRectsRef.current) {
      if (x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) {
        found = hr.id;
        break;
      }
    }
    hoveredRef.current = found;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = found && enemies.some((e) => e.id === found && !e.isDefeated) ? 'pointer' : 'default';
    }
  }, [enemies]);

  const handleClick = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (const hr of hitRectsRef.current) {
      if (x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) {
        const enemy = enemies.find((en) => en.id === hr.id && !en.isDefeated);
        if (enemy && onSelectTarget) {
          onSelectTarget(enemy.id);
        }
        break;
      }
    }
  }, [enemies, onSelectTarget]);

  const maxCards = Math.max(friendlies.length, enemies.length, 1);
  const canvasHeight = Math.max(200, 58 + maxCards * 72 + 16);

  return (
    <div
      ref={containerRef}
      className="w-full relative rounded-sm overflow-hidden border border-error/20 bg-surface-dim"
      style={{ height: canvasHeight }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onPointerLeave={() => { hoveredRef.current = null; }}
      />
    </div>
  );
}

function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, COLORS.bg);
  grad.addColorStop(1, COLORS.bgGrad);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  vignette.addColorStop(0, 'rgba(197,154,255,0.02)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function drawInitiativeTrack(ctx, combatants, turnIndex, myPlayerId, isMultiplayer, canvasW, pulse) {
  const trackH = 42;
  const circleR = 14;
  const spacing = Math.min(48, (canvasW - 40) / Math.max(combatants.length, 1));
  const totalW = (combatants.length - 1) * spacing;
  const startX = (canvasW - totalW) / 2;

  ctx.fillStyle = 'rgba(25,25,28,0.6)';
  roundRect(ctx, 8, 4, canvasW - 16, trackH, 4);
  ctx.fill();

  for (let i = 0; i < combatants.length; i++) {
    const c = combatants[i];
    const cx = startX + i * spacing;
    const cy = trackH / 2 + 4;
    const isActive = i === turnIndex;
    const isMe = isMultiplayer && c.id === myPlayerId;
    const isEnemy = c.type === 'enemy';

    if (c.isDefeated) {
      ctx.globalAlpha = 0.25;
    }

    if (isActive && !c.isDefeated) {
      const glowR = circleR + 4 + pulse * 3;
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
    const baseColor = isEnemy ? COLORS.errorDim : COLORS.primaryDim;
    ctx.fillStyle = isActive ? (isEnemy ? COLORS.error : COLORS.primary) : baseColor;
    ctx.fill();

    if (isActive && !c.isDefeated) {
      ctx.strokeStyle = isEnemy ? COLORS.error : COLORS.primary;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(ICON_GLYPHS[c.type] || '?', cx, cy);

    if (c.isDefeated) {
      ctx.strokeStyle = COLORS.error;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 6);
      ctx.lineTo(cx + 6, cy + 6);
      ctx.moveTo(cx + 6, cy - 6);
      ctx.lineTo(cx - 6, cy + 6);
      ctx.stroke();
    }

    if (isMe && !c.isDefeated) {
      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = COLORS.primary;
      ctx.fillText('★', cx, cy - circleR - 5);
    }

    ctx.globalAlpha = 1;
  }
}

function drawCenterDivider(ctx, w, bodyY, bodyH, round, combatOver, friendlies, pulse) {
  const cx = w / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(72,71,74,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, bodyY + 30);
  ctx.lineTo(cx, bodyY + bodyH - 10);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const badgeW = 56;
  const badgeH = 24;
  const badgeY = bodyY + 4;
  ctx.fillStyle = 'rgba(25,25,28,0.8)';
  roundRect(ctx, cx - badgeW / 2, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(72,71,74,0.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, cx - badgeW / 2, badgeY, badgeW, badgeH, 4);
  ctx.stroke();

  ctx.font = 'bold 11px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(`⚔ R${round}`, cx, badgeY + badgeH / 2);
}

function drawCombatantColumn(
  ctx, combatants, side, x, y, maxW, maxH,
  turnIndex, allCombatants, myPlayerId, isMultiplayer,
  selectedTarget, hoveredId, pulse, now, anim, hitRects
) {
  const cardH = 60;
  const gap = 10;
  const totalH = combatants.length * cardH + (combatants.length - 1) * gap;
  const startY = y + Math.max(0, (maxH - totalH) / 2);

  for (let i = 0; i < combatants.length; i++) {
    const c = combatants[i];
    const cardY = startY + i * (cardH + gap);
    const cardW = Math.min(maxW, 260);
    const cardX = side === 'enemy' ? x + (maxW - cardW) : x;
    const globalIdx = allCombatants.indexOf(c);
    const isActive = globalIdx === turnIndex;
    const isMe = isMultiplayer && c.id === myPlayerId;
    const isSelected = c.id === selectedTarget;
    const isHovered = c.id === hoveredId;
    const isEnemy = side === 'enemy';

    hitRects.push({ id: c.id, x: cardX, y: cardY, w: cardW, h: cardH });

    const healthTarget = c.maxWounds > 0 ? c.wounds / c.maxWounds : 0;
    if (anim.healthBars[c.id] === undefined) anim.healthBars[c.id] = healthTarget;
    anim.healthBars[c.id] = lerp(anim.healthBars[c.id], healthTarget, 0.08);
    const healthPct = anim.healthBars[c.id];

    ctx.save();
    if (c.isDefeated) ctx.globalAlpha = 0.35;

    const flash = anim.flashTargets[c.id];
    let flashAlpha = 0;
    if (flash) {
      const elapsed = now - flash.start;
      if (elapsed < 500) {
        flashAlpha = Math.max(0, 1 - elapsed / 500) * 0.4;
      } else {
        delete anim.flashTargets[c.id];
      }
    }

    if (isActive && !c.isDefeated) {
      const glowAlpha = 0.1 + pulse * 0.12;
      ctx.shadowColor = isEnemy ? COLORS.error : COLORS.primary;
      ctx.shadowBlur = 12 + pulse * 6;
      ctx.fillStyle = `rgba(${isEnemy ? '255,110,132' : '197,154,255'},${glowAlpha})`;
      roundRect(ctx, cardX - 2, cardY - 2, cardW + 4, cardH + 4, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = COLORS.card;
    roundRect(ctx, cardX, cardY, cardW, cardH, 6);
    ctx.fill();

    let borderColor = COLORS.cardBorder;
    if (isActive && !c.isDefeated) borderColor = isEnemy ? COLORS.error : COLORS.primary;
    else if (isSelected) borderColor = COLORS.error;
    else if (isHovered && isEnemy && !c.isDefeated) borderColor = 'rgba(255,110,132,0.5)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isActive || isSelected ? 1.5 : 1;
    roundRect(ctx, cardX, cardY, cardW, cardH, 6);
    ctx.stroke();

    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,110,132,${flashAlpha})`;
      roundRect(ctx, cardX, cardY, cardW, cardH, 6);
      ctx.fill();
    }

    const iconR = 16;
    const iconCx = cardX + 22;
    const iconCy = cardY + cardH / 2 - 4;

    ctx.beginPath();
    ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
    const iconGrad = ctx.createRadialGradient(iconCx - 2, iconCy - 2, 0, iconCx, iconCy, iconR);
    if (isEnemy) {
      iconGrad.addColorStop(0, '#4a2030');
      iconGrad.addColorStop(1, '#2a1018');
    } else {
      iconGrad.addColorStop(0, '#2a2040');
      iconGrad.addColorStop(1, '#1a1028');
    }
    ctx.fillStyle = iconGrad;
    ctx.fill();
    ctx.strokeStyle = isEnemy ? 'rgba(255,110,132,0.4)' : 'rgba(197,154,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isEnemy ? COLORS.error : COLORS.primary;
    ctx.fillText(ICON_GLYPHS[c.type] || '?', iconCx, iconCy);

    if (c.isDefeated) {
      ctx.font = '20px sans-serif';
      ctx.fillStyle = COLORS.error;
      ctx.fillText('✕', iconCx, iconCy);
    }

    const textX = cardX + 46;
    const textMaxW = cardW - 56;

    ctx.font = `bold 12px Manrope, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isMe ? COLORS.primary : COLORS.text;
    const displayName = truncateText(ctx, c.name + (isMe ? ' ★' : ''), textMaxW - 40);
    ctx.fillText(displayName, textX, cardY + 8);

    if (c.advantage > 0 && !c.isDefeated) {
      const advText = `+${c.advantage}`;
      ctx.font = 'bold 10px Manrope, sans-serif';
      const advW = ctx.measureText(advText).width + 8;
      const advX = cardX + cardW - advW - 8;
      ctx.fillStyle = 'rgba(197,154,255,0.15)';
      roundRect(ctx, advX, cardY + 7, advW, 16, 3);
      ctx.fill();
      ctx.fillStyle = COLORS.primary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(advText, advX + advW / 2, cardY + 15);
    }

    const barX = textX;
    const barY = cardY + 26;
    const barW = textMaxW;
    const barH = 8;

    ctx.fillStyle = 'rgba(72,71,74,0.3)';
    roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fill();

    if (healthPct > 0) {
      const fillW = Math.max(4, barW * healthPct);
      const hpColor = isEnemy
        ? ctx.createLinearGradient(barX, 0, barX + fillW, 0)
        : ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      if (isEnemy) {
        hpColor.addColorStop(0, COLORS.error);
        hpColor.addColorStop(1, COLORS.errorDim);
      } else {
        if (healthPct > 0.5) {
          hpColor.addColorStop(0, COLORS.primary);
          hpColor.addColorStop(1, '#9b6edc');
        } else if (healthPct > 0.25) {
          hpColor.addColorStop(0, '#e8a040');
          hpColor.addColorStop(1, '#c07828');
        } else {
          hpColor.addColorStop(0, COLORS.error);
          hpColor.addColorStop(1, COLORS.errorDim);
        }
      }
      ctx.fillStyle = hpColor;
      roundRect(ctx, barX, barY, fillW, barH, 3);
      ctx.fill();
    }

    ctx.font = '10px Manrope, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(`${c.wounds} / ${c.maxWounds}`, barX, barY + barH + 3);

    if (c.criticalWounds?.length > 0 && !c.isDefeated) {
      const critText = `${c.criticalWounds.length} crit`;
      const critX = barX + ctx.measureText(`${c.wounds} / ${c.maxWounds}`).width + 8;
      ctx.fillStyle = COLORS.tertiary;
      ctx.fillText(critText, critX, barY + barH + 3);
    }

    ctx.restore();
  }
}

function drawCombatOverBanner(ctx, w, h, friendlies) {
  ctx.fillStyle = 'rgba(14,14,16,0.5)';
  ctx.fillRect(0, 0, w, h);

  const isVictory = friendlies.some((c) => !c.isDefeated);
  const bannerH = 40;
  const bannerY = h / 2 - bannerH / 2;

  ctx.fillStyle = isVictory ? 'rgba(197,154,255,0.12)' : 'rgba(255,110,132,0.12)';
  ctx.fillRect(0, bannerY, w, bannerH);
  ctx.strokeStyle = isVictory ? 'rgba(197,154,255,0.3)' : 'rgba(255,110,132,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, bannerY);
  ctx.lineTo(w, bannerY);
  ctx.moveTo(0, bannerY + bannerH);
  ctx.lineTo(w, bannerY + bannerH);
  ctx.stroke();

  ctx.font = 'bold 18px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isVictory ? COLORS.primary : COLORS.error;
  ctx.fillText(isVictory ? '⚔ VICTORY' : '☠ DEFEAT', w / 2, bannerY + bannerH / 2);
}
