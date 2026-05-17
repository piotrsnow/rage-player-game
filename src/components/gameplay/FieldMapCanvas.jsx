import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LpcSprite, { getAnimDirection } from '../shared/LpcSprite';
import { apiClient } from '../../services/apiClient';
import { useGameCampaign, useGameSlice, useGameDispatch } from '../../stores/gameSelectors';
import { useGameStore } from '../../stores/gameStore';
import { resolveBiome } from '../../effects/biomeResolver';
import { filterNpcsHere } from '../../utils/npcLocation';
import { generateFieldTiles } from './combat/generateFieldTiles';
import {
  getFieldCellSize,
  fieldCellToPixel,
  fieldPixelToCell,
  initFieldParticles,
  drawFieldBackground,
  drawFieldGrid,
  computeFieldTokenPositions,
  COLORS,
} from './combat/fieldMapDraw';
import { useFieldMapKeyboard } from '../../hooks/useFieldMapKeyboard';
import { useFieldMapInteraction } from '../../hooks/useFieldMapInteraction';
import { useLocationBoardVisuals } from '../../hooks/useLocationBoardVisuals';
import { useCharacterSprites } from '../../hooks/useCharacterSprites';
import { gridDimensionsForScale } from '../../../shared/domain/fieldMapScale';
import { isTilePassable, isPortalTile } from '../../../shared/domain/battlefieldTiles.js';
import { drawAtlasLayer, resolveObjectSprite } from './combat/fieldMapTileRenderer';

const WALK_ANIM_MS = 400;
const BFS_MOVE_DELAY = 120;
const VIEWPORT_THRESHOLD_W = 18;
const VIEWPORT_THRESHOLD_H = 16;
const MINIMAP_SIZE = 100;
const FOG_ALPHA = 0.7;

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── BFS pathfinding ──

function bfsPath(tiles, gridW, gridH, start, goal, entities, playerEntityId) {
  if (start.x === goal.x && start.y === goal.y) return [];
  const occupied = new Set();
  for (const e of entities) {
    if (e.id !== playerEntityId) occupied.add(`${e.x}:${e.y}`);
  }
  const visited = new Set();
  const queue = [{ x: start.x, y: start.y, path: [] }];
  visited.add(`${start.x}:${start.y}`);

  while (queue.length > 0) {
    const { x, y, path } = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
      const key = `${nx}:${ny}`;
      if (visited.has(key)) continue;
      const tileId = tiles?.[nx]?.[ny];
      if (tileId && !isTilePassable(tileId)) continue;
      if (occupied.has(key) && !(nx === goal.x && ny === goal.y)) continue;
      visited.add(key);
      const newPath = [...path, { x: nx, y: ny }];
      if (nx === goal.x && ny === goal.y) return newPath;
      if (newPath.length < 30) queue.push({ x: nx, y: ny, path: newPath });
    }
  }
  return null;
}

// ── FOG helpers ──

function computeVisibleCells(px, py, radius) {
  const cells = new Set();
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx * dx + dy * dy <= radius * radius) {
        cells.add(`${px + dx}:${py + dy}`);
      }
    }
  }
  return cells;
}

// ── Object / exit icon lookup ──

const OBJECT_ICONS = {
  chest: '📦', altar: '⛩️', lever: '🔧', sign: '📜', bed: '🛏️',
  table: '🪑', door: '🚪', barrel: '🪣', crate: '📦', bookshelf: '📚',
  well: '🪣', campfire: '🔥', forge: '⚒️', cauldron: '🫕', throne: '👑',
  statue: '🗿', fountain: '⛲', shrine: '🕯️', workbench: '🔨',
  stash: '💰', trap: '⚠️', cage: '🔒', grave: '⚰️', ladder: '🪜', crystal: '💎',
};

const EXIT_ARROWS = {
  N: '↑', S: '↓', E: '→', W: '←', up: '⬆', down: '⬇',
};

