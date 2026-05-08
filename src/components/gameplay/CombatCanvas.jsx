import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  TOKEN_RADIUS,
  BATTLEFIELD_PAD_TOP,
  BATTLEFIELD_PAD_X,
  xToYard,
  yardToX,
  initParticles,
  drawBackground,
  drawBattlefield,
  drawMovementZone,
  drawMeleeEngagements,
  drawRangeIndicator,
  computeTokenPositions,
  drawCombatOverOverlay,
} from './combat/combatCanvasDraw';
import CombatToken from './combat/CombatToken';
import InitiativeBar from './combat/InitiativeBar';
import ActionModal from './combat/ActionModal';

const FLOAT_TEXT_DURATION = 1200;

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
  availableManoeuvres,
  savedCustomAttacks,
  onExecuteManoeuvre,
  onPersistCustomAttack,
  onRemoveCustomAttack,
  onRegenerateSprite,
}) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 260 });
  const animRef = useRef({
    particles: [],
    combatOverStart: null,
    prevWounds: {},
  });
  const hoverYardRef = useRef(null);
  const rafRef = useRef(0);

  const [actionModal, setActionModal] = useState(null);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const floatIdRef = useRef(0);

  const friendlies = useMemo(
    () => combat.combatants.filter((c) => c.type === 'player' || c.type === 'ally'),
    [combat.combatants]
  );

  const myCombatant = useMemo(() => {
    if (myCombatantId) return combat.combatants.find((c) => c.id === myCombatantId);
    if (isMultiplayer && myPlayerId) return combat.combatants.find((c) => c.id === myPlayerId);
    return combat.combatants.find((c) => c.type === 'player');
  }, [combat.combatants, myCombatantId, isMultiplayer, myPlayerId]);

  const actionModalTarget = useMemo(() => {
    if (!actionModal?.targetId) return null;
    return combat.combatants.find(c => c.id === actionModal.targetId) || null;
  }, [actionModal, combat.combatants]);

  // Detect wound changes -> floating damage text
  useEffect(() => {
    for (const c of combat.combatants) {
      const prev = animRef.current.prevWounds[c.id];
      if (prev !== undefined && c.wounds < prev) {
        const dmg = prev - c.wounds;
        floatIdRef.current += 1;
        setFloatingTexts(ft => [...ft, {
          id: floatIdRef.current,
          combatantId: c.id,
          text: `-${dmg}`,
          color: '#ff6e84',
          start: Date.now(),
        }]);
      }
      animRef.current.prevWounds[c.id] = c.wounds;
    }
  }, [combat.combatants]);

  // Clean up expired floating texts
  useEffect(() => {
    if (floatingTexts.length === 0) return;
    const timer = setInterval(() => {
      setFloatingTexts(ft => ft.filter(f => Date.now() - f.start < FLOAT_TEXT_DURATION));
    }, 200);
    return () => clearInterval(timer);
  }, [floatingTexts.length]);

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
        setContainerSize({ w: width, h: height });
        animRef.current.particles = initParticles(width, height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Battlefield layout constants
  const bfTop = BATTLEFIELD_PAD_TOP;
  const bfBot = containerSize.h - 16;
  const bfH = bfBot - bfTop;
  const bfCenterY = bfTop + bfH / 2;

  const tokenPositions = useMemo(
    () => computeTokenPositions(combat.combatants, containerSize.w, bfCenterY, bfH),
    [combat.combatants, containerSize.w, bfCenterY, bfH]
  );

  // Canvas draw loop — background only
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = containerSize;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const now = performance.now();

    drawBackground(ctx, w, h, now, animRef.current);
    drawBattlefield(ctx, w, bfTop, bfH, now);

    if (isMyTurn && myCombatant && !combatOver) {
      drawMovementZone(ctx, w, bfTop, bfH, myCombatant, hoverYardRef.current);
    }

    drawMeleeEngagements(ctx, combat.combatants, w, bfCenterY, now);

    if (actionModal?.targetId && myCombatant) {
      const target = combat.combatants.find(c => c.id === actionModal.targetId);
      if (target && target.id !== myCombatant.id) {
        drawRangeIndicator(ctx, myCombatant, target, w, bfCenterY);
      }
    }

    if (combatOver) {
      drawCombatOverOverlay(ctx, w, h, friendlies, now, animRef.current);
    }
  }, [containerSize, combat, isMyTurn, myCombatant, combatOver, friendlies, bfTop, bfH, bfCenterY, actionModal]);

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

  const handleCanvasPointerMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const yard = xToYard(x, containerSize.w);
    hoverYardRef.current = yard;

    const canvas = canvasRef.current;
    if (canvas && isMyTurn && myCombatant && !combatOver) {
      canvas.style.cursor = 'crosshair';
    } else if (canvas) {
      canvas.style.cursor = 'default';
    }
  }, [containerSize.w, isMyTurn, myCombatant, combatOver]);

  const handleCanvasClick = useCallback((e) => {
    if (!isMyTurn || combatOver) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const yard = xToYard(x, containerSize.w);
    const yPx = yardToX(yard, containerSize.w);

    setActionModal({
      targetId: null,
      targetType: 'ground',
      targetYard: yard,
      anchorRect: { x: rect.left + yPx, y: rect.top + bfCenterY, width: 0, height: 0 },
    });
  }, [containerSize.w, isMyTurn, combatOver, bfCenterY]);

  const handleTokenClick = useCallback((combatant) => {
    if (combatOver) return;
    if (!isMyTurn) return;

    const pos = tokenPositions.find(p => p.combatant.id === combatant.id);
    if (!pos) return;

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const isSelf = combatant.id === myCombatant?.id;
    const isEnemy = combatant.type === 'enemy';
    const isAlly = combatant.type === 'ally';

    let targetType = 'enemy';
    if (isSelf) targetType = 'self';
    else if (isAlly) targetType = 'ally';
    else if (!isEnemy) targetType = 'self';

    if (combatant.isDefeated) return;

    onSelectTarget?.(isEnemy ? combatant.id : null);

    setActionModal({
      targetId: combatant.id,
      targetType,
      targetYard: null,
      anchorRect: {
        x: containerRect.left + pos.x,
        y: containerRect.top + pos.y - TOKEN_RADIUS - 10,
        width: TOKEN_RADIUS * 2,
        height: TOKEN_RADIUS * 2,
      },
    });
  }, [combatOver, isMyTurn, tokenPositions, myCombatant, onSelectTarget]);

  const handleExecuteFromModal = useCallback((manoeuvreKey, targetId, customDesc) => {
    onExecuteManoeuvre?.(manoeuvreKey, targetId, customDesc);
    setActionModal(null);
  }, [onExecuteManoeuvre]);

  const handleMoveFromModal = useCallback((yard) => {
    onMoveToPosition?.(yard);
    setActionModal(null);
  }, [onMoveToPosition]);

  return (
    <div className="space-y-1.5">
      <InitiativeBar
        combatants={combat.combatants}
        turnIndex={combat.turnIndex}
        myCombatantId={myCombatant?.id}
        t={t}
      />

      <div
        ref={containerRef}
        className="w-full relative rounded-md overflow-hidden border border-error/20 bg-surface-dim"
        style={{ height: 220 }}
      >
        {/* Canvas background layer */}
        <canvas
          ref={canvasRef}
          className="w-full h-full absolute inset-0"
          style={{ display: 'block' }}
          onPointerMove={handleCanvasPointerMove}
          onClick={handleCanvasClick}
          onPointerLeave={() => { hoverYardRef.current = null; }}
        />

        {/* DOM token overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {tokenPositions.map((pos) => {
            const c = pos.combatant;
            const turnsUntil = (combat.combatants.indexOf(c) - combat.turnIndex + combat.combatants.length) % combat.combatants.length;
            return (
              <CombatToken
                key={c.id}
                combatant={c}
                x={pos.x}
                y={pos.y}
                isActive={combat.combatants.indexOf(c) === combat.turnIndex}
                isSelected={c.id === selectedTarget}
                turnsUntil={c.isDefeated ? null : turnsUntil}
                spriteUrl={c.spriteUrl || null}
                myCombatant={myCombatant}
                onClick={handleTokenClick}
                t={t}
              />
            );
          })}

          {/* Floating damage texts */}
          {floatingTexts.map((ft) => {
            const pos = tokenPositions.find(p => p.combatant.id === ft.combatantId);
            if (!pos) return null;
            return (
              <div
                key={ft.id}
                className="combat-float-text"
                style={{
                  left: pos.x,
                  top: pos.y - TOKEN_RADIUS - 10,
                  color: ft.color,
                }}
              >
                {ft.text}
              </div>
            );
          })}
        </div>

      </div>

      {/* Portal escapes ancestor transform/overflow containing blocks */}
      {actionModal && isMyTurn && !combatOver && createPortal(
        <ActionModal
          anchorRect={actionModal.anchorRect}
          target={actionModalTarget}
          targetType={actionModal.targetType}
          myCombatant={myCombatant}
          availableManoeuvres={availableManoeuvres || []}
          savedCustomAttacks={savedCustomAttacks || []}
          onExecute={handleExecuteFromModal}
          onMoveToPosition={handleMoveFromModal}
          onClose={() => setActionModal(null)}
          onPersistCustomAttack={onPersistCustomAttack}
          onRemoveCustomAttack={onRemoveCustomAttack}
          onRegenerateSprite={onRegenerateSprite}
          t={t}
          targetYard={actionModal.targetYard}
        />,
        document.body,
      )}

      {isMyTurn && !combatOver && myCombatant && (
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-container/30 border border-outline-variant/10 rounded-sm">
            <span className="material-symbols-outlined text-sm text-primary">directions_walk</span>
            <span className="text-on-surface-variant">{t('combat.movement', 'Movement')}:</span>
            <span className="text-primary font-bold tabular-nums">
              {myCombatant.movementAllowance - (myCombatant.movementUsed || 0)}/{myCombatant.movementAllowance}
            </span>
            <span className="text-outline-variant">y</span>
          </div>
          <span className="text-[10px] text-outline-variant">{t('combat.clickToMove', 'Click battlefield to move')}</span>
        </div>
      )}
    </div>
  );
}
