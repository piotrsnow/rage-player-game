import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGame } from '../../contexts/GameContext';
import {
  TILE_PX, VIEWPORT_RADIUS, CHUNK_SIZE, STEPS_PER_TURN,
  PREFETCH_EDGE_DISTANCE, chunkKey, worldToChunk,
} from '../../services/fieldMap/constants';
import { generateChunk } from '../../services/fieldMap/chunkGenerator';
import { loadAtlas, getMeta, getTileById, getTilesBySection } from '../../services/fieldMap/atlasIndex';
import { findPath } from '../../services/fieldMap/pathfinding';

const SCALE = 2;
const TILE_DRAW = TILE_PX * SCALE;

const HERO_SPRITES = [
  'ranger_green', 'adventurer_brown', 'warrior_tan', 'rogue_blue',
  'fighter_gray', 'mage_light', 'priest_white', 'wizard_blue',
  'jester_green', 'warlock_red',
];

function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickHeroSprite(name) {
  return HERO_SPRITES[hashName(name) % HERO_SPRITES.length];
}

const NPC_CLUSTER_ROLES = {
  patrol: ['hostile', 'fearful'],
  camp: ['friendly', 'neutral'],
  caravan: ['merchant', 'trader'],
};

function classifyNpcCluster(npc) {
  const att = (npc.attitude || '').toLowerCase();
  const role = (npc.role || '').toLowerCase();
  if (att === 'hostile' || att === 'fearful') return 'patrol';
  if (role.includes('merchant') || role.includes('trader') || role.includes('kupiec')) return 'caravan';
  return 'camp';
}

function buildEntityList(world, scene, characterName) {
  const entities = [];
  const currentLoc = world?.currentLocation?.toLowerCase() || '';
  const speakerNames = new Set();

  if (scene?.dialogueSegments) {
    for (const seg of scene.dialogueSegments) {
      if (seg?.type === 'dialogue' && seg.character) {
        const name = seg.character.trim();
        if (name.toLowerCase() !== (characterName || '').toLowerCase()) {
          speakerNames.add(name.toLowerCase());
        }
      }
    }
  }

  const npcsHere = (world?.npcs || []).filter((npc) => {
    if (!npc?.name || npc.alive === false) return false;
    return npc.lastLocation?.toLowerCase() === currentLoc;
  });

  const clusters = new Map();
  for (const npc of npcsHere) {
    const cluster = classifyNpcCluster(npc);
    if (!clusters.has(cluster)) clusters.set(cluster, []);
    clusters.get(cluster).push(npc);
  }

  let clusterIdx = 0;
  for (const [clusterType, npcs] of clusters) {
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const isSpeaker = speakerNames.has(npc.name.toLowerCase());
      entities.push({
        name: npc.name,
        type: 'npc',
        sprite: pickHeroSprite(npc.name),
        isSpeaker,
        highlight: isSpeaker,
        cluster: clusterType,
        clusterIdx,
        isLeader: i === 0,
        followerOffset: i,
      });
      speakerNames.delete(npc.name.toLowerCase());
    }
    clusterIdx++;
  }

  for (const name of speakerNames) {
    entities.push({
      name,
      type: 'npc',
      sprite: pickHeroSprite(name),
      isSpeaker: true,
      highlight: true,
      cluster: 'camp',
      clusterIdx: clusterIdx++,
      isLeader: true,
      followerOffset: 0,
    });
  }

  return entities;
}