function buildEntities(characterName, playerSpriteSheet, npcsHere, multiplayerPlayers, gridW, gridH, aiEntities, npcSpriteMap) {
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
            if (!occupied.has(nk)) { occupied.add(nk); return { x: nx, y: ny }; }
          }
        }
      }
    }
    occupied.add(key);
    return { x, y };
  }

  const aiMap = new Map();
  if (Array.isArray(aiEntities)) {
    for (const ae of aiEntities) aiMap.set(ae.id, ae);
  }

  const playerAi = aiMap.get('__player__');
  const pc = playerAi?.x ?? Math.floor(gridW / 2);
  const pr = playerAi?.y ?? Math.floor(gridH / 2);
  const playerPos = placeAt(pc, pr);
  entities.push({
    id: '__player__',
    name: characterName || 'Player',
    type: 'player',
    spriteSheetUrl: playerSpriteSheet || null,
    ...playerPos,
  });

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

  for (let i = 0; i < npcsHere.length; i++) {
    const npc = npcsHere[i];
    const npcId = `npc_${npc.name || i}`;
    const npcAi = aiMap.get(npcId);
    let nx, ny;
    if (npcAi) { nx = npcAi.x; ny = npcAi.y; }
    else {
      const angle = (i / Math.max(1, npcsHere.length)) * Math.PI * 2;
      const dist = 3 + Math.floor(i / 4);
      nx = Math.max(1, Math.min(gridW - 2, pc + Math.round(Math.cos(angle) * dist)));
      ny = Math.max(1, Math.min(gridH - 2, pr + Math.round(Math.sin(angle) * dist)));
    }
    const pos = placeAt(nx, ny);
    let type = 'neutral';
    if (npc.disposition != null) {
      if (npc.disposition >= 10) type = 'ally';
      else if (npc.disposition <= -10) type = 'enemy';
    }
    // Lazy-generated sprite (campaignNpcId-keyed) wins over a stale value on
    // the NPC row — fresh sheets arrive after the initial render.
    const generated = npcSpriteMap && npc.campaignNpcId ? npcSpriteMap[npc.campaignNpcId] : null;
    entities.push({
      id: npcId,
      name: npc.name || `NPC ${i + 1}`,
      type,
      spriteSheetUrl: generated || npc.spriteSheetUrl || null,
      ...pos,
    });
  }

  return entities;
}

function applyPlayerBoardPosition(ents, { isExplorationBoard, boardPosition, locationBoard }) {
  if (!isExplorationBoard) return ents;
  const player = ents.find((e) => e.id === '__player__');
  if (!player) return ents;
  if (boardPosition) {
    player.x = boardPosition.x;
    player.y = boardPosition.y;
  } else if (locationBoard?.spawnPoint) {
    player.x = locationBoard.spawnPoint.x;
    player.y = locationBoard.spawnPoint.y;
  }
  return ents;
}

/** Merge rebuilt NPC/MP tokens with the live player cell (store + local movement). */
function mergeRebuiltEntities(prev, ents, { isExplorationBoard, sameLocation }) {
  if (!isExplorationBoard) return ents;
  const { boardPosition, locationBoard } = useGameStore.getState().state.world ?? {};
  const next = applyPlayerBoardPosition(ents, { isExplorationBoard, boardPosition, locationBoard });
  if (!sameLocation) return next;
  const prevPlayer = prev?.find((e) => e.id === '__player__');
  const nextPlayer = next.find((e) => e.id === '__player__');
  if (!prevPlayer || !nextPlayer) return next;
  if (boardPosition) {
    nextPlayer.x = boardPosition.x;
    nextPlayer.y = boardPosition.y;
    return next;
  }
  const sp = locationBoard?.spawnPoint;
  const wasAtSpawn = sp && prevPlayer.x === sp.x && prevPlayer.y === sp.y;
  if (!wasAtSpawn) {
    nextPlayer.x = prevPlayer.x;
    nextPlayer.y = prevPlayer.y;
  }
  return next;
}

