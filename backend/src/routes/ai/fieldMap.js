import { prisma } from '../../lib/prisma.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { callAIJson, parseJsonOrNull } from '../../services/aiJsonCall.js';
import { generateFieldTiles, resolveBiomeFromText, ALL_TILE_IDS } from '../../../../shared/domain/generateFieldTiles.js';
import { TILE_TYPES, isTilePassable } from '../../../../shared/domain/battlefieldTiles.js';
import { FIELD_MAP_SCHEMA } from './schemas.js';

const GRID_W = 28;
const GRID_H = 16;
const TILE_ID_SET = new Set(ALL_TILE_IDS);

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

function buildTilePalette() {
  const groups = { ground: [], obstacle: [], wall: [], cover: [], special: [] };
  for (const t of Object.values(TILE_TYPES)) {
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

function buildAIPrompt(scene, locationName, npcsHere, biome) {
  const npcNames = npcsHere.map(n => n.name).filter(Boolean).join(', ') || 'none';
  const narrativeSnippet = (scene.narrative || '').substring(0, 500);

  return [
    `Location: ${locationName || 'unknown'}`,
    `Biome: ${biome}`,
    `Scene: ${narrativeSnippet}`,
    `NPCs present: ${npcNames}`,
    ``,
    `Grid: ${GRID_W} columns × ${GRID_H} rows (col-major: tiles[col][row])`,
    ``,
    `Tile palette (use ONLY these IDs):`,
    TILE_PALETTE_TEXT,
    ``,
    `Entities to place: __player__${npcsHere.map(n => `, npc_${n.name}`).join('')}`,
    `Place them logically based on the narrative (e.g. player at door, NPC behind counter).`,
    ``,
    `Return JSON: { "tiles": string[][] (${GRID_W} columns, each ${GRID_H} rows), "entities": [{ "id": string, "x": number, "y": number }] }`,
  ].join('\n');
}

const SYSTEM_PROMPT = `You are a top-down RPG map designer. Given a scene description, produce a ${GRID_W}×${GRID_H} tile grid and character positions. Use ONLY tile IDs from the provided palette. Make the layout match the narrative — walls for interiors, trees/rocks for outdoors, furniture for taverns. Place characters where they would logically be in the scene. Respond with ONLY valid JSON.`;

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
      const npcsHere = (world.npcs || []).filter(n => n.alive !== false).slice(0, 12);
      const biome = resolveBiomeFromText(locationName, scene.narrative, scene.imagePrompt);

      let result;
      try {
        const userApiKeys = await loadUserApiKeys(prisma, userId);
        const { text } = await callAIJson({
          modelTier: 'nano',
          taskType: 'field-map-gen',
          taskLabel: 'Field map tile generation',
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildAIPrompt(scene, locationName, npcsHere, biome),
          maxTokens: 4000,
          temperature: 0.4,
          userApiKeys,
          userId,
        });

        const parsed = parseJsonOrNull(text);
        if (parsed?.tiles && Array.isArray(parsed.tiles) && parsed.tiles.length === GRID_W) {
          const sanitized = parsed.tiles.map(col =>
            (Array.isArray(col) ? col : []).slice(0, GRID_H).map(sanitizeTileId),
          );
          // Pad short columns
          for (const col of sanitized) {
            while (col.length < GRID_H) col.push('grass');
          }
          const entities = validateEntities(parsed.entities, sanitized, GRID_W, GRID_H)
            || defaultEntities(npcsHere, GRID_W, GRID_H);

          result = { tiles: sanitized, width: GRID_W, height: GRID_H, biome, entities };
        } else {
          throw new Error('Invalid AI tile response shape');
        }
      } catch (err) {
        request.log.warn({ err: err.message }, 'Field map AI fallback to procedural');
        const tiles = generateFieldTiles(biome, GRID_W, GRID_H, scene.id);
        result = {
          tiles,
          width: GRID_W,
          height: GRID_H,
          biome,
          entities: defaultEntities(npcsHere, GRID_W, GRID_H),
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
