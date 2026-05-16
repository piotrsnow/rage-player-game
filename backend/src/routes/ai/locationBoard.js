import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { callAIJson, parseJsonOrNull } from '../../services/aiJsonCall.js';
import {
  generateFieldTiles,
  resolveBiomeFromText,
  ALL_TILE_IDS,
} from '../../../../shared/domain/generateFieldTiles.js';
import { TILE_TYPES, isTilePassable } from '../../../../shared/domain/battlefieldTiles.js';
import {
  gridSizeForLocationType,
  OBJECT_TYPES,
  ExplorationBoardSchema,
} from '../../../../shared/domain/explorationBoard.js';
import { lookupLocationByKindId } from '../../services/locationRefs.js';

const TILE_ID_SET = new Set(ALL_TILE_IDS);
const MOVEMENT_CATEGORIES = new Set(['movement', 'access', 'structural']);

async function loadLocationRow(ref) {
  if (!ref?.kind || !ref?.id) return null;
  return lookupLocationByKindId({
    prisma,
    kind: ref.kind,
    id: ref.id,
    select: {
      id: true,
      name: true,
      canonicalName: true,
      displayName: true,
      description: true,
      locationType: true,
      scale: true,
      atmosphere: true,
      dangerLevel: true,
      tacticalGrid: true,
      biome: true,
      tags: true,
    },
  }).catch(() => null);
}

async function loadNeighborNames(campaignId, ref) {
  if (!ref?.kind || !ref?.id) return [];
  const edges = await prisma.locationEdge.findMany({
    where: {
      isActive: true,
      OR: [
        { fromKind: ref.kind, fromId: ref.id },
        { toKind: ref.kind, toId: ref.id, bidirectional: true },
      ],
    },
    select: { fromKind: true, fromId: true, toKind: true, toId: true, category: true, edgeType: true },
  });

  const neighborRefs = [];
  for (const e of edges) {
    if (!MOVEMENT_CATEGORIES.has(e.category)) continue;
    const isFrom = e.fromKind === ref.kind && e.fromId === ref.id;
    neighborRefs.push({
      kind: isFrom ? e.toKind : e.fromKind,
      id: isFrom ? e.toId : e.fromId,
      edgeType: e.edgeType,
    });
  }
  if (neighborRefs.length === 0) return [];

  const worldIds = neighborRefs.filter((r) => r.kind === 'world').map((r) => r.id);
  const campIds = neighborRefs.filter((r) => r.kind === 'campaign').map((r) => r.id);

  const [worldLocs, campLocs] = await Promise.all([
    worldIds.length > 0
      ? prisma.worldLocation.findMany({ where: { id: { in: worldIds } }, select: { id: true, canonicalName: true, displayName: true, name: true } })
      : [],
    campIds.length > 0
      ? prisma.campaignLocation.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true } })
      : [],
  ]);

  const nameMap = new Map();
  for (const loc of worldLocs) nameMap.set(`world:${loc.id}`, loc.canonicalName || loc.displayName || loc.name);
  for (const loc of campLocs) nameMap.set(`campaign:${loc.id}`, loc.name);

  return neighborRefs
    .map((r) => ({
      name: nameMap.get(`${r.kind}:${r.id}`) || null,
      ref: { kind: r.kind, id: r.id },
      edgeType: r.edgeType,
    }))
    .filter((n) => n.name)
    .slice(0, 6);
}

async function loadNpcsAtLocation(campaignId, ref) {
  if (!ref?.kind || !ref?.id) return [];
  const npcs = await prisma.campaignNPC.findMany({
    where: {
      campaignId,
      lastLocationKind: ref.kind,
      lastLocationId: ref.id,
      alive: true,
    },
    select: { name: true, role: true },
    take: 12,
  });
  return npcs;
}

function sanitizeTileId(id) {
  return TILE_ID_SET.has(id) ? id : 'grass';
}

