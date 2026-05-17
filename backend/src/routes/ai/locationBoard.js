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
  ASSET_LAYERS,
} from '../../../../shared/domain/explorationBoard.js';
import { lookupLocationByKindId } from '../../services/locationRefs.js';
import { enqueuePostLocationBoardVisuals } from '../../services/cloudTasks.js';
import { config } from '../../config.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'locationBoardRoute' });

const TILE_ID_SET = new Set(ALL_TILE_IDS);
const MOVEMENT_CATEGORIES = new Set(['movement', 'access', 'structural']);

const DEFAULT_BASE_TILE_PX = 64;
const MAX_ASSETS_PER_BOARD = 40;

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
      ? prisma.location.findMany({ where: { id: { in: worldIds } }, select: { id: true, canonicalName: true, displayName: true, name: true } })
      : [],
    campIds.length > 0
      ? prisma.location.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true } })
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
  const npcs = await prisma.npc.findMany({
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
    `Tile palette (use ONLY these IDs in tiles[][] for gameplay logic):`,
    TILE_PALETTE_TEXT,
    ``,
    `Interactive object types you may place: ${OBJECT_TYPES.join(', ')}`,
    ``,
    `VISUAL MANIFEST (NEW — required):`,
    `- Pick a short EN \`styleAnchor\` describing the art direction (e.g. "warm cozy pixel art, top-down RPG, soft palette, 16-bit JRPG feel, NO TEXT"). Apply it implicitly to every asset prompt.`,
    `- List up to ${MAX_ASSETS_PER_BOARD} unique visual \`assets\`. Deduplicate aggressively — every patch of the same ground uses ONE assetId with many \`visualPlacements\`. A house roof / large rock / wagon is a \`stamp\` with footprint > 1.`,
    `- Each asset prompt is ENGLISH, top-down view, pixel-art, NO LETTERS/SIGNS visible in the image. Concrete: "weathered wooden plank floor, top-down, pixel art, warm wood tones, seamless tileable".`,
    `- Stamps (footprint w>1 OR h>1) describe a single coherent object (e.g. 2×2 cottage = "stone cottage with thatched roof, top-down chimney view, pixel art, dark wood door").`,
    `- \`visualPlacements\` maps assets onto the grid by anchor (top-left cell for stamps). Layers: ground (under everything), overlay (e.g. grass tufts), object (chests, furniture).`,
    `- \`objects[].visualAssetId\` may reference a stamp/tile assetId so the renderer draws a sprite instead of an emoji (optional).`,
    ``,
    `Return JSON:`,
    `{`,
    `  "tiles": string[][] (${gridW} cols, each ${gridH} rows, logical tile IDs only),`,
    `  "objects": [{ "x": int, "y": int, "type": string, "name": string, "description": string, "interactable": bool, "passable": bool, "state": string|null, "visualAssetId": string|null }],`,
    `  "exits": [{ "x": int, "y": int, "targetLocationName": string, "direction": "N"|"S"|"E"|"W"|"up"|"down", "label": string }],`,
    `  "entities": [{ "id": string, "x": int, "y": int }],`,
    `  "spawnPoint": { "x": int, "y": int },`,
    `  "styleAnchor": string,`,
    `  "assets": [{ "id": string, "kind": "tile"|"stamp", "footprint": { "w": int, "h": int }, "prompt": string, "layer": "ground"|"overlay"|"object", "passable": bool|null }],`,
    `  "visualPlacements": [{ "assetId": string, "anchor": { "x": int, "y": int }, "layer": "ground"|"overlay"|"object" }]`,
    `}`,
  ].join('\n');
}

