import { useMemo } from 'react';

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

export default function SceneGridMap({ sceneGrid, world, characterName }) {
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

    const hasPlayer = out.some((e) => e.type === 'player');
    if (!hasPlayer && characterName) {
      placeEntity({ name: characterName, type: 'player' }, `player:${characterName}`);
    }

    const npcsHere = (world?.npcs || []).filter((npc) => {
      if (!npc?.name || npc.alive === false) return false;
      return npc.lastLocation?.toLowerCase() === world?.currentLocation?.toLowerCase();
    });

    for (const npc of npcsHere) {
      if (out.some((e) => e.name?.toLowerCase() === npc.name.toLowerCase())) continue;
      placeEntity({ name: npc.name, type: 'npc' }, `npc:${npc.name}`);
    }

    return out;
  }, [sceneGrid?.entities, tiles, width, height, characterName, world]);

  const entitiesByCell = useMemo(() => {
    const map = new Map();
    for (const entity of entities) {
      const key = `${entity.x}:${entity.y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entity);
    }
    return map;
  }, [entities]);

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
          const tooltip = cellEntities.length
            ? cellEntities.map((e) => `${e.name} (${entityTypeLabel(e.type || 'npc')})`).join(', ')
            : `${tileLabel(tile)} [${tile}]`;
          return (
            <div
              key={key}
              title={tooltip}
              className={`aspect-square rounded-[3px] border text-[10px] font-bold relative flex items-center justify-center ${tileClass(tile)}`}
            >
              {!topEntity && <span className="text-outline/70">{tile}</span>}
              {topEntity && (
                <span className={`px-1 rounded border leading-none ${entityColor(topEntity)}`}>
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
            <span key={`${entity.name}:${entity.x}:${entity.y}`} className={`text-[10px] px-2 py-1 rounded border ${entityColor(entity)}`}>
              {entity.display} {entity.name} ({entityTypeLabel(entity.type || 'npc')}) [{entity.x},{entity.y}]
            </span>
          ))}
          {entities.length === 0 && (
            <span className="text-[10px] text-outline">No entities placed yet.</span>
          )}
        </div>
      </div>
    </div>
  );
}