export default function FieldMapCanvas({ onFieldTurnReady, scene, world, characterName }) {
  const { state, dispatch } = useGame();
  const fieldMap = state.world?.fieldMap;

  const canvasRef = useRef(null);
  const atlasImageRef = useRef(null);
  const atlasReady = useRef(false);
  const animFrameRef = useRef(null);
  const pathQueueRef = useRef([]);
  const walkTimerRef = useRef(null);

  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const chunksRef = useRef({});

  const prevMapModeRef = useRef(fieldMap?.mapMode);

  useEffect(() => {
    if (fieldMap?.mapMode !== prevMapModeRef.current) {
      chunksRef.current = {};
      prevMapModeRef.current = fieldMap?.mapMode;
    }
    if (fieldMap?.chunks) {
      chunksRef.current = { ...chunksRef.current, ...fieldMap.chunks };
    }
  }, [fieldMap?.chunks, fieldMap?.mapMode]);

  useEffect(() => {
    loadAtlas().then(() => {
      const meta = getMeta();
      if (!meta) return;
      const img = new Image();
      img.src = `/${meta.image}`;
      img.onload = () => {
        atlasImageRef.current = img;
        atlasReady.current = true;
        _draw();
      };
    });
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!fieldMap) return;
    _ensureChunksAround(fieldMap.playerPos.x, fieldMap.playerPos.y);
  }, [fieldMap?.playerPos?.x, fieldMap?.playerPos?.y, fieldMap?.seed, fieldMap?.mapMode, fieldMap?.roadVariant]);

  useEffect(() => {
    _draw();
  }, [fieldMap?.playerPos, viewSize, mapEntities, scene?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  const _ensureChunksAround = useCallback((wx, wy) => {
    if (!fieldMap) return;
    const chunkSize = fieldMap.mapMode === 'wnetrze' ? 24 : 64;
    const { cx, cy } = worldToChunk(wx, wy, chunkSize);
    const needed = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(cx + dx, cy + dy);
        if (!chunksRef.current[key]) {
          const chunk = generateChunk(
            fieldMap.seed, cx + dx, cy + dy,
            fieldMap.activeBiome, {},
            fieldMap.mapMode || null,
            fieldMap.roadVariant || null,
          );
          chunksRef.current[key] = chunk;
          needed.push([key, chunk]);
        }
      }
    }
    if (needed.length > 0) {
      const payload = {};
      for (const [key, chunk] of needed) {
        payload[key] = chunk;
      }
      dispatch({ type: 'FIELD_MAP_SET_CHUNKS', payload });
    }
  }, [fieldMap, dispatch]);

  const _getTileAt = useCallback((wx, wy) => {
    const chunkSize = fieldMap?.mapMode === 'wnetrze' ? 24 : 64;
    const { cx, cy, lx, ly } = worldToChunk(wx, wy, chunkSize);
    const chunk = chunksRef.current[chunkKey(cx, cy)];
    if (!chunk) return { ground: null, object: null, passable: true };
    const idx = ly * chunk.size + lx;
    return {
      ground: chunk.ground[idx],
      object: chunk.objects[idx],
      passable: chunk.passable[idx],
    };
  }, [fieldMap?.mapMode]);

  const _drawTile = useCallback((ctx, tileId, dx, dy) => {
    if (!tileId || !atlasReady.current) return;
    const tile = getTileById(tileId);
    if (!tile || !atlasImageRef.current) return;
    ctx.drawImage(
      atlasImageRef.current,
      tile.x, tile.y, TILE_PX, TILE_PX,
      dx, dy, TILE_DRAW, TILE_DRAW
    );
  }, []);

  const mapEntities = useMemo(
    () => buildEntityList(world, scene, characterName),
    [world?.npcs, world?.currentLocation, scene?.id, scene?.dialogueSegments, characterName]
  );

  const entityPositionsRef = useRef(new Map());

  const _computeEntityPositions = useCallback((px, py) => {
    const positions = new Map();
    const occupied = new Set([`${px},${py}`]);

    const leaderAnchors = [
      { dx: -3, dy: -2 }, { dx: 3, dy: -2 }, { dx: -3, dy: 2 }, { dx: 3, dy: 2 },
      { dx: 0, dy: -3 }, { dx: 0, dy: 3 }, { dx: -4, dy: 0 }, { dx: 4, dy: 0 },
    ];
    const speakerAnchors = [
      { dx: -2, dy: -1 }, { dx: 2, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ];
    const followerOffsets = [
      { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
      { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
    ];

    const speakers = mapEntities.filter((e) => e.isSpeaker && e.isLeader);
    const leaders = mapEntities.filter((e) => !e.isSpeaker && e.isLeader);
    const followers = mapEntities.filter((e) => !e.isLeader);

    const placeAt = (entity, anchorList, basePx, basePy) => {
      const h = hashName(entity.name);
      for (let attempt = 0; attempt < anchorList.length * 2; attempt++) {
        const off = anchorList[(h + attempt) % anchorList.length];
        const ex = basePx + off.dx;
        const ey = basePy + off.dy;
        const key = `${ex},${ey}`;
        if (!occupied.has(key) && _getTileAt(ex, ey).passable) {
          positions.set(entity.name, { x: ex, y: ey });
          occupied.add(key);
          return true;
        }
      }
      return false;
    };

    for (const entity of speakers) {
      if (!placeAt(entity, speakerAnchors, px, py)) {
        placeAt(entity, leaderAnchors, px, py);
      }
    }

    for (const entity of leaders) {
      placeAt(entity, leaderAnchors, px, py);
    }

    for (const entity of followers) {
      const leaderEntity = mapEntities.find(
        (e) => e.isLeader && e.clusterIdx === entity.clusterIdx
      );
      const leaderPos = leaderEntity ? positions.get(leaderEntity.name) : null;
      const base = leaderPos || { x: px, y: py };
      if (!placeAt(entity, followerOffsets, base.x, base.y)) {
        placeAt(entity, leaderAnchors, px, py);
      }
    }

    entityPositionsRef.current = positions;
  }, [mapEntities, _getTileAt]);

  const _drawEntity = useCallback((ctx, spriteId, drawX, drawY, highlight, isSpeaker) => {
    const tile = getTileById(spriteId);
    if (!tile || !atlasImageRef.current) {
      ctx.fillStyle = highlight ? '#ffdd44' : '#aabbcc';
      ctx.fillRect(drawX + TILE_DRAW * 0.2, drawY + TILE_DRAW * 0.1, TILE_DRAW * 0.6, TILE_DRAW * 0.8);
      return;
    }

    if (highlight) {
      ctx.shadowColor = isSpeaker ? 'rgba(255, 220, 60, 0.8)' : 'rgba(100, 200, 255, 0.6)';
      ctx.shadowBlur = 10;
    }

    ctx.drawImage(
      atlasImageRef.current,
      tile.x, tile.y, TILE_PX, TILE_PX,
      drawX, drawY, TILE_DRAW, TILE_DRAW,
    );

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }, []);

  const _drawNameLabel = useCallback((ctx, name, drawX, drawY, isSpeaker) => {
    const label = name.length > 10 ? name.slice(0, 9) + '…' : name;
    ctx.font = `bold ${Math.max(8, TILE_DRAW * 0.25)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const lx = drawX + TILE_DRAW / 2;
    const ly = drawY - 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const tw = ctx.measureText(label).width;
    ctx.fillRect(lx - tw / 2 - 2, ly - Math.max(8, TILE_DRAW * 0.25) - 1, tw + 4, Math.max(8, TILE_DRAW * 0.25) + 2);
    ctx.fillStyle = isSpeaker ? '#ffdd44' : '#ddeeff';
    ctx.fillText(label, lx, ly);
  }, []);

  const _draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fieldMap || !atlasReady.current) return;

    const ctx = canvas.getContext('2d');
    const { w, h } = viewSize;
    if (w === 0 || h === 0) return;

    canvas.width = w;
    canvas.height = h;
    ctx.imageSmoothingEnabled = false;

    const tilesW = Math.ceil(w / TILE_DRAW) + 2;
    const tilesH = Math.ceil(h / TILE_DRAW) + 2;
    const halfW = Math.floor(tilesW / 2);
    const halfH = Math.floor(tilesH / 2);

    const px = fieldMap.playerPos.x;
    const py = fieldMap.playerPos.y;

    const offsetX = Math.floor(w / 2) - TILE_DRAW / 2;
    const offsetY = Math.floor(h / 2) - TILE_DRAW / 2;

    for (let ty = -halfH; ty <= halfH; ty++) {
      for (let tx = -halfW; tx <= halfW; tx++) {
        const wx = px + tx;
        const wy = py + ty;
        const drawX = offsetX + tx * TILE_DRAW;
        const drawY = offsetY + ty * TILE_DRAW;

        const { ground, object } = _getTileAt(wx, wy);
        if (ground) _drawTile(ctx, ground, drawX, drawY);
        if (object) _drawTile(ctx, object, drawX, drawY);
      }
    }

    if (pathQueueRef.current.length > 0) {
      ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
      for (const step of pathQueueRef.current) {
        const sx = offsetX + (step.x - px) * TILE_DRAW;
        const sy = offsetY + (step.y - py) * TILE_DRAW;
        ctx.fillRect(sx, sy, TILE_DRAW, TILE_DRAW);
      }
    }

    _computeEntityPositions(px, py);
    for (const entity of mapEntities) {
      const pos = entityPositionsRef.current.get(entity.name);
      if (!pos) continue;
      const ex = offsetX + (pos.x - px) * TILE_DRAW;
      const ey = offsetY + (pos.y - py) * TILE_DRAW;
      _drawEntity(ctx, entity.sprite, ex, ey, entity.highlight, entity.isSpeaker);
      _drawNameLabel(ctx, entity.name, ex, ey, entity.isSpeaker);
    }

    const playerSprite = getTileById('hero_gold') || getTileById(HERO_SPRITES[0]);
    if (playerSprite && atlasImageRef.current) {
      ctx.shadowColor = 'rgba(255, 220, 60, 0.9)';
      ctx.shadowBlur = 14;
      ctx.drawImage(
        atlasImageRef.current,
        playerSprite.x, playerSprite.y, TILE_PX, TILE_PX,
        offsetX, offsetY, TILE_DRAW, TILE_DRAW,
      );
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#ffdd44';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.fillRect(offsetX + TILE_DRAW * 0.2, offsetY + TILE_DRAW * 0.1, TILE_DRAW * 0.6, TILE_DRAW * 0.8);
      ctx.strokeRect(offsetX + TILE_DRAW * 0.2, offsetY + TILE_DRAW * 0.1, TILE_DRAW * 0.6, TILE_DRAW * 0.8);
    }

    if (characterName) {
      _drawNameLabel(ctx, characterName, offsetX, offsetY, true);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 8, 160, 28);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Steps: ${fieldMap.stepCounter}/${STEPS_PER_TURN}`, 14, 14);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 40, 260, 20);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    const modeLabel = fieldMap.mapMode === 'trakt' ? `trakt/${fieldMap.roadVariant || 'pola'}` : (fieldMap.mapMode || fieldMap.activeBiome);
    ctx.fillText(`Pos: (${px}, ${py})  Mode: ${modeLabel}`, 14, 43);
  }, [fieldMap, viewSize, _getTileAt, _drawTile, _computeEntityPositions, _drawEntity, _drawNameLabel, mapEntities, characterName]);

  const _movePlayerTo = useCallback((x, y) => {
    if (!fieldMap) return;
    const { ground, object, passable } = _getTileAt(x, y);
    if (!passable) return;

    dispatch({
      type: 'FIELD_MAP_MOVE_PLAYER',
      payload: { x, y, tile: object || ground, biome: fieldMap.activeBiome },
    });

    const newCounter = (fieldMap.stepCounter || 0) + 1;
    if (newCounter >= STEPS_PER_TURN && onFieldTurnReady) {
      onFieldTurnReady();
    }
  }, [fieldMap, dispatch, _getTileAt, onFieldTurnReady]);

  const _walkPath = useCallback(() => {
    if (pathQueueRef.current.length === 0) return;
    const next = pathQueueRef.current.shift();
    _movePlayerTo(next.x, next.y);
    _draw();
    if (pathQueueRef.current.length > 0) {
      walkTimerRef.current = setTimeout(_walkPath, 120);
    }
  }, [_movePlayerTo, _draw]);

  const handleCanvasClick = useCallback((e) => {
    if (!fieldMap || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const offsetX = Math.floor(viewSize.w / 2) - TILE_DRAW / 2;
    const offsetY = Math.floor(viewSize.h / 2) - TILE_DRAW / 2;

    const tx = Math.floor((mx - offsetX + TILE_DRAW / 2) / TILE_DRAW) + fieldMap.playerPos.x;
    const ty = Math.floor((my - offsetY + TILE_DRAW / 2) / TILE_DRAW) + fieldMap.playerPos.y;

    if (tx === fieldMap.playerPos.x && ty === fieldMap.playerPos.y) return;

    const path = findPath(
      fieldMap.playerPos.x, fieldMap.playerPos.y,
      tx, ty,
      chunksRef.current,
      80
    );

    if (path && path.length > 0) {
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
      pathQueueRef.current = path;
      _walkPath();
    }
  }, [fieldMap, viewSize, _walkPath]);

  const handleKeyDown = useCallback((e) => {
    if (!fieldMap) return;
    const { x, y } = fieldMap.playerPos;
    let nx = x, ny = y;
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': ny--; break;
      case 'ArrowDown': case 's': case 'S': ny++; break;
      case 'ArrowLeft': case 'a': case 'A': nx--; break;
      case 'ArrowRight': case 'd': case 'D': nx++; break;
      default: return;
    }
    e.preventDefault();
    _movePlayerTo(nx, ny);
  }, [fieldMap, _movePlayerTo]);

  if (!fieldMap) {
    return (
      <div className="w-full h-full flex items-center justify-center text-surface-on-variant">
        <p className="text-sm">No field map initialized.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none' }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-pointer"
        onClick={handleCanvasClick}
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