function buildTilePalette() {
  const groups = { ground: [], obstacle: [], wall: [], cover: [], special: [] };
  for (const t of Object.values(TILE_TYPES)) {
    if (t.portal) continue;
    if (t.passable && !t.destructible && !t.directionalCover) {
      if (['campfire', 'altar', 'well', 'door', 'stairs'].includes(t.id)) groups.special.push(t.id);
      else groups.ground.push(t.id);
    } else if (t.directionalCover) groups.cover.push(t.id);
    else if (t.destructible) groups.obstacle.push(t.id);
    else groups.wall.push(t.id);
  }
  return Object.entries(groups)
    .map(([k, ids]) => `${k}: ${ids.join(', ')}`)
    .join('\n');
}

const TILE_PALETTE_TEXT = buildTilePalette();

function buildLocationPrompt(loc, neighbors, npcsHere, gridW, gridH) {
  const locName = loc.canonicalName || loc.displayName || loc.name || 'unknown';
  const locType = loc.locationType || 'place';
  const desc = (loc.description || '').substring(0, 400);
  const atmosphere = loc.atmosphere || '';
  const dangerLevel = loc.dangerLevel || 'safe';
  const npcNames = npcsHere.map((n) => n.name).filter(Boolean).join(', ') || 'none';
  const exitsList = neighbors.map((n) => `${n.name} (${n.edgeType || 'path'})`).join(', ') || 'none';

  return [
    `Location: ${locName}`,
    `Type: ${locType}`,
    `Description: ${desc}`,
    `Atmosphere: ${atmosphere}`,
    `Danger level: ${dangerLevel}`,
    `NPCs present: ${npcNames}`,
    `Connected locations (exits): ${exitsList}`,
    ``,
    `Grid: ${gridW} columns × ${gridH} rows (col-major: tiles[col][row])`,
    ``,
    `Tile palette (use ONLY these IDs):`,
    TILE_PALETTE_TEXT,
    ``,
    `Interactive object types you may place: ${OBJECT_TYPES.join(', ')}`,
    ``,
    `Instructions:`,
    `- Design the tile grid to match the location type and atmosphere`,
    `- Place 2-6 interactive objects that make sense for this location (chests, altars, signs, etc.)`,
    `- Place exits on the grid edges leading to connected locations`,
    `- Choose a spawn point on a passable tile near the center or entrance`,
    `- Place entity positions for NPCs present`,
    ``,
    `Return JSON:`,
    `{`,
    `  "tiles": string[][] (${gridW} cols, each ${gridH} rows),`,
    `  "objects": [{ "x": int, "y": int, "type": string, "name": string, "description": string, "interactable": bool, "passable": bool, "state": string|null }],`,
    `  "exits": [{ "x": int, "y": int, "targetLocationName": string, "direction": "N"|"S"|"E"|"W"|"up"|"down", "label": string }],`,
    `  "entities": [{ "id": string, "x": int, "y": int }],`,
    `  "spawnPoint": { "x": int, "y": int }`,
    `}`,
  ].join('\n');
}

function buildSystemPromptForLocation(gridW, gridH) {
  return `You are a top-down RPG map designer. Given a location description, produce a ${gridW}×${gridH} tile grid with interactive objects, exits, entity positions, and a spawn point. Use ONLY tile IDs from the provided palette. Make the layout match the location — walls for interiors, trees/rocks for outdoors, furniture for buildings. Place exits on grid edges matching connected locations. Respond with ONLY valid JSON.`;
}

function validateEntities(entities, tiles, gridW, gridH) {
  if (!Array.isArray(entities)) return [];
  const occupied = new Set();
  return entities.map((e) => {
    let x = Math.max(0, Math.min(gridW - 1, Math.round(e.x ?? 0)));
    let y = Math.max(0, Math.min(gridH - 1, Math.round(e.y ?? 0)));
    if (!isTilePassable(tiles[x]?.[y])) {
      for (let r = 1; r < 5; r++) {
        let found = false;
        for (const [dx, dy] of [[0, -r], [r, 0], [0, r], [-r, 0]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && isTilePassable(tiles[nx]?.[ny])) {
            x = nx; y = ny; found = true; break;
          }
        }
        if (found) break;
      }
    }
    const key = `${x}:${y}`;
    if (occupied.has(key)) {
      for (let r = 1; r < Math.max(gridW, gridH); r++) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const nx = x + dx * r, ny = y + dy * r;
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && isTilePassable(tiles[nx]?.[ny])) {
            const nk = `${nx}:${ny}`;
            if (!occupied.has(nk)) { x = nx; y = ny; break; }
          }
        }
        if (!occupied.has(`${x}:${y}`)) break;
      }
    }
    occupied.add(`${x}:${y}`);
    return { id: String(e.id || '__unknown__'), x, y };
  });
}

