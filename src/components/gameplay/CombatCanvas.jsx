import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  getCellSize,
  getTokenRadius,
  pixelToCell,
  cellToPixel,
  initParticles,
  drawBackground,
  drawBattlefield,
  drawTerrainTiles,
  drawMovementZone,
  drawMeleeEngagements,
  drawRangeIndicator,
  computeTokenPositions,
  drawCombatOverOverlay,
  drawProjectile,
} from './combat/combatCanvasDraw';
import { gameData } from '../../services/gameDataService';
import { getDistance } from '../../services/combatEngine';
import CombatToken from './combat/CombatToken';
import InitiativeBar from './combat/InitiativeBar';
import ActionModal from './combat/ActionModal';
import ActiveEffectsRow from '../ui/ActiveEffectsRow';

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
  character,
  onAiAction,
  actionAnim,
  projectileAnim,
  expanded = false,
  fillHeight = false,
  hideMovementHint = false,
  hideInitiativeBar = false,
  tokenAnimations = {},
  onEndCombat,
  canControl = false,
}) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const animRef = useRef({
    particles: [],
    combatOverStart: null,
    prevWounds: {},
  });
  const hoverCellRef = useRef(null);
  const rafRef = useRef(0);

  const [actionModal, setActionModal] = useState(null);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const floatIdRef = useRef(0);
  const [tileTooltip, setTileTooltip] = useState(null);
  const [hoveredCombatantId, setHoveredCombatantId] = useState(null);
  const combatRef = useRef(combat);
  combatRef.current = combat;

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
    const el = sizerRef.current;
    if (!el) return;
    const ratio = gameData.BATTLEFIELD_WIDTH / gameData.BATTLEFIELD_HEIGHT;
    const ro = new ResizeObserver(([entry]) => {
      const { width: pw, height: ph } = entry.contentRect;
      if (pw <= 0 || ph <= 0) return;
      let w, h;
      if (pw / ph > ratio) {
        h = Math.floor(ph);
        w = Math.floor(h * ratio);
      } else {
        w = Math.floor(pw);
        h = Math.floor(w / ratio);
      }
      setContainerSize({ w, h });
      animRef.current.particles = initParticles(w, h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tokenPositions = useMemo(
    () => computeTokenPositions(combat.combatants, containerSize.w, containerSize.h),
    [combat.combatants, containerSize.w, containerSize.h]
  );

  const cellSize = useMemo(() => getCellSize(containerSize.w, containerSize.h), [containerSize.w, containerSize.h]);
  const tokenRadius = useMemo(() => getTokenRadius(containerSize.w, containerSize.h), [containerSize.w, containerSize.h]);

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
    drawBattlefield(ctx, w, h, now);
    drawTerrainTiles(ctx, w, h, combat.terrainTiles, gameData.terrainTiles, now);

    if (isMyTurn && myCombatant && !combatOver) {
      drawMovementZone(ctx, w, h, myCombatant, hoverCellRef.current, now);
    }

    drawMeleeEngagements(ctx, combat.combatants, w, h, now);

    if (projectileAnim) {
      drawProjectile(ctx, projectileAnim, w, h, now);
    }

    if (actionModal?.targetId && myCombatant) {
      const target = combat.combatants.find(c => c.id === actionModal.targetId);
      if (target && target.id !== myCombatant.id) {
        drawRangeIndicator(ctx, myCombatant, target, w, h);
      }
    }

    if (combatOver) {
      drawCombatOverOverlay(ctx, w, h, friendlies, now, animRef.current);
    }
  }, [containerSize, combat, isMyTurn, myCombatant, combatOver, friendlies, actionModal, projectileAnim]);

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

  const combatantAtCell = useCallback((cell) => {
    if (!cell) return null;
    return combat.combatants.find((c) => {
      const p = c.position && typeof c.position === 'object' && 'x' in c.position
        ? c.position
        : typeof c.position === 'number' ? { x: c.position, y: 4 } : { x: 0, y: 0 };
      return p.x === cell.x && p.y === cell.y && !c.isDefeated;
    }) || null;
  }, [combat.combatants]);

  const handleCanvasPointerMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cell = pixelToCell(x, y, containerSize.w, containerSize.h);
    hoverCellRef.current = cell;

    if (cell && combat.terrainTiles?.length) {
      const tile = combat.terrainTiles.find(tt => tt.x === cell.x && tt.y === cell.y && !tt.consumed);
      if (tile) {
        const def = gameData.terrainTiles[tile.type];
        if (def) {
          const px = cellToPixel(cell.x, cell.y, containerSize.w, containerSize.h);
          setTileTooltip({ name: t(`combat.terrain.${tile.type}`, def.name), desc: t(`combat.terrain.${tile.type}_desc`, ''), x: px.x, y: px.y });
        } else {
          setTileTooltip(null);
        }
      } else {
        setTileTooltip(null);
      }
    } else {
      setTileTooltip(null);
    }

    const hasCombatant = cell && combatantAtCell(cell);
    const canvas = canvasRef.current;
    if (canvas && isMyTurn && myCombatant && !combatOver && cell) {
      canvas.style.cursor = hasCombatant ? 'pointer' : 'cell';
    } else if (canvas) {
      canvas.style.cursor = cell && hasCombatant ? 'pointer' : 'default';
    }

    const hovId = hasCombatant?.id || null;
    setHoveredCombatantId(hovId);
    onHoverCombatant?.(hovId);
  }, [containerSize.w, containerSize.h, isMyTurn, myCombatant, combatOver, combat.terrainTiles, t, combatantAtCell, onHoverCombatant]);

  const handleCanvasClick = useCallback((e) => {
    if (!isMyTurn || combatOver) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cell = pixelToCell(x, y, containerSize.w, containerSize.h);
    if (!cell) return;

    const combatant = combatantAtCell(cell);
    const px = cellToPixel(cell.x, cell.y, containerSize.w, containerSize.h);
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    if (combatant) {
      const isSelf = combatant.id === myCombatant?.id;
      const isEnemy = combatant.type === 'enemy';
      const isAlly = combatant.type === 'ally';

      let targetType = 'enemy';
      if (isSelf) targetType = 'self';
      else if (isAlly) targetType = 'ally';
      else if (!isEnemy) targetType = 'self';

      onSelectTarget?.(isEnemy ? combatant.id : null);

      setActionModal({
        targetId: combatant.id,
        targetType,
        targetCell: null,
        anchorRect: {
          x: containerRect.left + px.x,
          y: containerRect.top + px.y - tokenRadius - 10,
          width: tokenRadius * 2,
          height: tokenRadius * 2,
        },
      });
    } else {
      setActionModal({
        targetId: null,
        targetType: 'ground',
        targetCell: cell,
        anchorRect: { x: containerRect.left + px.x, y: containerRect.top + px.y, width: 0, height: 0 },
      });
    }
  }, [containerSize.w, containerSize.h, isMyTurn, combatOver, combatantAtCell, myCombatant, onSelectTarget, tokenRadius]);

  const handleExecuteFromModal = useCallback((manoeuvreKey, targetId, customDesc, extraOpts) => {
    onExecuteManoeuvre?.(manoeuvreKey, targetId, customDesc, extraOpts);
    setActionModal(null);
  }, [onExecuteManoeuvre]);

  const handleMoveFromModal = useCallback((targetCell) => {
    onMoveToPosition?.(targetCell);
    setActionModal(null);
  }, [onMoveToPosition]);

  return (
    <div className={fillHeight ? 'h-full flex flex-col gap-1' : 'space-y-1'}>
      {!hideInitiativeBar && (
        <InitiativeBar
          combatants={combat.combatants}
          turnIndex={combat.turnIndex}
          myCombatantId={myCombatant?.id}
          t={t}
        />
      )}

      <div
        ref={sizerRef}
        className={`w-full flex items-center justify-center ${expanded ? 'h-[clamp(260px,40vh,480px)]' : fillHeight ? 'flex-1 min-h-0' : ''}`}
        style={expanded || fillHeight ? undefined : { aspectRatio: `${gameData.BATTLEFIELD_WIDTH} / ${gameData.BATTLEFIELD_HEIGHT}` }}
      >
      <div
        ref={containerRef}
        className="relative rounded-md overflow-hidden border border-error/20"
        style={{ width: containerSize.w, height: containerSize.h }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full absolute inset-0"
          style={{ display: 'block' }}
          onPointerMove={handleCanvasPointerMove}
          onClick={handleCanvasClick}
          onPointerLeave={() => { hoverCellRef.current = null; setTileTooltip(null); setHoveredCombatantId(null); }}
        />

        <div className="absolute inset-0 pointer-events-none">
          {tileTooltip && (
            <div
              className="absolute z-20 px-2 py-1 rounded bg-surface-container/95 border border-outline-variant/30 shadow-lg text-[10px] whitespace-nowrap"
              style={{ left: tileTooltip.x, top: tileTooltip.y - cellSize * 0.7, transform: 'translate(-50%, -100%)' }}
            >
              <div className="font-bold text-on-surface">{tileTooltip.name}</div>
              {tileTooltip.desc && <div className="text-on-surface-variant">{tileTooltip.desc}</div>}
            </div>
          )}

          {hoveredCombatantId && !actionModal && (() => {
            const hc = combat.combatants.find(c => c.id === hoveredCombatantId);
            const hPos = tokenPositions.find(p => p.combatant.id === hoveredCombatantId);
            if (!hc || !hPos) return null;
            const isEnemy = hc.type === 'enemy';
            const dist = myCombatant && hc.id !== myCombatant.id ? getDistance(hc, myCombatant) : null;
            const mainWeapon = (() => {
              if (hc.equipped?.mainHand) {
                const item = (hc.inventory || []).find(i => i.id === hc.equipped.mainHand);
                if (item) return item.name;
              }
              return (hc.weapons || []).map(w => typeof w === 'string' ? w : w.name).find(Boolean);
            })();
            const armour = (() => {
              if (hc.equipped?.armour) {
                const item = (hc.inventory || []).find(i => i.id === hc.equipped.armour);
                if (item) return item.name;
              }
              return hc.equippedArmour || (hc.armourDR ? `DR ${hc.armourDR}` : null);
            })();
            const conditions = (hc.conditions || []).filter(cond => cond !== 'fled' || hc.isDefeated);
            const effects = hc.activeEffects || [];
            return (
              <div
                className="absolute z-30 px-3 py-2.5 rounded-md bg-surface-container/95 border border-outline-variant/30 shadow-xl text-[12px] whitespace-nowrap"
                style={{ left: hPos.x, top: hPos.y - tokenRadius - 14, transform: 'translate(-50%, -100%)', minWidth: 180 }}
              >
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-[15px] ${isEnemy ? 'text-error' : 'text-primary'}`}>{hc.name}</span>
                  {hc.isDefeated && <span className="text-[10px] text-error bg-error/10 px-1.5 py-0.5 rounded-sm uppercase font-bold">KO</span>}
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center justify-between gap-3 text-on-surface">
                    <span>{t('combat.wounds', 'Wounds')}:</span>
                    <span className="font-bold tabular-nums">{hc.wounds}/{hc.maxWounds}</span>
                  </div>
                  <div className="w-full h-[7px] rounded-full overflow-hidden" style={{ background: 'rgba(72,71,74,0.5)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${hc.maxWounds > 0 ? Math.max(0, Math.min(100, (hc.wounds / hc.maxWounds) * 100)) : 0}%`,
                        backgroundColor: isEnemy ? '#ff6e84' : (hc.wounds / hc.maxWounds > 0.5 ? '#c59aff' : hc.wounds / hc.maxWounds > 0.25 ? '#e8a040' : '#ff6e84'),
                      }}
                    />
                  </div>
                </div>
                {dist != null && (
                  <div className="text-on-surface-variant mt-1">{t('combat.distanceLabel', 'Distance')}: <span className="font-bold text-on-surface">{dist}</span></div>
                )}
                {mainWeapon && (
                  <div className="text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                    <span className="material-symbols-outlined text-[14px]">swords</span>{mainWeapon}
                  </div>
                )}
                {armour && (
                  <div className="text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                    <span className="material-symbols-outlined text-[14px]">shield</span>{armour}
                  </div>
                )}
                {conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {conditions.map((cond, i) => (
                      <span key={`${cond}_${i}`} className="px-1.5 py-0.5 rounded-sm bg-surface-container text-[10px] text-on-surface-variant uppercase tracking-wider">{cond}</span>
                    ))}
                  </div>
                )}
                {effects.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-outline-variant/20" style={{ whiteSpace: 'normal', maxWidth: 240 }}>
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">
                      {t('combat.effects', 'Effects')}
                    </div>
                    <ActiveEffectsRow effects={effects} maxVisible={8} />
                  </div>
                )}
              </div>
            );
          })()}

          {tokenPositions.map((pos) => {
            const c = pos.combatant;
            const turnsUntil = (combat.combatants.indexOf(c) - combat.turnIndex + combat.combatants.length) % combat.combatants.length;

            let actDirection = 0;
            let shoveOffset = null;
            if (actionAnim && actionAnim.actorId === c.id && actionAnim.targetId) {
              const targetPos = tokenPositions.find(p => p.combatant.id === actionAnim.targetId);
              if (targetPos) {
                actDirection = targetPos.x > pos.x ? 1 : targetPos.x < pos.x ? -1 : 0;
                if (actionAnim.type === 'shove') {
                  shoveOffset = { dx: targetPos.x - pos.x, dy: targetPos.y - pos.y };
                }
              }
            }

            return (
              <CombatToken
                key={c.id}
                combatant={c}
                x={pos.x}
                y={pos.y}
                cellSize={cellSize}
                isActive={combat.combatants.indexOf(c) === combat.turnIndex}
                isSelected={c.id === selectedTarget}
                isHovered={hoveredCombatantId === c.id}
                turnsUntil={c.isDefeated ? null : turnsUntil}
                spriteUrl={c.spriteUrl || null}
                myCombatant={myCombatant}
                isActing={actionAnim?.actorId === c.id}
                actDirection={actDirection}
                shoveOffset={shoveOffset}
                transitionDuration={tokenAnimations[c.id]?.durationMs || 0}
                t={t}
              />
            );
          })}

          {floatingTexts.map((ft) => {
            const pos = tokenPositions.find(p => p.combatant.id === ft.combatantId);
            if (!pos) return null;
            return (
              <div
                key={ft.id}
                className="combat-float-text"
                style={{
                  left: pos.x,
                  top: pos.y - tokenRadius - 10,
                  color: ft.color,
                }}
              >
                {ft.text}
              </div>
            );
          })}
        </div>

        {combatOver && canControl && onEndCombat && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-5 pointer-events-auto" style={{ marginTop: '15%' }}>
              <button
                onClick={onEndCombat}
                title={t('combat.leaveCombat', 'Opuść tryb walki')}
                className="w-14 h-14 rounded-full border-2 border-primary/40 bg-surface-container/80 backdrop-blur-sm text-primary hover:bg-primary/20 hover:border-primary/60 hover:scale-110 transition-all shadow-lg shadow-primary/20"
              >
                <span className="material-symbols-outlined text-3xl">logout</span>
              </button>
            </div>
          </div>
        )}

      </div>
      </div>

      {actionModal && isMyTurn && !combatOver && createPortal(
        <ActionModal
          anchorRect={actionModal.anchorRect}
          target={actionModalTarget}
          targetType={actionModal.targetType}
          myCombatant={myCombatant}
          combatants={combat.combatants}
          availableManoeuvres={availableManoeuvres || []}
          savedCustomAttacks={savedCustomAttacks || []}
          onExecute={handleExecuteFromModal}
          onMoveToPosition={handleMoveFromModal}
          onClose={() => setActionModal(null)}
          onPersistCustomAttack={onPersistCustomAttack}
          onRemoveCustomAttack={onRemoveCustomAttack}
          onRegenerateSprite={onRegenerateSprite}
          character={character}
          onAiAction={(actionText) => { onAiAction?.(actionText); setActionModal(null); }}
          t={t}
          targetCell={actionModal.targetCell}
        />,
        document.body,
      )}

      {!hideMovementHint && isMyTurn && !combatOver && myCombatant && (
        <div className="flex items-center gap-2 text-[10px]">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-surface-container/30 border border-outline-variant/10 rounded-sm">
            <span className="material-symbols-outlined text-xs text-primary">directions_walk</span>
            <span className="text-on-surface-variant">{t('combat.movement', 'Movement')}:</span>
            <span className="text-primary font-bold tabular-nums">
              {myCombatant.movementAllowance - (myCombatant.movementUsed || 0)}/{myCombatant.movementAllowance}
            </span>
          </div>
          <span className="text-[9px] text-outline-variant">{t('combat.clickToMove', 'Click grid cell to move')}</span>
        </div>
      )}
    </div>
  );
}
