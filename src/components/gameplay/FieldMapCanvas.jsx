import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGameSlice, useGameDispatch } from '../../stores/gameSelectors';
import {
  STEPS_PER_TURN, chunkKey, worldToChunk,
} from '../../services/fieldMap/constants';
import { generateChunk } from '../../services/fieldMap/chunkGenerator';
import { loadAtlas, getMeta } from '../../services/fieldMap/atlasIndex';
import { findPath } from '../../services/fieldMap/pathfinding';
import { buildEntityList, computeEntityPositions } from './field/fieldMapEntities';
import { TILE_DRAW, drawFieldMap } from './field/fieldMapDraw';

export default function FieldMapCanvas({ onFieldTurnReady, scene, world, characterName }) {
  const dispatch = useGameDispatch();
  const fieldMap = useGameSlice((s) => s.world?.fieldMap);

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

  const mapEntities = useMemo(
    () => buildEntityList(world, scene, characterName),
    [world?.npcs, world?.currentLocation, scene?.id, scene?.dialogueSegments, characterName]
  );

  const _draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fieldMap || !atlasReady.current) return;

    const ctx = canvas.getContext('2d');
    const { w, h } = viewSize;
    if (w === 0 || h === 0) return;

    canvas.width = w;
    canvas.height = h;

    const entityPositions = computeEntityPositions(
      mapEntities,
      fieldMap.playerPos.x,
      fieldMap.playerPos.y,
      _getTileAt,
    );

    drawFieldMap({
      ctx,
      atlasImage: atlasImageRef.current,
      fieldMap,
      viewSize,
      mapEntities,
      entityPositions,
      pathQueue: pathQueueRef.current,
      characterName,
      getTileAt: _getTileAt,
    });
  }, [fieldMap, viewSize, _getTileAt, mapEntities, characterName]);

  useEffect(() => {
    _draw();
  }, [fieldMap?.playerPos, viewSize, mapEntities, scene?.id]);

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
