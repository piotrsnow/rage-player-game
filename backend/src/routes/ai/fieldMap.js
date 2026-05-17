import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { callAIJson, parseJsonOrNull } from '../../services/aiJsonCall.js';
import { generateFieldTiles, resolveBiomeFromText, ALL_TILE_IDS } from '../../../../shared/domain/generateFieldTiles.js';
import { TILE_TYPES, isTilePassable } from '../../../../shared/domain/battlefieldTiles.js';
import { gridDimensionsForScale } from '../../../../shared/domain/fieldMapScale.js';
import { FIELD_MAP_SCHEMA } from './schemas.js';

const TILE_ID_SET = new Set(ALL_TILE_IDS);

const MOVEMENT_CATEGORIES = new Set(['movement', 'access', 'structural']);

async function loadNeighbors(campaignId, currentLocationRef) {
  if (!currentLocationRef?.kind || !currentLocationRef?.id) return [];

  const { kind, id } = currentLocationRef;
  const edges = await prisma.locationEdge.findMany({
    where: {
      isActive: true,
      OR: [
        { fromKind: kind, fromId: id },
        { toKind: kind, toId: id, bidirectional: true },
      ],
    },
    select: { fromKind: true, fromId: true, toKind: true, toId: true, category: true },
  });

  const neighborRefs = [];
  for (const e of edges) {
    if (!MOVEMENT_CATEGORIES.has(e.category)) continue;
    const isFrom = e.fromKind === kind && e.fromId === id;
    const nKind = isFrom ? e.toKind : e.fromKind;
    const nId = isFrom ? e.toId : e.fromId;
    neighborRefs.push({ kind: nKind, id: nId });
  }

  if (neighborRefs.length === 0) return [];

  const worldIds = neighborRefs.filter(r => r.kind === 'world').map(r => r.id);
  const campaignIds = neighborRefs.filter(r => r.kind === 'campaign').map(r => r.id);

  const [worldLocs, campaignLocs] = await Promise.all([
    worldIds.length > 0
      ? prisma.location.findMany({ where: { id: { in: worldIds } }, select: { id: true, canonicalName: true, displayName: true, name: true } })
      : [],
    campaignIds.length > 0
      ? prisma.location.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } })
      : [],
  ]);

  const nameMap = new Map();
  for (const loc of worldLocs) nameMap.set(`world:${loc.id}`, loc.canonicalName || loc.displayName || loc.name);
  for (const loc of campaignLocs) nameMap.set(`campaign:${loc.id}`, loc.name);

  return neighborRefs
    .map(r => ({ name: nameMap.get(`${r.kind}:${r.id}`) || null, ref: r }))
    .filter(n => n.name)
    .slice(0, 4);
}

const PORTAL_EDGE_SLOTS = [
  (w, h) => ({ x: Math.floor(w / 2), y: 0 }),
  (w, h) => ({ x: Math.floor(w / 2), y: h - 1 }),
  (w, h) => ({ x: 0, y: Math.floor(h / 2) }),
  (w, h) => ({ x: w - 1, y: Math.floor(h / 2) }),
];

function stampPortals(tiles, gridW, gridH, neighbors) {
  if (!neighbors || neighbors.length === 0) return [];
  const portals = [];
  const capped = neighbors.slice(0, PORTAL_EDGE_SLOTS.length);
  for (let i = 0; i < capped.length; i++) {
    const { x, y } = PORTAL_EDGE_SLOTS[i](gridW, gridH);
    tiles[x][y] = 'portal';
    portals.push({ x, y, destinationName: capped[i].name, destinationRef: capped[i].ref });
  }
  return portals;
}

function defaultEntities(npcsHere, gridW, gridH) {
  const entities = [];
  const cx = Math.floor(gridW / 2);
  const cy = Math.floor(gridH / 2);
  entities.push({ id: '__player__', x: cx, y: cy });

  for (let i = 0; i < npcsHere.length; i++) {
    const angle = (i / Math.max(1, npcsHere.length)) * Math.PI * 2;
    const dist = 3 + Math.floor(i / 4);
    const nx = Math.max(1, Math.min(gridW - 2, cx + Math.round(Math.cos(angle) * dist)));
    const ny = Math.max(1, Math.min(gridH - 2, cy + Math.round(Math.sin(angle) * dist)));
    entities.push({ id: `npc_${npcsHere[i].name || i}`, x: nx, y: ny });
  }
  return entities;
}

function sanitizeTileId(id) {
  if (TILE_ID_SET.has(id)) return id;
  return 'grass';
}

function validateEntities(entities, tiles, gridW, gridH) {
  if (!Array.isArray(entities)) return null;
  const occupied = new Set();
  return entities.map((e) => {
    let x = Math.max(0, Math.min(gridW - 1, Math.round(e.x ?? 0)));
    let y = Math.max(0, Math.min(gridH - 1, Math.round(e.y ?? 0)));

    // Nudge onto passable tile if needed
    if (!isTilePassable(tiles[x]?.[y])) {
      let found = false;
      for (let r = 1; r < 5 && !found; r++) {
        for (const [dx, dy] of [[0,-r],[r,0],[0,r],[-r,0]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && isTilePassable(tiles[nx]?.[ny])) {
            x = nx; y = ny; found = true; break;
          }
        }
      }
    }

    const key = `${x}:${y}`;
    if (occupied.has(key)) {
      for (let r = 1; r < Math.max(gridW, gridH); r++) {
        for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
          const nx = x + dx * r, ny = y + dy * r;
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && isTilePassable(tiles[nx]?.[ny])) {
            const nk = `${nx}:${ny}`;
            if (!occupied.has(nk)) { x = nx; y = ny; occupied.add(nk); break; }
          }
        }
        if (!occupied.has(`${x}:${y}`)) break;
      }
    }
    occupied.add(`${x}:${y}`);
    return { id: String(e.id || '__unknown__'), x, y };
  });
}