function validateSpawnPoint(sp, tiles, gridW, gridH) {
  let x = Math.max(0, Math.min(gridW - 1, Math.round(sp?.x ?? Math.floor(gridW / 2))));
  let y = Math.max(0, Math.min(gridH - 1, Math.round(sp?.y ?? Math.floor(gridH / 2))));
  if (!isTilePassable(tiles[x]?.[y])) {
    for (let r = 1; r < Math.max(gridW, gridH); r++) {
      let found = false;
      for (const [dx, dy] of [[0, -r], [r, 0], [0, r], [-r, 0], [1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && isTilePassable(tiles[nx]?.[ny])) {
          x = nx; y = ny; found = true; break;
        }
      }
      if (found) break;
    }
  }
  return { x, y };
}

function validateObjects(objects, gridW, gridH) {
  if (!Array.isArray(objects)) return [];
  return objects
    .filter((o) => o && typeof o.x === 'number' && typeof o.y === 'number' && o.type && o.name)
    .map((o) => ({
      x: Math.max(0, Math.min(gridW - 1, Math.round(o.x))),
      y: Math.max(0, Math.min(gridH - 1, Math.round(o.y))),
      type: String(o.type).slice(0, 40),
      name: String(o.name).slice(0, 120),
      description: o.description ? String(o.description).slice(0, 300) : undefined,
      interactable: o.interactable !== false,
      passable: o.passable !== false,
      state: o.state ? String(o.state).slice(0, 20) : undefined,
    }))
    .slice(0, 20);
}

function validateExits(exits, neighbors, gridW, gridH) {
  if (!Array.isArray(exits)) return [];
  return exits
    .filter((e) => e && typeof e.x === 'number' && typeof e.y === 'number' && e.targetLocationName)
    .map((e) => {
      const match = neighbors.find(
        (n) => n.name.toLowerCase() === String(e.targetLocationName).toLowerCase(),
      );
      return {
        x: Math.max(0, Math.min(gridW - 1, Math.round(e.x))),
        y: Math.max(0, Math.min(gridH - 1, Math.round(e.y))),
        targetLocationName: String(e.targetLocationName).slice(0, 200),
        targetLocationRef: match?.ref || undefined,
        direction: e.direction ? String(e.direction).slice(0, 10) : undefined,
        label: e.label ? String(e.label).slice(0, 120) : undefined,
      };
    })
    .slice(0, 8);
}

function buildProceduralBoard(loc, neighbors, npcsHere, gridW, gridH) {
  const biome = loc.biome || resolveBiomeFromText(
    loc.canonicalName || loc.name || '',
    loc.description || '',
    '',
  );
  const neighborData = neighbors.map((n) => ({ name: n.name, ref: n.ref }));
  const generated = generateFieldTiles(biome, gridW, gridH, loc.id || 'fallback', { neighbors: neighborData });

  const exits = generated.portals.map((p) => ({
    x: p.x,
    y: p.y,
    targetLocationName: p.destinationName,
    targetLocationRef: p.destinationRef || undefined,
    direction: p.y === 0 ? 'N' : p.y === gridH - 1 ? 'S' : p.x === 0 ? 'W' : 'E',
  }));

  const cx = Math.floor(gridW / 2);
  const cy = Math.floor(gridH / 2);
  const entities = [{ id: '__player__', x: cx, y: cy }];
  for (let i = 0; i < npcsHere.length; i++) {
    const angle = (i / Math.max(1, npcsHere.length)) * Math.PI * 2;
    const dist = 3;
    entities.push({
      id: `npc_${npcsHere[i].name || i}`,
      x: Math.max(1, Math.min(gridW - 2, cx + Math.round(Math.cos(angle) * dist))),
      y: Math.max(1, Math.min(gridH - 2, cy + Math.round(Math.sin(angle) * dist))),
    });
  }

  return {
    version: 1,
    width: gridW,
    height: gridH,
    tiles: generated.tiles,
    objects: [],
    exits,
    entities,
    spawnPoint: { x: cx, y: cy },
    theme: biome,
    generatedAt: new Date().toISOString(),
  };
}

const LOCATION_BOARD_PARAM_SCHEMA = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
  },
  required: ['campaignId'],
};

