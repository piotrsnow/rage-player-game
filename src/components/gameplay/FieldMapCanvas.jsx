import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useGame } from '../../contexts/GameContext';
import {
  TILE_PX, VIEWPORT_RADIUS, CHUNK_SIZE, STEPS_PER_TURN,
  PREFETCH_EDGE_DISTANCE, chunkKey, worldToChunk,
} from '../../services/fieldMap/constants';
import { generateChunk } from '../../services/fieldMap/chunkGenerator';
import { loadAtlas, getMeta, getTileById } from '../../services/fieldMap/atlasIndex';
import { findPath } from '../../services/fieldMap/pathfinding';

const SCALE = 2;
const TILE_DRAW = TILE_PX * SCALE;

export default function FieldMapCanvas({ onFieldTurnReady }) {
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

  useEffect(() => {
    if (fieldMap?.chunks) {
      chunksRef.current = { ...chunksRef.current, ...fieldMap.chunks };
    }
  }, [fieldMap?.chunks]);

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
  }, [fieldMap?.playerPos?.x, fieldMap?.playerPos?.y, fieldMap?.seed]);

  useEffect(() => {
    _draw();
  }, [fieldMap?.playerPos, viewSize]);

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
    const { cx, cy } = worldToChunk(wx, wy);
    const needed = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(cx + dx, cy + dy);
        if (!chunksRef.current[key]) {
          const chunk = generateChunk(fieldMap.seed, cx + dx, cy + dy, fieldMap.activeBiome);
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
    const { cx, cy, lx, ly } = worldToChunk(wx, wy);
    const chunk = chunksRef.current[chunkKey(cx, cy)];
    if (!chunk) return { ground: null, object: null, passable: true };
    const idx = ly * chunk.size + lx;
    return {
      ground: chunk.ground[idx],
      object: chunk.objects[idx],
      passable: chunk.passable[idx],
    };
  }, []);

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

    ctx.fillStyle = '#ffdd44';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    const cx = offsetX + TILE_DRAW * 0.2;
    const cy2 = offsetY + TILE_DRAW * 0.1;
    const pw = TILE_DRAW * 0.6;
    const ph = TILE_DRAW * 0.8;
    ctx.fillRect(cx, cy2, pw, ph);
    ctx.strokeRect(cx, cy2, pw, ph);

    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(10, TILE_DRAW * 0.35)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@', offsetX + TILE_DRAW / 2, offsetY + TILE_DRAW / 2);

    if (pathQueueRef.current.length > 0) {
      ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
      for (const step of pathQueueRef.current) {
        const sx = offsetX + (step.x - px) * TILE_DRAW;
        const sy = offsetY + (step.y - py) * TILE_DRAW;
        ctx.fillRect(sx, sy, TILE_DRAW, TILE_DRAW);
      }
    }

    const stepsLeft = STEPS_PER_TURN - (fieldMap.stepCounter || 0);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 8, 160, 28);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Steps: ${fieldMap.stepCounter}/${STEPS_PER_TURN}`, 14, 14);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 40, 200, 20);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.fillText(`Pos: (${px}, ${py})  Biome: ${fieldMap.activeBiome}`, 14, 43);
  }, [fieldMap, viewSize, _getTileAt, _drawTile]);

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