function TokenOverlay({ entity, x, y, cellSize, isPlayer, animation }) {
  const ringColor = entity.type === 'player' ? COLORS.playerRing
    : entity.type === 'ally' ? COLORS.allyRing
    : entity.type === 'enemy' ? COLORS.enemyRing
    : COLORS.neutralRing;

  const hasSheet = Boolean(entity.spriteSheetUrl);

  if (hasSheet) {
    const spriteSize = Math.round(cellSize * 1.4);
    return (
      <div
        className={`field-map-token field-map-token--sprite${isPlayer ? ' field-map-token--player' : ''}`}
        style={{ left: x, top: y, width: spriteSize, height: spriteSize, transform: 'translate(-50%, -60%)' }}
      >
        <div className="field-map-token__sprite-wrap" style={{ width: spriteSize, height: spriteSize }}>
          <LpcSprite
            sheetUrl={apiClient.resolveMediaUrl(entity.spriteSheetUrl)}
            animation={animation}
            width={spriteSize}
            height={spriteSize}
            playing={true}
            fallback={<span className="field-map-token__initials">{getInitials(entity.name)}</span>}
          />
        </div>
        <span className="field-map-token__name">{entity.name}</span>
      </div>
    );
  }

  const tokenSize = Math.round(cellSize * 1.2);
  return (
    <div className="field-map-token" style={{ left: x, top: y, width: tokenSize, height: tokenSize, transform: 'translate(-50%, -50%)' }}>
      <div
        className="field-map-token__ring"
        style={{ width: tokenSize, height: tokenSize, borderColor: ringColor, boxShadow: isPlayer ? `0 0 8px ${ringColor}40` : 'none' }}
      >
        <span className="field-map-token__initials">{getInitials(entity.name)}</span>
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
  suppressTokens = false,
  multiplayerPlayers = [],
  onNpcInteract,
  onPortalEnter,
  onObjectInteract,
  locationScale,
}) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const sizerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const animRef = useRef({ particles: [] });
  const rafRef = useRef(0);
  const fetchedRef = useRef(null);
  const bfsQueueRef = useRef(null);
  const layoutLocationKeyRef = useRef(null);

  const campaign = useGameCampaign();
  const backendCampaignId = campaign?.backendId || null;
  const dispatch = useGameDispatch();
  const playerSpriteSheet = useGameSlice((s) => s.character?.spriteSheetUrl);
  const boardPosition = useGameSlice((s) => s.world?.boardPosition);
  const locationBoard = useGameSlice((s) => s.world?.locationBoard);
  // Primitive only — never `|| {}` in a selector (new object every snapshot → infinite re-render).
  const boardVisitedCellCount = useGameSlice((s) => {
    const cells = s.world?.boardVisited;
    return cells ? Object.keys(cells).length : 0;
  });

  // Determine data source: location board (new) or scene field map (legacy)
  const persisted = locationBoard || scene?.fieldMapTiles;
  const isExplorationBoard = locationBoard?.version === 1 || locationBoard?.version === 2;
  const isV2Board = locationBoard?.version === 2;

  const scaledGrid = useMemo(() => gridDimensionsForScale(locationScale), [locationScale]);
  const gridW = persisted?.width || scaledGrid.w;
  const gridH = persisted?.height || scaledGrid.h;
  const ASPECT_RATIO = gridW / gridH;
  const needsViewport = gridW > VIEWPORT_THRESHOLD_W || gridH > VIEWPORT_THRESHOLD_H;

  const biomeKey = useMemo(() => {
    const locationName = world?.currentLocation || '';
    const narrative = scene?.narrative || '';
    const imagePrompt = scene?.imagePrompt || '';
    return resolveBiome(locationName, narrative, imagePrompt);
  }, [world?.currentLocation, scene?.narrative, scene?.imagePrompt]);

  const { tiles, portals: legacyPortals } = useMemo(() => {
    if (persisted?.tiles) return { tiles: persisted.tiles, portals: persisted.portals || [] };
    return generateFieldTiles(biomeKey, gridW, gridH, scene?.id || 'default');
  }, [persisted, biomeKey, gridW, gridH, scene?.id]);

  const boardObjects = useMemo(() => (isExplorationBoard ? locationBoard.objects || [] : []), [isExplorationBoard, locationBoard]);
  const boardExits = useMemo(() => (isExplorationBoard ? locationBoard.exits || [] : []), [isExplorationBoard, locationBoard]);
  const portals = useMemo(() => {
    if (isExplorationBoard) {
      return boardExits.map((e) => ({
        x: e.x, y: e.y,
        destinationName: e.label || e.targetLocationName,
        destinationRef: e.targetLocationRef || null,
      }));
    }
    return legacyPortals;
  }, [isExplorationBoard, boardExits, legacyPortals]);

  // V2 visual layer: poll + decode atlas while worker generates tileset.
  const { atlasImage, status: visualStatus } = useLocationBoardVisuals({
    campaignId: backendCampaignId,
    locationBoard,
  });

  const npcsHere = useMemo(
    () => filterNpcsHere(world?.npcs, world?.currentLocationRef, world?.currentLocation),
    [world?.npcs, world?.currentLocationRef, world?.currentLocation],
  );

  // Lazy-generate chargen LPC sheets for NPCs at this location that lack a
  // spritesheet. Without this the token falls back to an initials ellipse.
  const npcSpriteItems = useMemo(
    () => npcsHere
      .filter((n) => n.campaignNpcId && !n.spriteSheetUrl)
      .map((n) => ({ id: n.campaignNpcId, kind: 'campaign-npc', spriteUrl: null })),
    [npcsHere],
  );
  const extraNpcSprites = useCharacterSprites(npcSpriteItems, {
    campaignId: backendCampaignId,
    endpoint: 'campaign',
  });

  const npcsHereKey = useMemo(
    () => npcsHere.map((n) => `${n.id ?? n.name ?? ''}:${n.disposition ?? ''}`).join('|'),
    [npcsHere],
  );

  const npcSpriteMapKey = useMemo(
    () => Object.keys(extraNpcSprites).sort().join('|'),
    [extraNpcSprites],
  );

  const multiplayerLayoutKey = useMemo(() => {
    if (!multiplayerPlayers?.length) return '';
    return multiplayerPlayers
      .map((p) => `${p.id ?? ''}:${p.characterName ?? ''}:${p.spriteSheetUrl ?? ''}`)
      .join('|');
  }, [multiplayerPlayers]);

  const locationKey = world?.currentLocationRef
    ? `${world.currentLocationRef.kind}:${world.currentLocationRef.id}`
    : (world?.currentLocation || '');

  const [entities, setEntities] = useState(() => {
    const aiEntities = persisted?.entities;
    const ents = buildEntities(characterName, playerSpriteSheet, npcsHere, multiplayerPlayers, gridW, gridH, aiEntities, extraNpcSprites);
    return applyPlayerBoardPosition(ents, { isExplorationBoard, boardPosition, locationBoard });
  });

  const [entityAnims, setEntityAnims] = useState({});
  const animTimersRef = useRef({});

  // Camera offset for viewport scrolling
  const [cameraOffset, setCameraOffset] = useState({ x: 0, y: 0 });

  // Rebuild tokens when board/NPC layout changes — not on every boardPosition update (movement).
  useEffect(() => {
    const sameLocation = layoutLocationKeyRef.current === locationKey;
    layoutLocationKeyRef.current = locationKey;
    const aiEntities = persisted?.entities;
    const ents = buildEntities(characterName, playerSpriteSheet, npcsHere, multiplayerPlayers, gridW, gridH, aiEntities, extraNpcSprites);
    setEntities((prev) => mergeRebuiltEntities(prev, ents, { isExplorationBoard, sameLocation }));
    // npcsHere / multiplayerPlayers omitted — keys avoid solo `[]` retriggering every parent render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterName, playerSpriteSheet, npcsHereKey, multiplayerLayoutKey, npcSpriteMapKey, gridW, gridH, persisted, isExplorationBoard, locationBoard, locationKey]);

  // Fetch location board from backend when not present
  useEffect(() => {
    if (locationBoard || !backendCampaignId) return;
    if (!world?.currentLocationRef?.kind || !world?.currentLocationRef?.id) return;
    const refKey = `${world.currentLocationRef.kind}:${world.currentLocationRef.id}`;
    if (fetchedRef.current === refKey) return;
    fetchedRef.current = refKey;

    apiClient.generateLocationBoard(backendCampaignId)
      .then((data) => {
        if (data?.tiles) {
          dispatch({ type: 'SET_LOCATION_BOARD', payload: data });
          const alreadyPlaced = useGameStore.getState().state.world?.boardPosition;
          if (data.spawnPoint && !alreadyPlaced) {
            dispatch({ type: 'SET_BOARD_POSITION', payload: data.spawnPoint });
          }
        }
      })
      .catch(() => {});
  }, [locationBoard, backendCampaignId, world?.currentLocationRef, dispatch]);

  // Legacy fallback: fetch per-scene field map
  useEffect(() => {
    if (locationBoard || persisted || !scene?.id || !backendCampaignId) return;
    if (scene.subtype === 'quick_beat') return;
    const sceneIndex = scene.sceneIndex;
    if (sceneIndex == null) return;
    const legacyKey = `legacy:${scene.id}`;
    if (fetchedRef.current === legacyKey) return;
    fetchedRef.current = legacyKey;

    apiClient.generateFieldMap(backendCampaignId, sceneIndex)
      .then((data) => {
        if (data?.tiles) {
          dispatch({ type: 'UPDATE_SCENE_FIELD_MAP', payload: { sceneId: scene.id, fieldMapTiles: data } });
        }
      })
      .catch(() => {});
  }, [locationBoard, scene?.id, scene?.sceneIndex, scene?.subtype, persisted, backendCampaignId, dispatch]);

  // Track visited cells for fog-of-war (ref avoids subscribing to unstable object snapshots).
  const visitedCellsRef = useRef(new Set());
  useEffect(() => {
    const cells = useGameStore.getState().state.world?.boardVisited;
    visitedCellsRef.current = new Set(cells ? Object.keys(cells) : []);
  }, [boardVisitedCellCount, locationKey]);

  const revealFog = useCallback((px, py) => {
    const visible = computeVisibleCells(px, py, 4);
    const newCells = [];
    for (const key of visible) {
      if (!visitedCellsRef.current.has(key)) {
        visitedCellsRef.current.add(key);
        newCells.push(key);
      }
    }
    if (newCells.length > 0) {
      dispatch({ type: 'CLEAR_BOARD_FOG', payload: { cells: newCells } });
    }
  }, [dispatch]);

  // Movement handler with walk animation
  const handleMove = useCallback((entityId, nx, ny) => {
    let walkDir = null;
    setEntities((prev) => {
      const ent = prev.find((e) => e.id === entityId);
      if (!ent) return prev;
      const dx = nx - ent.x;
      const dy = ny - ent.y;
      walkDir = getAnimDirection(dx, dy);
      return prev.map((e) => (e.id === entityId ? { ...e, x: nx, y: ny } : e));
    });
    if (!walkDir) return;

    if (entityId === '__player__') {
      dispatch({ type: 'SET_BOARD_POSITION', payload: { x: nx, y: ny } });
      revealFog(nx, ny);
    }

    setEntityAnims((a) => ({ ...a, [entityId]: `walk_${walkDir}` }));
    if (animTimersRef.current[entityId]) clearTimeout(animTimersRef.current[entityId]);
    animTimersRef.current[entityId] = setTimeout(() => {
      setEntityAnims((a) => ({ ...a, [entityId]: `idle_${walkDir}` }));
    }, WALK_ANIM_MS);
  }, [dispatch, revealFog]);

  const cellFromCanvasEvent = useCallback((e) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left + (needsViewport ? cameraOffset.x : 0);
    const py = e.clientY - rect.top + (needsViewport ? cameraOffset.y : 0);
    return fieldPixelToCell(
      px, py,
      needsViewport ? gridW * getFieldCellSize(containerSize.w, containerSize.h, gridW, gridH) + 20 : containerSize.w,
      needsViewport ? gridH * getFieldCellSize(containerSize.w, containerSize.h, gridW, gridH) + 20 : containerSize.h,
      gridW, gridH,
    );
  }, [needsViewport, cameraOffset, containerSize, gridW, gridH]);

  const walkPlayerToCell = useCallback((cell) => {
    const player = entities.find((ent) => ent.id === '__player__');
    if (!player) return;
    if (bfsQueueRef.current) {
      bfsQueueRef.current = null;
    }
    const path = bfsPath(tiles, gridW, gridH, player, cell, entities, '__player__');
    if (!path || path.length === 0) return;

    bfsQueueRef.current = { steps: path, idx: 0 };
    const walkStep = () => {
      const q = bfsQueueRef.current;
      if (!q || q.idx >= q.steps.length) { bfsQueueRef.current = null; return; }
      const step = q.steps[q.idx];
      q.idx++;
      handleMove('__player__', step.x, step.y);
      if (q.idx < q.steps.length) {
        setTimeout(walkStep, BFS_MOVE_DELAY);
      } else {
        bfsQueueRef.current = null;
      }
    };
    walkStep();
  }, [entities, tiles, gridW, gridH, handleMove]);

  // Single click — interact with adjacent objects only (no walking).
  const handleCanvasClick = useCallback((e) => {
    if (!interactive) return;
    const cell = cellFromCanvasEvent(e);
    if (!cell) return;

    const player = entities.find((ent) => ent.id === '__player__');
    if (!player || !onObjectInteract) return;

    const clickedObj = boardObjects.find((o) => o.x === cell.x && o.y === cell.y && o.interactable);
    if (!clickedObj) return;
    const dx = Math.abs(cell.x - player.x);
    const dy = Math.abs(cell.y - player.y);
    if (dx <= 1 && dy <= 1) {
      onObjectInteract(clickedObj);
    }
  }, [interactive, cellFromCanvasEvent, entities, boardObjects, onObjectInteract]);

  // Double click — click-to-move via BFS.
  const handleCanvasDoubleClick = useCallback((e) => {
    if (!interactive) return;
    e.preventDefault();
    const cell = cellFromCanvasEvent(e);
    if (!cell) return;
    walkPlayerToCell(cell);
  }, [interactive, cellFromCanvasEvent, walkPlayerToCell]);

  useFieldMapKeyboard({
    entities,
    tiles,
    gridW,
    gridH,
    playerEntityId: '__player__',
    onMove: handleMove,
    enabled: interactive,
  });

  const { adjacentNpc, standingOnPortal } = useFieldMapInteraction({
    entities,
    portals,
    playerEntityId: '__player__',
    onNpcInteract,
    onPortalEnter,
    enabled: interactive,
  });

  // Adjacent interactable object detection
  const adjacentObject = useMemo(() => {
    if (!interactive || !isExplorationBoard) return null;
    const player = entities.find((e) => e.id === '__player__');
    if (!player) return null;
    for (const obj of boardObjects) {
      if (!obj.interactable) continue;
      const dx = Math.abs(obj.x - player.x);
      const dy = Math.abs(obj.y - player.y);
      if (dx <= 1 && dy <= 1 && (dx + dy) > 0) return obj;
    }
    return null;
  }, [interactive, isExplorationBoard, entities, boardObjects]);

  // Standing on exit detection
  const standingOnExit = useMemo(() => {
    if (!interactive || !isExplorationBoard) return null;
    const player = entities.find((e) => e.id === '__player__');
    if (!player) return null;
    return boardExits.find((ex) => ex.x === player.x && ex.y === player.y) || null;
  }, [interactive, isExplorationBoard, entities, boardExits]);

  // Exit tile interaction via E/Enter
  useEffect(() => {
    if (!interactive || !standingOnExit || !onPortalEnter) return;
    const handleKey = (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
      if (ev.key !== 'Enter' && ev.key !== 'e' && ev.key !== 'E') return;
      ev.preventDefault();
      onPortalEnter({
        destinationName: standingOnExit.targetLocationName,
        destinationRef: standingOnExit.targetLocationRef || null,
        direction: standingOnExit.direction,
      });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [interactive, standingOnExit, onPortalEnter]);

  // Object interaction via F key
  useEffect(() => {
    if (!interactive || !adjacentObject || !onObjectInteract) return;
    const handleKey = (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
      if (ev.key !== 'f' && ev.key !== 'F') return;
      ev.preventDefault();
      onObjectInteract(adjacentObject);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [interactive, adjacentObject, onObjectInteract]);

  // Camera follow player
  useEffect(() => {
    if (!needsViewport) return;
    const player = entities.find((e) => e.id === '__player__');
    if (!player) return;
    const cellSize = getFieldCellSize(containerSize.w, containerSize.h, gridW, gridH);
    const totalW = gridW * cellSize + 20;
    const totalH = gridH * cellSize + 20;
    const targetX = Math.max(0, Math.min(totalW - containerSize.w, player.x * cellSize - containerSize.w / 2 + cellSize / 2));
    const targetY = Math.max(0, Math.min(totalH - containerSize.h, player.y * cellSize - containerSize.h / 2 + cellSize / 2));
    setCameraOffset({ x: targetX, y: targetY });
  }, [entities, needsViewport, containerSize, gridW, gridH]);

  // Reveal initial fog around spawn (once per location, after entities are placed).
  const initialFogDoneRef = useRef(false);
  useEffect(() => {
    initialFogDoneRef.current = false;
  }, [locationKey]);
  useEffect(() => {
    if (initialFogDoneRef.current) return;
    const player = entities.find((e) => e.id === '__player__');
    if (!player) return;
    initialFogDoneRef.current = true;
    revealFog(player.x, player.y);
  }, [entities, revealFog]);

  // Responsive sizing
  useEffect(() => {
    const el = sizerRef.current;
    if (!el) return;
    const ar = ASPECT_RATIO;
    const handleResize = ([entry]) => {
      const { width: pw, height: ph } = entry.contentRect;
      if (pw <= 0 || ph <= 0) return;
      let w, h;
      if (needsViewport) {
        w = Math.floor(pw);
        h = Math.floor(ph);
      } else if (pw / ph > ar) {
        h = Math.floor(ph);
        w = Math.floor(h * ar);
      } else {
        w = Math.floor(pw);
        h = Math.floor(w / ar);
      }
      setContainerSize({ w, h });
      animRef.current.particles = initFieldParticles(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    handleResize([{ contentRect: el.getBoundingClientRect() }]);
    return () => ro.disconnect();
  }, [ASPECT_RATIO, needsViewport]);

  // Effective render dimensions for viewport
  const renderW = needsViewport ? containerSize.w : containerSize.w;
  const renderH = needsViewport ? containerSize.h : containerSize.h;
  const cellSize = useMemo(
    () => getFieldCellSize(containerSize.w, containerSize.h, gridW, gridH),
    [containerSize.w, containerSize.h, gridW, gridH],
  );

  const tokenPositions = useMemo(() => {
    const positions = computeFieldTokenPositions(entities, containerSize.w, containerSize.h, gridW, gridH);
    if (needsViewport) {
      return positions.map((p) => ({
        ...p,
        x: p.x - cameraOffset.x,
        y: p.y - cameraOffset.y,
      }));
    }
    return positions;
  }, [entities, containerSize.w, containerSize.h, gridW, gridH, needsViewport, cameraOffset]);

  // Canvas draw loop — tiles + fog
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

    if (needsViewport) {
      ctx.save();
      ctx.translate(-cameraOffset.x, -cameraOffset.y);
    }

    drawFieldGrid(ctx, w, h, gridW, gridH, tiles);

    // Atlas layer on top of the colored tile grid (v2 boards only). The
    // colored grid stays under as a fallback when the atlas is incomplete —
    // any unpainted cells show their logical tile color underneath.
    if (isV2Board && atlasImage) {
      drawAtlasLayer({ ctx, board: locationBoard, atlasImage, canvasW: w, canvasH: h });
    }

    // Draw fog-of-war overlay
    if (isExplorationBoard) {
      const cell = getFieldCellSize(w, h, gridW, gridH);
      const origin = {
        x: (w - gridW * cell) / 2,
        y: (h - gridH * cell) / 2,
      };
      for (let col = 0; col < gridW; col++) {
        for (let row = 0; row < gridH; row++) {
          const key = `${col}:${row}`;
          if (!visitedCellsRef.current.has(key)) {
            ctx.fillStyle = `rgba(5, 5, 8, ${FOG_ALPHA})`;
            ctx.fillRect(origin.x + col * cell, origin.y + row * cell, cell, cell);
          }
        }
      }
    }

    if (needsViewport) ctx.restore();
  }, [containerSize, tiles, gridW, gridH, needsViewport, cameraOffset, isExplorationBoard, isV2Board, atlasImage, locationBoard]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // Compute object/exit pixel positions adjusted for viewport
  const objectPositions = useMemo(() => {
    return boardObjects.map((obj) => {
      const px = fieldCellToPixel(obj.x, obj.y, containerSize.w, containerSize.h, gridW, gridH);
      return {
        obj,
        x: needsViewport ? px.x - cameraOffset.x : px.x,
        y: needsViewport ? px.y - cameraOffset.y : px.y,
      };
    });
  }, [boardObjects, containerSize.w, containerSize.h, gridW, gridH, needsViewport, cameraOffset]);

  const exitPositions = useMemo(() => {
    return boardExits.map((ex) => {
      const px = fieldCellToPixel(ex.x, ex.y, containerSize.w, containerSize.h, gridW, gridH);
      return {
        exit: ex,
        x: needsViewport ? px.x - cameraOffset.x : px.x,
        y: needsViewport ? px.y - cameraOffset.y : px.y,
      };
    });
  }, [boardExits, containerSize.w, containerSize.h, gridW, gridH, needsViewport, cameraOffset]);

  const portalPositions = useMemo(() => {
    return portals.map((p) => {
      const px = fieldCellToPixel(p.x, p.y, containerSize.w, containerSize.h, gridW, gridH);
      return {
        portal: p,
        x: needsViewport ? px.x - cameraOffset.x : px.x,
        y: needsViewport ? px.y - cameraOffset.y : px.y,
      };
    });
  }, [portals, containerSize.w, containerSize.h, gridW, gridH, needsViewport, cameraOffset]);

  // Minimap for large boards
  const minimapCanvas = useRef(null);
  useEffect(() => {
    if (!needsViewport || !minimapCanvas.current || !tiles) return;
    const canvas = minimapCanvas.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_SIZE * dpr;
    canvas.height = MINIMAP_SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cw = MINIMAP_SIZE / gridW;
    const ch = MINIMAP_SIZE / gridH;

    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    for (let col = 0; col < gridW; col++) {
      for (let row = 0; row < gridH; row++) {
        const tileId = tiles[col]?.[row];
        if (!tileId) continue;
        const passable = isTilePassable(tileId);
        ctx.fillStyle = passable ? '#2a3a28' : '#3a3a40';
        if (isPortalTile(tileId)) ctx.fillStyle = '#3a8a9a';
        ctx.fillRect(col * cw, row * ch, cw, ch);
      }
    }

    if (!suppressTokens) {
      const player = entities.find((e) => e.id === '__player__');
      if (player) {
        ctx.fillStyle = COLORS.playerRing;
        ctx.beginPath();
        ctx.arc((player.x + 0.5) * cw, (player.y + 0.5) * ch, Math.max(2, cw), 0, Math.PI * 2);
        ctx.fill();
      }

      for (const e of entities) {
        if (e.id === '__player__') continue;
        const c = e.type === 'enemy' ? COLORS.enemyRing : e.type === 'ally' ? COLORS.allyRing : COLORS.neutralRing;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc((e.x + 0.5) * cw, (e.y + 0.5) * ch, Math.max(1.5, cw * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Viewport rect
    const fullCell = getFieldCellSize(containerSize.w, containerSize.h, gridW, gridH);
    const totalPxW = gridW * fullCell + 20;
    const totalPxH = gridH * fullCell + 20;
    const vx = (cameraOffset.x / totalPxW) * MINIMAP_SIZE;
    const vy = (cameraOffset.y / totalPxH) * MINIMAP_SIZE;
    const vw = (containerSize.w / totalPxW) * MINIMAP_SIZE;
    const vh = (containerSize.h / totalPxH) * MINIMAP_SIZE;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);
  }, [needsViewport, tiles, gridW, gridH, entities, containerSize, cameraOffset, isExplorationBoard, suppressTokens]);

  return (
    <div ref={sizerRef} className="w-full h-full flex items-center justify-center">
      <div
        ref={containerRef}
        className="relative rounded-md overflow-hidden border border-outline-variant/20"
        style={{ width: containerSize.w, height: containerSize.h, cursor: interactive ? 'pointer' : 'default' }}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
      >
        <canvas ref={canvasRef} className="w-full h-full absolute inset-0" style={{ display: 'block' }} />

        {suppressTokens && (
          <div className="absolute inset-0 bg-black/40 pointer-events-none z-[5]" aria-hidden="true" />
        )}

        {!suppressTokens && (
        <div className="absolute inset-0 pointer-events-none">
          {tokenPositions.map((pos) => (
            <TokenOverlay
              key={pos.entity.id}
              entity={pos.entity}
              x={pos.x}
              y={pos.y}
              cellSize={cellSize}
              isPlayer={pos.entity.id === '__player__'}
              animation={entityAnims[pos.entity.id] || 'idle_down'}
            />
          ))}
        </div>
        )}

        {/* Objects overlay — emoji fallback. Objects with `visualAssetId` are
            drawn by the atlas layer (canvas) and skipped here to avoid double
            rendering. */}
        {isExplorationBoard && (
          <div className="absolute inset-0 pointer-events-none">
            {objectPositions.map((op) => {
              const key = `${op.obj.x}:${op.obj.y}`;
              if (isExplorationBoard && !visitedCellsRef.current.has(key)) return null;
              // Skip emoji if the object has a sprite in the loaded atlas.
              const hasAtlasSprite = isV2Board && atlasImage && resolveObjectSprite({
                board: locationBoard,
                atlasImage,
                visualAssetId: op.obj.visualAssetId,
              });
              if (hasAtlasSprite) return null;
              const icon = OBJECT_ICONS[op.obj.type] || '❓';
              return (
                <div
                  key={`obj-${key}`}
                  className="absolute flex flex-col items-center"
                  style={{ left: op.x, top: op.y, transform: 'translate(-50%, -50%)' }}
                >
                  <span
                    className="text-base drop-shadow-md"
                    style={{ fontSize: Math.max(12, cellSize * 0.5) }}
                    title={`${op.obj.name}${op.obj.state ? ` (${op.obj.state})` : ''}`}
                  >
                    {icon}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Exit markers overlay */}
        {isExplorationBoard && (
          <div className="absolute inset-0 pointer-events-none">
            {exitPositions.map((ep) => {
              const arrow = EXIT_ARROWS[ep.exit.direction] || '◈';
              return (
                <div
                  key={`exit-${ep.exit.x}:${ep.exit.y}`}
                  className="absolute flex flex-col items-center"
                  style={{ left: ep.x, top: ep.y, transform: 'translate(-50%, -120%)' }}
                >
                  <span className="text-[10px] font-label text-emerald-300 bg-surface-container/70 px-1.5 py-0.5 rounded-sm border border-emerald-400/30 backdrop-blur-sm whitespace-nowrap">
                    {arrow} {ep.exit.label || ep.exit.targetLocationName}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Legacy portal labels (non-exploration-board) */}
        {!isExplorationBoard && (
          <div className="absolute inset-0 pointer-events-none">
            {portalPositions.map((pp) => (
              <div
                key={`portal-${pp.portal.x}:${pp.portal.y}`}
                className="absolute flex flex-col items-center"
                style={{ left: pp.x, top: pp.y, transform: 'translate(-50%, -120%)' }}
              >
                <span className="text-[9px] font-label text-cyan-300 bg-surface-container/70 px-1.5 py-0.5 rounded-sm border border-cyan-400/30 backdrop-blur-sm whitespace-nowrap">
                  {pp.portal.destinationName}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Visual generation banner — v2 boards only, while worker runs */}
        {isV2Board && visualStatus === 'pending' && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-surface-container/80 border border-primary/20 backdrop-blur-sm animate-pulse">
            <span className="material-symbols-outlined text-primary text-xs">auto_awesome</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-primary-dim">
              {t('gameplay.fieldMapGenerating', 'Generowanie mapy…')}
            </span>
          </div>
        )}

        {/* Location label */}
        {world?.currentLocation && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-surface-container/80 border border-outline-variant/20 backdrop-blur-sm">
            <span className="material-symbols-outlined text-primary text-sm">explore</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              {world.currentLocation}
            </span>
          </div>
        )}

        {/* Object interaction prompt */}
        {interactive && adjacentObject && (
          <div className="absolute top-2 right-2 z-20 animate-pulse">
            <span className="text-[10px] font-bold text-amber-200 bg-surface-container/80 px-2 py-0.5 rounded-sm border border-amber-400/40 backdrop-blur-sm whitespace-nowrap">
              [F] {adjacentObject.name}{adjacentObject.state ? ` (${adjacentObject.state})` : ''}
            </span>
          </div>
        )}

        {/* NPC interaction prompt */}
        {interactive && adjacentNpc && !adjacentObject && (
          (() => {
            const npcPx = fieldCellToPixel(adjacentNpc.x, adjacentNpc.y, containerSize.w, containerSize.h, gridW, gridH);
            const npcX = needsViewport ? npcPx.x - cameraOffset.x : npcPx.x;
            const npcY = needsViewport ? npcPx.y - cameraOffset.y : npcPx.y;
            return (
              <div
                className="absolute z-20 pointer-events-none animate-pulse"
                style={{ left: npcX, top: npcY, transform: 'translate(-50%, -180%)' }}
              >
                <span className="text-[10px] font-bold text-amber-300 bg-surface-container/80 px-2 py-0.5 rounded-sm border border-amber-400/40 backdrop-blur-sm whitespace-nowrap">
                  [E] {t('gameplay.fieldMapInteractNpc', 'Rozmawiaj')}
                </span>
              </div>
            );
          })()
        )}

        {/* Exit prompt (exploration board exits) */}
        {interactive && standingOnExit && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-pulse">
            <span className="text-[10px] font-bold text-emerald-300 bg-surface-container/80 px-2 py-0.5 rounded-sm border border-emerald-400/40 backdrop-blur-sm whitespace-nowrap">
              [E] {t('gameplay.fieldMapEnterPortal', 'Podróżuj do')} {standingOnExit.label || standingOnExit.targetLocationName}
            </span>
          </div>
        )}

        {/* Legacy portal prompt */}
        {interactive && standingOnPortal && !standingOnExit && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-pulse">
            <span className="text-[10px] font-bold text-cyan-300 bg-surface-container/80 px-2 py-0.5 rounded-sm border border-cyan-400/40 backdrop-blur-sm whitespace-nowrap">
              [E] {t('gameplay.fieldMapEnterPortal', 'Podróżuj do')} {standingOnPortal.destinationName}
            </span>
          </div>
        )}

        {/* Movement hint */}
        {interactive && (
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/10 backdrop-blur-sm">
            <span className="material-symbols-outlined text-xs text-outline-variant">keyboard</span>
            <span className="text-[9px] text-outline-variant">
              {t('gameplay.fieldMapMoveHint', 'WASD / Arrows / Click to move')}
            </span>
          </div>
        )}

        {/* Minimap for large boards */}
        {needsViewport && (
          <div
            className="absolute bottom-2 right-2 z-10 rounded-sm border border-outline-variant/30 bg-surface-container/70 backdrop-blur-sm overflow-hidden"
            style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
          >
            <canvas ref={minimapCanvas} style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }} />
          </div>
        )}
      </div>
    </div>
  );
}