function buildSystemPromptForLocation(gridW, gridH) {
  return [
    `You are a top-down RPG map + art director. For a given location you produce TWO layers in a single JSON response:`,
    `1) LOGIC layer (tiles, objects, exits, entities, spawn) — game-mechanical, uses canonical tile IDs.`,
    `2) VISUAL layer (styleAnchor + deduplicated assets + visualPlacements) — describes how the location should LOOK as pixel-art sprites, with concrete EN prompts a text-to-image model can render.`,
    ``,
    `Grid is ${gridW}×${gridH}. Place exits on grid edges matching connected locations. Cover the entire grid with ground asset placements (1×1) and add overlays/stamps where appropriate. NEVER request text/letters in any asset prompt. Respond with ONLY valid JSON.`,
  ].join('\n');
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

function validateObjects(objects, gridW, gridH, assetIdSet) {
  if (!Array.isArray(objects)) return [];
  return objects
    .filter((o) => o && typeof o.x === 'number' && typeof o.y === 'number' && o.type && o.name)
    .map((o) => {
      const out = {
        x: Math.max(0, Math.min(gridW - 1, Math.round(o.x))),
        y: Math.max(0, Math.min(gridH - 1, Math.round(o.y))),
        type: String(o.type).slice(0, 40),
        name: String(o.name).slice(0, 120),
        description: o.description ? String(o.description).slice(0, 300) : undefined,
        interactable: o.interactable !== false,
        passable: o.passable !== false,
        state: o.state ? String(o.state).slice(0, 20) : undefined,
      };
      if (o.visualAssetId && assetIdSet.has(String(o.visualAssetId))) {
        out.visualAssetId = String(o.visualAssetId).slice(0, 64);
      }
      return out;
    })
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

/**
 * Sanitize the visual manifest: dedupe asset IDs, clamp footprints, drop
 * placements with unknown assetIds / out-of-grid anchors. Returns
 * { assets, visualPlacements }.
 */
function validateVisualManifest(raw, gridW, gridH) {
  const assetsIn = Array.isArray(raw?.assets) ? raw.assets : [];
  const seen = new Map();
  for (const a of assetsIn.slice(0, MAX_ASSETS_PER_BOARD * 2)) {
    if (!a || typeof a !== 'object') continue;
    const id = String(a.id || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64);
    if (!id || seen.has(id)) continue;
    const kind = a.kind === 'stamp' ? 'stamp' : 'tile';
    const fw = Math.max(1, Math.min(8, Math.round(a.footprint?.w ?? 1)));
    const fh = Math.max(1, Math.min(8, Math.round(a.footprint?.h ?? 1)));
    const layer = ASSET_LAYERS.includes(a.layer) ? a.layer : (kind === 'stamp' ? 'object' : 'ground');
    const prompt = typeof a.prompt === 'string' ? a.prompt.trim().slice(0, 800) : '';
    if (prompt.length < 4) continue;
    seen.set(id, {
      id, kind, footprint: { w: fw, h: fh }, prompt, layer,
      ...(typeof a.passable === 'boolean' ? { passable: a.passable } : {}),
    });
  }
  const assets = Array.from(seen.values()).slice(0, MAX_ASSETS_PER_BOARD);
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const placementsIn = Array.isArray(raw?.visualPlacements) ? raw.visualPlacements : [];
  const placements = [];
  for (const p of placementsIn.slice(0, gridW * gridH * 4)) {
    if (!p || typeof p !== 'object') continue;
    const assetId = String(p.assetId || '').trim().toLowerCase().slice(0, 64);
    const a = assetMap.get(assetId);
    if (!a) continue;
    const ax = Math.round(p.anchor?.x ?? -1);
    const ay = Math.round(p.anchor?.y ?? -1);
    if (ax < 0 || ay < 0) continue;
    if (ax + a.footprint.w > gridW) continue;
    if (ay + a.footprint.h > gridH) continue;
    const layer = ASSET_LAYERS.includes(p.layer) ? p.layer : a.layer;
    placements.push({ assetId, anchor: { x: ax, y: ay }, layer });
  }
  return { assets, visualPlacements: placements };
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

function readDmSettings(coreState) {
  const dm = coreState?.dmSettings || {};
  const cfg = config.fieldMapVisuals || {};
  return {
    baseTilePx: Math.max(16, Math.min(256, Math.round(dm.fieldMapBaseTilePx ?? cfg.baseTilePx ?? DEFAULT_BASE_TILE_PX))),
    provider: (dm.fieldMapVisualProvider || cfg.provider) === 'stability' ? 'stability' : 'sd-webui',
  };
}

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

      // Cached board — return immediately. If it's v2 and still pending, also
      // re-enqueue the worker (idempotent if visualStatus === ready already).
      const existing = loc.tacticalGrid;
      if (existing?.version === 1) {
        return existing;
      }
      if (existing?.version === 2) {
        if (existing.visualStatus === 'pending' && Array.isArray(existing.assets) && existing.assets.length > 0) {
          enqueuePostLocationBoardVisuals({
            campaignId,
            userId: campaign.userId,
            locationKind: ref.kind,
            locationId: ref.id,
          }).catch((err) => log.warn({ err }, 'Re-enqueue location board visuals failed'));
        }
        return existing;
      }

      const [neighbors, npcsHere] = await Promise.all([
        loadNeighborNames(campaignId, ref),
        loadNpcsAtLocation(campaignId, ref),
      ]);

      const locType = loc.locationType || '';
      const { w: gridW, h: gridH } = gridSizeForLocationType(locType);
      const { baseTilePx } = readDmSettings(campaign.coreState);

      let board;
      try {
        const userApiKeys = await loadUserApiKeys(prisma, userId);
        // Standard tier — more JSON real estate than nano. Visual manifest
        // pushes the response past what nano reliably renders intact.
        const { text } = await callAIJson({
          modelTier: 'standard',
          taskType: 'location-board-gen',
          taskLabel: 'Location board generation',
          systemPrompt: buildSystemPromptForLocation(gridW, gridH),
          userPrompt: buildLocationPrompt(loc, neighbors, npcsHere, gridW, gridH),
          maxTokens: 12000,
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

          const { assets, visualPlacements } = validateVisualManifest(parsed, gridW, gridH);
          const assetIdSet = new Set(assets.map((a) => a.id));

          const objects = validateObjects(parsed.objects, gridW, gridH, assetIdSet);
          const exits = validateExits(parsed.exits || [], neighbors, gridW, gridH);
          const entities = validateEntities(parsed.entities, sanitized, gridW, gridH);
          const spawnPoint = validateSpawnPoint(parsed.spawnPoint, sanitized, gridW, gridH);

          const biome = loc.biome || resolveBiomeFromText(
            loc.canonicalName || loc.name || '',
            loc.description || '',
            '',
          );

          const styleAnchor = typeof parsed.styleAnchor === 'string'
            ? parsed.styleAnchor.trim().slice(0, 400)
            : '';

          if (assets.length > 0) {
            board = {
              version: 2,
              width: gridW,
              height: gridH,
              tiles: sanitized,
              objects,
              exits,
              entities,
              spawnPoint,
              theme: biome,
              generatedAt: new Date().toISOString(),
              baseTilePx,
              styleAnchor: styleAnchor || undefined,
              assets,
              visualPlacements,
              visualPack: null,
              visualStatus: 'pending',
            };
          } else {
            // LLM returned logic but no visual manifest — keep as v1.
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
          }
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

      // Fire the async visual worker only when the board carries a manifest.
      if (board.version === 2 && Array.isArray(board.assets) && board.assets.length > 0) {
        enqueuePostLocationBoardVisuals({
          campaignId,
          userId: campaign.userId,
          locationKind: ref.kind,
          locationId: ref.id,
        }).catch((err) => log.warn({ err }, 'Enqueue location board visuals failed'));
      }

      return board;
    },
  );
}
