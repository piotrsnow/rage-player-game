import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LpcSprite from '../shared/LpcSprite';
import { apiClient } from '../../services/apiClient';
import { resolveBiome } from '../../effects/biomeResolver';
import { filterNpcsHere } from '../../utils/npcLocation';
import { generateFieldTiles } from './combat/generateFieldTiles';
import {
  getFieldCellSize,
  initFieldParticles,
  drawFieldBackground,
  drawFieldGrid,
  computeFieldTokenPositions,
  COLORS,
} from './combat/fieldMapDraw';
import { useFieldMapKeyboard } from '../../hooks/useFieldMapKeyboard';

const DEFAULT_WIDTH = 28;
const DEFAULT_HEIGHT = 16;
const ASPECT_RATIO = DEFAULT_WIDTH / DEFAULT_HEIGHT;

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function buildEntities(characterName, npcsHere, multiplayerPlayers, gridW, gridH) {
  const entities = [];
  const occupied = new Set();

  function placeAt(x, y) {
    const key = `${x}:${y}`;
    if (occupied.has(key)) {
      for (let r = 1; r < Math.max(gridW, gridH); r++) {
        for (const [dx, dy] of [[0, -r], [1, 0], [0, r], [-r, 0], [r, -r], [r, r], [-r, r], [-r, -r]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 1 && nx < gridW - 1 && ny >= 1 && ny < gridH - 1) {
            const nk = `${nx}:${ny}`;
            if (!occupied.has(nk)) {
              occupied.add(nk);
              return { x: nx, y: ny };
            }
          }
        }
      }
    }
    occupied.add(key);
    return { x, y };
  }

  // Player at center
  const pc = Math.floor(gridW / 2);
  const pr = Math.floor(gridH / 2);
  const playerPos = placeAt(pc, pr);
  entities.push({
    id: '__player__',
    name: characterName || 'Player',
    type: 'player',
    ...playerPos,
  });

  // Multiplayer players nearby
  for (const mp of multiplayerPlayers) {
    if (!mp.characterName) continue;
    const pos = placeAt(playerPos.x + 1, playerPos.y);
    entities.push({
      id: `mp_${mp.id || mp.characterName}`,
      name: mp.characterName,
      type: 'ally',
      spriteSheetUrl: mp.spriteSheetUrl || null,
      ...pos,
    });
  }

  // NPCs scattered around
  for (let i = 0; i < npcsHere.length; i++) {
    const npc = npcsHere[i];
    const angle = (i / Math.max(1, npcsHere.length)) * Math.PI * 2;
    const dist = 3 + Math.floor(i / 4);
    const nx = pc + Math.round(Math.cos(angle) * dist);
    const ny = pr + Math.round(Math.sin(angle) * dist);
    const clampX = Math.max(1, Math.min(gridW - 2, nx));
    const clampY = Math.max(1, Math.min(gridH - 2, ny));
    const pos = placeAt(clampX, clampY);

    let type = 'neutral';
    if (npc.disposition != null) {
      if (npc.disposition >= 10) type = 'ally';
      else if (npc.disposition <= -10) type = 'enemy';
    }

    entities.push({
      id: `npc_${npc.name || i}`,
      name: npc.name || `NPC ${i + 1}`,
      type,
      spriteSheetUrl: npc.spriteSheetUrl || null,
      ...pos,
    });
  }

  return entities;
}

