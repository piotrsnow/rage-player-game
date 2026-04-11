import { useRef, useEffect, useCallback, useMemo } from 'react';
import {
  TOKEN_RADIUS,
  TRACK_HEIGHT,
  BATTLEFIELD_PAD_TOP,
  xToYard,
  initParticles,
  drawBackground,
  drawInitiativeTrack,
  drawBattlefield,
  drawMovementZone,
  drawMeleeEngagements,
  computeTokenPositions,
  drawToken,
  drawFloatingTexts,
  drawCombatOverOverlay,
} from './combat/combatCanvasDraw';

export default function CombatCanvas({
  combat,
  myPlayerId,
  isMultiplayer = false,
  selectedTarget,
  onSelectTarget,
  onHoverCombatant,
  onMoveToPosition,
  combatOver,
  isMyTurn = false,
  myCombatantId,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizeRef = useRef({ w: 800, h: 300 });
  const animRef = useRef({
    healthBars: {},
    flashTargets: {},
    prevWounds: {},
    time: 0,
    particles: [],
    floatingTexts: [],
    combatOverStart: null,
  });
  const hoveredRef = useRef(null);
  const hoverYardRef = useRef(null);
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
          animRef.current.floatingTexts.push({
            combatantId: c.id,
            text: `-${prev - c.wounds}`,
            start: performance.now(),
            color: '#ff6e84',
          });
        }
      }
      animRef.current.prevWounds[c.id] = c.wounds;
    }
  }, [combat.combatants]);

  useEffect(() => {
    if (combatOver && !animRef.current.combatOverStart) {
      animRef.current.combatOverStart = performance.now();
    } else if (!combatOver) {
      animRef.current.combatOverStart = null;
    }
  }, [combatOver]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        sizeRef.current = { w: width, h: height };
        animRef.current.particles = initParticles(width, height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const myCombatant = useMemo(() => {
    if (myCombatantId) return combat.combatants.find((c) => c.id === myCombatantId);
    if (isMultiplayer && myPlayerId) return combat.combatants.find((c) => c.id === myPlayerId);
    return combat.combatants.find((c) => c.type === 'player');
  }, [combat.combatants, myCombatantId, isMultiplayer, myPlayerId]);

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
    const pulse = 0.5 + 0.5 * Math.sin(now / 500);
    const hitRects = [];

    drawBackground(ctx, w, h, now, animRef.current);
    drawInitiativeTrack(ctx, combat.combatants, combat.turnIndex, myPlayerId, isMultiplayer, w, pulse, myCombatant);

    const bfTop = TRACK_HEIGHT + BATTLEFIELD_PAD_TOP;
    const bfBot = h - 16;
    const bfH = bfBot - bfTop;
    const bfCenterY = bfTop + bfH / 2;

    drawBattlefield(ctx, w, bfTop, bfH, now);

    if (isMyTurn && myCombatant && !combatOver) {
      drawMovementZone(ctx, w, bfTop, bfH, myCombatant, hoverYardRef.current);
    }

    drawMeleeEngagements(ctx, combat.combatants, w, bfCenterY, now);

    const positions = computeTokenPositions(combat.combatants, w, bfCenterY, bfH);
    for (const pos of positions) {
      drawToken(ctx, pos, combat.turnIndex, combat.combatants, selectedTarget,
        hoveredRef.current, pulse, now, animRef.current, w);
      hitRects.push({ id: pos.combatant.id, x: pos.x - TOKEN_RADIUS, y: pos.y - TOKEN_RADIUS, w: TOKEN_RADIUS * 2, h: TOKEN_RADIUS * 2 });
    }

    drawFloatingTexts(ctx, positions, now, animRef.current);

    hitRectsRef.current = hitRects;

    if (combatOver) {
      drawCombatOverOverlay(ctx, w, h, friendlies, now, animRef.current);
    }
  }, [combat, myPlayerId, isMultiplayer, selectedTarget, combatOver, friendlies, isMyTurn, myCombatant]);

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
      const cx = hr.x + hr.w / 2;
      const cy = hr.y + hr.h / 2;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= TOKEN_RADIUS * TOKEN_RADIUS * 1.3) {
        found = hr.id;
        break;
      }
    }
    if (hoveredRef.current !== found) {
      hoveredRef.current = found;
      onHoverCombatant?.(found);
    }

    const { w } = sizeRef.current;
    const yard = xToYard(x, w);
    hoverYardRef.current = yard;

    const canvas = canvasRef.current;
    if (canvas) {
      const isClickableEnemy = found && enemies.some((en) => en.id === found && !en.isDefeated);
      const isClickableYard = isMyTurn && !found && myCombatant && !combatOver;
      canvas.style.cursor = isClickableEnemy ? 'pointer' : isClickableYard ? 'crosshair' : 'default';
    }
  }, [enemies, onHoverCombatant, isMyTurn, myCombatant, combatOver]);

  const handleClick = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let clickedCombatant = false;
    for (const hr of hitRectsRef.current) {
      const cx = hr.x + hr.w / 2;
      const cy = hr.y + hr.h / 2;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= TOKEN_RADIUS * TOKEN_RADIUS * 1.3) {
        const enemy = enemies.find((en) => en.id === hr.id && !en.isDefeated);
        if (enemy && onSelectTarget) {
          onSelectTarget(enemy.id);
        }
        clickedCombatant = true;
        break;
      }
    }
    if (!clickedCombatant && isMyTurn && myCombatant && !combatOver && onMoveToPosition) {
      const { w } = sizeRef.current;
      const yard = xToYard(x, w);
      onMoveToPosition(yard);
    }
  }, [enemies, onSelectTarget, onMoveToPosition, isMyTurn, myCombatant, combatOver]);

  return (
    <div
      ref={containerRef}
      className="w-full relative rounded-md overflow-hidden border border-error/20 bg-surface-dim"
      style={{ height: 220 }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onPointerLeave={() => {
          hoveredRef.current = null;
          hoverYardRef.current = null;
          onHoverCombatant?.(null);
        }}
      />
    </div>
  );
}
