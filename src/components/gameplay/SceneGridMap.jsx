import { useCallback, useEffect, useMemo, useState } from 'react';

const PASSABLE_TILE_TYPES = new Set(['P', 'F', 'D', 'E', 'I', 'N', '.']);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashToIndex(seed, max) {
  if (!seed || max <= 0) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % max;
}

function buildFallbackGrid(width, height) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      y === 0 || x === 0 || y === height - 1 || x === width - 1 ? 'W' : 'F'
    )
  );
}

function normalizeTiles(sceneGrid) {
  const width = clamp(Number(sceneGrid?.width) || 12, 6, 24);
  const height = clamp(Number(sceneGrid?.height) || 12, 6, 24);
  const fallback = buildFallbackGrid(width, height);
  const rawTiles = Array.isArray(sceneGrid?.tiles) ? sceneGrid.tiles : [];

  if (!rawTiles.length) return { width, height, tiles: fallback };

  const normalized = Array.from({ length: height }, (_, y) => {
    const row = Array.isArray(rawTiles[y]) ? rawTiles[y] : [];
    return Array.from({ length: width }, (_, x) => {
      const value = row[x];
      if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase().slice(0, 1);
      return fallback[y][x];
    });
  });

  return { width, height, tiles: normalized };
}

function collectPassableCells(tiles, width, height) {
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (PASSABLE_TILE_TYPES.has(tiles[y]?.[x])) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function entityDisplay(entity) {
  if (entity.marker) return entity.marker.slice(0, 1).toUpperCase();
  if (entity.type === 'player') return '@';
  if (entity.type === 'enemy') return '!';
  if (entity.type === 'ally') return '+';
  return (entity.name || '?').slice(0, 1).toUpperCase();
}

function entityColor(entity) {
  if (entity.type === 'player') return 'text-primary border-primary/40 bg-primary/20';
  if (entity.type === 'enemy') return 'text-error border-error/40 bg-error/20';
  if (entity.type === 'ally') return 'text-tertiary border-tertiary/40 bg-tertiary/20';
  return 'text-on-surface border-outline-variant/40 bg-surface-container-high/80';
}

function tileLabel(tile) {
  switch (tile) {
    case 'W': return 'Wall';
    case 'D': return 'Door';
    case 'E': return 'Elevated terrain';
    case 'I': return 'Hazard / interaction';
    case 'P': return 'Path / floor';
    case 'F': return 'Floor';
    case 'N': return 'Narrow pass';
    case '.': return 'Open area';
    default: return 'Unknown tile';
  }
}

function entityTypeLabel(type) {
  switch (type) {
    case 'player': return 'Player';
    case 'enemy': return 'Enemy';
    case 'ally': return 'Ally';
    case 'npc': return 'NPC';
    default: return 'Character';
  }
}

function entityKey(entity, index) {
  if (entity.id) return `id:${entity.id}`;
  if (entity.name) return `name:${String(entity.name).toLowerCase()}`;
  return `idx:${index}`;
}

function normalizeMultiplayerPlayers(multiplayerPlayers) {
  if (!Array.isArray(multiplayerPlayers)) return [];
  return multiplayerPlayers
    .map((player) => {
      if (!player) return null;
      if (typeof player === 'string') {
        const name = player.trim();
        return name ? { name } : null;
      }
      if (typeof player.name === 'string' && player.name.trim()) {
        return {
          id: player.odId || player.id || null,
          name: player.name.trim(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function isPassable(tiles, width, height, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return PASSABLE_TILE_TYPES.has(tiles[y]?.[x]);
}

function isOccupied(entities, x, y, exceptKey = null) {
  return entities.some((entity, idx) => {
    if (exceptKey && entityKey(entity, idx) === exceptKey) return false;
    return entity.x === x && entity.y === y;
  });
}

export default function SceneGridMap({
  sceneGrid,
  world,
  characterName,
  multiplayerPlayers = [],
  interactive = false,
  controlledEntityName = null,
  onSceneGridChange = null,
}) {
  const { width, height, tiles } = useMemo(() => normalizeTiles(sceneGrid), [sceneGrid]);

  const entities = useMemo(() => {
    const passableCells = collectPassableCells(tiles, width, height);
    const used = new Set();
    const out = [];
    const rawEntities = Array.isArray(sceneGrid?.entities) ? sceneGrid.entities : [];

    const placeEntity = (baseEntity, seedHint) => {
      const entity = { ...baseEntity };
      const hasPos = Number.isInteger(entity.x) && Number.isInteger(entity.y)
        && entity.x >= 0 && entity.y >= 0 && entity.x < width && entity.y < height;

      let pos = null;
      if (hasPos && PASSABLE_TILE_TYPES.has(tiles[entity.y]?.[entity.x])) {
        pos = { x: entity.x, y: entity.y };
      } else if (passableCells.length > 0) {
        const offset = hashToIndex(seedHint || entity.name || 'entity', passableCells.length);
        for (let i = 0; i < passableCells.length; i++) {
          const candidate = passableCells[(offset + i) % passableCells.length];
          const key = `${candidate.x}:${candidate.y}`;
          if (!used.has(key)) {
            pos = candidate;
            break;
          }
        }
      }

      if (!pos) return;
      const key = `${pos.x}:${pos.y}`;
      used.add(key);
      out.push({
        ...entity,
        x: pos.x,
        y: pos.y,
        display: entityDisplay(entity),
      });
    };

    for (const entity of rawEntities) {
      if (!entity || !entity.name) continue;
      placeEntity(entity, `entity:${entity.name}`);
    }

    const normalizedMp = normalizeMultiplayerPlayers(multiplayerPlayers);
    const playerNames = new Set();
    for (const player of normalizedMp) {
      playerNames.add(player.name.toLowerCase());
      if (!out.some((e) => e.name?.toLowerCase() === player.name.toLowerCase())) {
        placeEntity(
          { id: player.id || null, name: player.name, type: 'player' },
          `player:${player.id || player.name}`
        );
      }
    }

    const hasNamedControlledPlayer = controlledEntityName
      && out.some((e) => e.name?.toLowerCase() === controlledEntityName.toLowerCase());
    if (!hasNamedControlledPlayer && controlledEntityName) {
      placeEntity({ name: controlledEntityName, type: 'player' }, `player:${controlledEntityName}`);
      playerNames.add(controlledEntityName.toLowerCase());
    }

    const hasPlayer = out.some((e) => e.type === 'player');
    if (!hasPlayer && characterName) {
      placeEntity({ name: characterName, type: 'player' }, `player:${characterName}`);
      playerNames.add(characterName.toLowerCase());
    }

    const npcsHere = (world?.npcs || []).filter((npc) => {
      if (!npc?.name || npc.alive === false) return false;
      return npc.lastLocation?.toLowerCase() === world?.currentLocation?.toLowerCase();
    });

    for (const npc of npcsHere) {
      if (out.some((e) => e.name?.toLowerCase() === npc.name.toLowerCase())) continue;
      placeEntity({ name: npc.name, type: 'npc' }, `npc:${npc.name}`);
    }

    return out.map((entity, idx) => ({
      ...entity,
      key: entityKey(entity, idx),
    }));
  }, [sceneGrid?.entities, tiles, width, height, characterName, world, multiplayerPlayers, controlledEntityName]);

  const controlledName = (controlledEntityName || characterName || '').toLowerCase();
  const defaultSelectedKey = useMemo(() => {
    if (!entities.length) return null;
    const exact = controlledName
      ? entities.find((entity) => entity.name?.toLowerCase() === controlledName)
      : null;
    if (exact) return exact.key;
    const firstPlayer = entities.find((entity) => entity.type === 'player');
    return firstPlayer?.key || entities[0].key;
  }, [entities, controlledName]);

  const [selectedEntityKey, setSelectedEntityKey] = useState(defaultSelectedKey);
  const [movedEntityKey, setMovedEntityKey] = useState(null);

  useEffect(() => {
    setSelectedEntityKey(defaultSelectedKey);
  }, [defaultSelectedKey, sceneGrid?.width, sceneGrid?.height]);

  useEffect(() => {
    if (!movedEntityKey) return undefined;
    const timeoutId = window.setTimeout(() => setMovedEntityKey(null), 180);
    return () => window.clearTimeout(timeoutId);
  }, [movedEntityKey]);

  const entitiesByCell = useMemo(() => {
    const map = new Map();
    for (const entity of entities) {
      const key = `${entity.x}:${entity.y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entity);
    }
    return map;
  }, [entities]);

  const selectedEntity = useMemo(
    () => entities.find((entity) => entity.key === selectedEntityKey) || null,
    [entities, selectedEntityKey]
  );

  const canMoveSelected = Boolean(interactive && selectedEntity && onSceneGridChange);

  const persistEntities = useCallback((nextEntities) => {
    if (!onSceneGridChange) return;
    const serializedEntities = nextEntities.map((entity) => {
      const {
        key, display, ...rest
      } = entity;
      return rest;
    });
    onSceneGridChange({
      ...(sceneGrid || {}),
      width,
      height,
      tiles,
      entities: serializedEntities,
    });
  }, [onSceneGridChange, sceneGrid, width, height, tiles]);

  const moveSelectedTo = useCallback((targetX, targetY) => {
    if (!canMoveSelected || !selectedEntity) return false;
    if (!isPassable(tiles, width, height, targetX, targetY)) return false;
    if (isOccupied(entities, targetX, targetY, selectedEntity.key)) return false;

    const nextEntities = entities.map((entity) =>
      entity.key === selectedEntity.key
        ? { ...entity, x: targetX, y: targetY }
        : entity
    );
    setMovedEntityKey(selectedEntity.key);
    persistEntities(nextEntities);
    return true;
  }, [canMoveSelected, selectedEntity, tiles, width, height, entities, persistEntities]);

  const moveSelectedBy = useCallback((dx, dy) => {
    if (!selectedEntity) return false;
    return moveSelectedTo(selectedEntity.x + dx, selectedEntity.y + dy);
  }, [selectedEntity, moveSelectedTo]);

  const handleGridKeyDown = useCallback((event) => {
    if (!canMoveSelected) return;
    const key = event.key.toLowerCase();
    let consumed = false;
    if (key === 'arrowup' || key === 'w') consumed = moveSelectedBy(0, -1);
    if (key === 'arrowdown' || key === 's') consumed = moveSelectedBy(0, 1);
    if (key === 'arrowleft' || key === 'a') consumed = moveSelectedBy(-1, 0);
    if (key === 'arrowright' || key === 'd') consumed = moveSelectedBy(1, 0);
    if (consumed) event.preventDefault();
  }, [canMoveSelected, moveSelectedBy]);

  const tileClass = (tile) => {
    switch (tile) {
      case 'W': return 'bg-neutral-900/90 border-neutral-700/70';
      case 'D': return 'bg-amber-900/60 border-amber-700/70';
      case 'E': return 'bg-teal-900/55 border-teal-700/70';
      case 'I': return 'bg-violet-900/55 border-violet-700/70';
      case 'P': return 'bg-primary/30 border-primary/50';
      default: return 'bg-slate-800/70 border-slate-700/70';
    }
  };

  const tileLegend = [
    { code: 'W', label: tileLabel('W') },
    { code: 'P', label: tileLabel('P') },
    { code: 'F', label: tileLabel('F') },
    { code: 'D', label: tileLabel('D') },
    { code: 'E', label: tileLabel('E') },
    { code: 'I', label: tileLabel('I') },
  ];

  const tileMinPx = 23;
  const tileTrackPx = 38;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
      <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
        Tactical scene board
      </div>
      <div
        className="grid gap-1 p-3 rounded-md border border-outline-variant/20 bg-surface-container-high/70"
        tabIndex={interactive ? 0 : -1}
        onKeyDown={handleGridKeyDown}
        style={{
          gridTemplateColumns: `repeat(${width}, minmax(${tileMinPx}px, 1fr))`,
          width: `min(88vw, ${width * tileTrackPx}px)`,
          maxWidth: '100%',
        }}
      >
        {Array.from({ length: height * width }, (_, idx) => {
          const x = idx % width;
          const y = Math.floor(idx / width);
          const tile = tiles[y]?.[x] || 'F';
          const key = `${x}:${y}`;
          const cellEntities = entitiesByCell.get(key) || [];
          const topEntity = cellEntities[0];
          const isSelectedCell = selectedEntity?.x === x && selectedEntity?.y === y;
          const isBlocked = !PASSABLE_TILE_TYPES.has(tile);
          const tooltip = cellEntities.length
            ? cellEntities.map((e) => `${e.name} (${entityTypeLabel(e.type || 'npc')})`).join(', ')
            : `${tileLabel(tile)} [${tile}]`;
          return (
            <div
              key={key}
              title={tooltip}
              onClick={() => {
                if (topEntity) {
                  setSelectedEntityKey(topEntity.key);
                  return;
                }
                if (!canMoveSelected || !selectedEntity) return;
                const distance = Math.abs(selectedEntity.x - x) + Math.abs(selectedEntity.y - y);
                if (distance !== 1) return;
                moveSelectedTo(x, y);
              }}
              className={`aspect-square rounded-[3px] border text-[10px] font-bold relative flex items-center justify-center ${
                tileClass(tile)
              } ${
                canMoveSelected ? 'cursor-pointer' : ''
              } ${
                isSelectedCell ? 'ring-1 ring-primary/60' : ''
              } ${
                isBlocked ? 'opacity-90' : ''
              }`}
            >
              {!topEntity && <span className="text-outline/70">{tile}</span>}
              {topEntity && (
                <span className={`px-1 rounded border leading-none transition-transform duration-150 ${
                  topEntity.key === movedEntityKey ? 'scale-110' : 'scale-100'
                } ${
                  selectedEntityKey === topEntity.key ? 'ring-1 ring-white/50' : ''
                } ${entityColor(topEntity)}`}>
                  {topEntity.display}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="w-full max-w-[720px] rounded-md border border-outline-variant/15 bg-surface-container/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-widest text-outline mb-1">Tile legend</div>
        <div className="flex flex-wrap gap-1.5">
          {tileLegend.map((tile) => (
            <span key={tile.code} className={`text-[10px] px-2 py-1 rounded border inline-flex items-center gap-1.5 ${tileClass(tile.code)}`}>
              <span className="font-bold">{tile.code}</span>
              <span>{tile.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="w-full max-w-[720px] rounded-md border border-outline-variant/15 bg-surface-container/50 px-3 py-2">
        <div className="text-[10px] uppercase tracking-widest text-outline mb-1">Who is where</div>
        <div className="flex flex-wrap gap-1.5">
          {entities.map((entity) => (
            <span
              key={`${entity.key}:${entity.x}:${entity.y}`}
              onClick={() => setSelectedEntityKey(entity.key)}
              className={`text-[10px] px-2 py-1 rounded border cursor-pointer ${entityColor(entity)} ${
                selectedEntityKey === entity.key ? 'ring-1 ring-white/50' : ''
              }`}
            >
              {entity.display} {entity.name} ({entityTypeLabel(entity.type || 'npc')}) [{entity.x},{entity.y}]
            </span>
          ))}
          {entities.length === 0 && (
            <span className="text-[10px] text-outline">No entities placed yet.</span>
          )}
        </div>
      </div>
      {interactive && (
        <div className="w-full max-w-[720px] rounded-md border border-outline-variant/15 bg-surface-container/50 px-3 py-2 text-[10px] text-on-surface-variant">
          Use click or WASD / arrows to move selected token. Movement is blocked by walls and occupied cells.
        </div>
      )}
    </div>
  );
}