function TokenOverlay({ entity, x, y, cellSize, isPlayer }) {
  const tokenSize = Math.round(cellSize * 1.1);
  const ringColor = entity.type === 'player' ? COLORS.playerRing
    : entity.type === 'ally' ? COLORS.allyRing
    : entity.type === 'enemy' ? COLORS.enemyRing
    : COLORS.neutralRing;

  const hasSheet = Boolean(entity.spriteSheetUrl);

  return (
    <div
      className="field-map-token"
      style={{
        left: x,
        top: y,
        width: tokenSize,
        height: tokenSize,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className="field-map-token__ring"
        style={{
          width: tokenSize,
          height: tokenSize,
          borderColor: ringColor,
          boxShadow: isPlayer ? `0 0 8px ${ringColor}40` : 'none',
        }}
      >
        {hasSheet ? (
          <LpcSprite
            sheetUrl={apiClient.resolveMediaUrl(entity.spriteSheetUrl)}
            animation="idle_down"
            width={tokenSize}
            height={tokenSize}
            playing={false}
            fallback={
              <span className="field-map-token__initials">{getInitials(entity.name)}</span>
            }
          />
        ) : (
          <span className="field-map-token__initials">{getInitials(entity.name)}</span>
        )}
      </div>
      <span className="field-map-token__name">{entity.name}</span>
    </div>
  );
}

export default function FieldMapCanvas({
  scene,
  world,
  characterName,
  interactive = false,
  multiplayerPlayers = [],
}) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const animRef = useRef({ particles: [] });
  const rafRef = useRef(0);

  const gridW = DEFAULT_WIDTH;
  const gridH = DEFAULT_HEIGHT;

  // Resolve biome from scene context
  const biomeKey = useMemo(() => {
    const locationName = world?.currentLocation || '';
    const narrative = scene?.narrative || '';
    const imagePrompt = scene?.imagePrompt || '';
    return resolveBiome(locationName, narrative, imagePrompt);
  }, [world?.currentLocation, scene?.narrative, scene?.imagePrompt]);

  // Generate deterministic tiles
  const tiles = useMemo(
    () => generateFieldTiles(biomeKey, gridW, gridH, scene?.id || 'default'),
    [biomeKey, gridW, gridH, scene?.id],
  );

  // NPCs at current location
  const npcsHere = useMemo(
    () => filterNpcsHere(world?.npcs, world?.currentLocationRef, world?.currentLocation),
    [world?.npcs, world?.currentLocationRef, world?.currentLocation],
  );

  // Entity list — mutable local state for movement
  const [entities, setEntities] = useState(() =>
    buildEntities(characterName, npcsHere, multiplayerPlayers, gridW, gridH),
  );

  // Rebuild entities when scene/NPCs change
  useEffect(() => {
    setEntities(buildEntities(characterName, npcsHere, multiplayerPlayers, gridW, gridH));
  }, [characterName, npcsHere, multiplayerPlayers, gridW, gridH]);

  // Movement handler
  const handleMove = useCallback((entityId, nx, ny) => {
    setEntities((prev) =>
      prev.map((e) => (e.id === entityId ? { ...e, x: nx, y: ny } : e)),
    );
  }, []);

  useFieldMapKeyboard({
    entities,
    tiles,
    gridW,
    gridH,
    playerEntityId: '__player__',
    onMove: handleMove,
    enabled: interactive,
  });

  // Responsive sizing
  useEffect(() => {
    const el = sizerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: pw, height: ph } = entry.contentRect;
      if (pw <= 0 || ph <= 0) return;
      let w, h;
      if (pw / ph > ASPECT_RATIO) {
        h = Math.floor(ph);
        w = Math.floor(h * ASPECT_RATIO);
      } else {
        w = Math.floor(pw);
        h = Math.floor(w / ASPECT_RATIO);
      }
      setContainerSize({ w, h });
      animRef.current.particles = initFieldParticles(w, h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Token positions
  const tokenPositions = useMemo(
    () => computeFieldTokenPositions(entities, containerSize.w, containerSize.h, gridW, gridH),
    [entities, containerSize.w, containerSize.h, gridW, gridH],
  );

  const cellSize = useMemo(
    () => getFieldCellSize(containerSize.w, containerSize.h, gridW, gridH),
    [containerSize.w, containerSize.h, gridW, gridH],
  );

  // Canvas draw loop
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
    drawFieldBackground(ctx, w, h, now, animRef.current.particles);
    drawFieldGrid(ctx, w, h, gridW, gridH, tiles);
  }, [containerSize, tiles, gridW, gridH]);

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

  return (
    <div
      ref={sizerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <div
        ref={containerRef}
        className="relative rounded-md overflow-hidden border border-outline-variant/20"
        style={{ width: containerSize.w, height: containerSize.h }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full absolute inset-0"
          style={{ display: 'block' }}
        />

        {/* Token overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {tokenPositions.map((pos) => (
            <TokenOverlay
              key={pos.entity.id}
              entity={pos.entity}
              x={pos.x}
              y={pos.y}
              cellSize={cellSize}
              isPlayer={pos.entity.id === '__player__'}
            />
          ))}
        </div>

        {/* Location label */}
        {world?.currentLocation && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-surface-container/80 border border-outline-variant/20 backdrop-blur-sm">
            <span className="material-symbols-outlined text-primary text-sm">explore</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              {world.currentLocation}
            </span>
          </div>
        )}

        {/* Movement hint */}
        {interactive && (
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/10 backdrop-blur-sm">
            <span className="material-symbols-outlined text-xs text-outline-variant">keyboard</span>
            <span className="text-[9px] text-outline-variant">
              {t('gameplay.fieldMapMoveHint', 'WASD / Arrows to move')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