export async function locationBoardRoutes(fastify) {
  fastify.post(
    '/campaigns/:campaignId/location-board',
    { schema: { params: LOCATION_BOARD_PARAM_SCHEMA } },
    async (request, reply) => {
      const { campaignId } = request.params;
      const userId = request.user?.id;

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          userId: true,
          currentLocationKind: true,
          currentLocationId: true,
          currentLocationName: true,
          coreState: true,
        },
      });

      if (!campaign || campaign.userId !== userId) {
        return reply.code(403).send({ error: 'Not authorized' });
      }

      const ref = campaign.currentLocationKind && campaign.currentLocationId
        ? { kind: campaign.currentLocationKind, id: campaign.currentLocationId }
        : null;

      if (!ref) {
        return reply.code(404).send({ error: 'No current location' });
      }

      const loc = await loadLocationRow(ref);
      if (!loc) {
        return reply.code(404).send({ error: 'Location not found' });
      }

      if (loc.tacticalGrid?.version === 1) {
        return loc.tacticalGrid;
      }

      const [neighbors, npcsHere] = await Promise.all([
        loadNeighborNames(campaignId, ref),
        loadNpcsAtLocation(campaignId, ref),
      ]);

      const locType = loc.locationType || '';
      const { w: gridW, h: gridH } = gridSizeForLocationType(locType);

      let board;
      try {
        const userApiKeys = await loadUserApiKeys(prisma, userId);
        const { text } = await callAIJson({
          modelTier: 'nano',
          taskType: 'location-board-gen',
          taskLabel: 'Location board generation',
          systemPrompt: buildSystemPromptForLocation(gridW, gridH),
          userPrompt: buildLocationPrompt(loc, neighbors, npcsHere, gridW, gridH),
          maxTokens: 6000,
          temperature: 0.4,
          userApiKeys,
          userId,
        });

        const parsed = parseJsonOrNull(text);
        if (parsed?.tiles && Array.isArray(parsed.tiles) && parsed.tiles.length === gridW) {
          const sanitized = parsed.tiles.map((col) =>
            (Array.isArray(col) ? col : []).slice(0, gridH).map(sanitizeTileId),
          );
          for (const col of sanitized) {
            while (col.length < gridH) col.push('grass');
          }

          const objects = validateObjects(parsed.objects, gridW, gridH);
          const exits = validateExits(parsed.exits || [], neighbors, gridW, gridH);
          const entities = validateEntities(parsed.entities, sanitized, gridW, gridH);
          const spawnPoint = validateSpawnPoint(parsed.spawnPoint, sanitized, gridW, gridH);

          const biome = loc.biome || resolveBiomeFromText(
            loc.canonicalName || loc.name || '',
            loc.description || '',
            '',
          );

          board = {
            version: 1,
            width: gridW,
            height: gridH,
            tiles: sanitized,
            objects,
            exits,
            entities,
            spawnPoint,
            theme: biome,
            generatedAt: new Date().toISOString(),
          };
        } else {
          throw new Error('Invalid AI board response shape');
        }
      } catch (err) {
        request.log.warn({ err: err.message }, 'Location board AI fallback to procedural');
        board = buildProceduralBoard(loc, neighbors, npcsHere, gridW, gridH);
      }

      const updateTable = ref.kind === 'world' ? 'worldLocation' : 'campaignLocation';
      await prisma[updateTable].update({
        where: { id: ref.id },
        data: { tacticalGrid: board },
      });

      return board;
    },
  );
}