async function resolveLocationScale(ref) {
  if (!ref?.kind || !ref?.id) return 4;
  try {
    if (ref.kind === 'world') {
      const loc = await prisma.location.findUnique({ where: { id: ref.id }, select: { scale: true } });
      return loc?.scale ?? 4;
    }
    const loc = await prisma.location.findUnique({ where: { id: ref.id }, select: { scale: true } });
    return loc?.scale ?? 4;
  } catch { return 4; }
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

function buildAIPrompt(scene, locationName, npcsHere, biome, gridW, gridH) {
  const npcNames = npcsHere.map(n => n.name).filter(Boolean).join(', ') || 'none';
  const narrativeSnippet = (scene.narrative || '').substring(0, 500);

  return [
    `Location: ${locationName || 'unknown'}`,
    `Biome: ${biome}`,
    `Scene: ${narrativeSnippet}`,
    `NPCs present: ${npcNames}`,
    ``,
    `Grid: ${gridW} columns × ${gridH} rows (col-major: tiles[col][row])`,
    ``,
    `Tile palette (use ONLY these IDs):`,
    TILE_PALETTE_TEXT,
    ``,
    `Entities to place: __player__${npcsHere.map(n => `, npc_${n.name}`).join('')}`,
    `Place them logically based on the narrative (e.g. player at door, NPC behind counter).`,
    ``,
    `Return JSON: { "tiles": string[][] (${gridW} columns, each ${gridH} rows), "entities": [{ "id": string, "x": number, "y": number }] }`,
  ].join('\n');
}

function buildSystemPrompt(gridW, gridH) {
  return `You are a top-down RPG map designer. Given a scene description, produce a ${gridW}×${gridH} tile grid and character positions. Use ONLY tile IDs from the provided palette. Make the layout match the narrative — walls for interiors, trees/rocks for outdoors, furniture for taverns. Place characters where they would logically be in the scene. Respond with ONLY valid JSON.`;
}

export async function fieldMapRoutes(fastify) {
  fastify.post(
    '/campaigns/:campaignId/field-map/:sceneIndex',
    { schema: { params: FIELD_MAP_SCHEMA } },
    async (request, reply) => {
      const { campaignId, sceneIndex } = request.params;
      const userId = request.user?.id;

      const [scene, campaign] = await Promise.all([
        prisma.campaignScene.findUnique({
          where: { campaignId_sceneIndex: { campaignId, sceneIndex: Number(sceneIndex) } },
        }),
        prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { userId: true, coreState: true },
        }),
      ]);

      if (!campaign || campaign.userId !== userId) {
        return reply.code(403).send({ error: 'Not authorized' });
      }
      if (!scene) return reply.code(404).send({ error: 'Scene not found' });

      if (scene.fieldMapTiles) {
        return scene.fieldMapTiles;
      }
      const coreState = campaign?.coreState || {};
      const world = coreState.world || {};
      const locationName = world.currentLocation || '';
      const currentLocationRef = world.currentLocationRef || null;
      const npcsHere = (world.npcs || []).filter(n => n.alive !== false).slice(0, 12);
      const biome = resolveBiomeFromText(locationName, scene.narrative, scene.imagePrompt);

      const neighbors = await loadNeighbors(campaignId, currentLocationRef);

      const locationScale = await resolveLocationScale(currentLocationRef);
      const { w: gridW, h: gridH } = gridDimensionsForScale(locationScale);

      let result;
      try {
        const userApiKeys = await loadUserApiKeys(prisma, userId);
        const { text } = await callAIJson({
          modelTier: 'nano',
          taskType: 'field-map-gen',
          taskLabel: 'Field map tile generation',
          systemPrompt: buildSystemPrompt(gridW, gridH),
          userPrompt: buildAIPrompt(scene, locationName, npcsHere, biome, gridW, gridH),
          maxTokens: 4000,
          temperature: 0.4,
          userApiKeys,
          userId,
        });

        const parsed = parseJsonOrNull(text);
        if (parsed?.tiles && Array.isArray(parsed.tiles) && parsed.tiles.length === gridW) {
          const sanitized = parsed.tiles.map(col =>
            (Array.isArray(col) ? col : []).slice(0, gridH).map(sanitizeTileId),
          );
          for (const col of sanitized) {
            while (col.length < gridH) col.push('grass');
          }
          const entities = validateEntities(parsed.entities, sanitized, gridW, gridH)
            || defaultEntities(npcsHere, gridW, gridH);

          const portals = stampPortals(sanitized, gridW, gridH, neighbors);
          result = { tiles: sanitized, width: gridW, height: gridH, biome, entities, portals };
        } else {
          throw new Error('Invalid AI tile response shape');
        }
      } catch (err) {
        request.log.warn({ err: err.message }, 'Field map AI fallback to procedural');
        const generated = generateFieldTiles(biome, gridW, gridH, scene.id, { neighbors });
        result = {
          tiles: generated.tiles,
          portals: generated.portals,
          width: gridW,
          height: gridH,
          biome,
          entities: defaultEntities(npcsHere, gridW, gridH),
        };
      }

      await prisma.campaignScene.update({
        where: { id: scene.id },
        data: { fieldMapTiles: result },
      });

      return result;
    },
  );
}
