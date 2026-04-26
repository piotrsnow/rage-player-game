import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import {
  SCENE_CLIENT_SELECT,
  buildDistinctSceneCountMap,
  dedupeScenesByIndexAsc,
  extractTotalCost,
  stripNormalizedFromCoreState,
} from '../../services/campaignSerialize.js';
import {
  withRetry,
  fetchCampaignCharacters,
  reconstructFromNormalized,
  syncNPCsToNormalized,
  syncKnowledgeToNormalized,
  syncQuestsToNormalized,
  getCampaignCharacterIds,
  getCharacterIdsForCampaigns,
} from '../../services/campaignSync.js';
import { seedInitialWorld } from '../../services/livingWorld/worldSeeder.js';
import { getOrCloneCampaignNpc } from '../../services/livingWorld/campaignSandbox.js';
import { markLocationDiscovered } from '../../services/livingWorld/userDiscoveryService.js';
import { resolveLocationByName } from '../../services/livingWorld/worldStateService.js';
import { LOCATION_KIND_WORLD } from '../../services/locationRefs.js';
import { CAMPAIGN_WRITE_SCHEMA } from './schemas.js';

const log = childLogger({ module: 'campaigns' });

export async function crudCampaignRoutes(app) {
  app.get('/', async (request) => {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: request.user.id },
      select: {
        id: true, name: true, genre: true, tone: true,
        totalCost: true, lastSaved: true, createdAt: true,
      },
      orderBy: { lastSaved: 'desc' },
    });

    const campaignIds = campaigns.map((c) => c.id);
    const [sceneCounts, charIdsByCampaign] = await Promise.all([
      prisma.campaignScene.groupBy({
        by: ['campaignId', 'sceneIndex'],
        where: { campaignId: { in: campaignIds } },
      }),
      getCharacterIdsForCampaigns(campaignIds),
    ]);
    const sceneCountMap = buildDistinctSceneCountMap(sceneCounts);

    const allFirstIds = [...new Set(
      [...charIdsByCampaign.values()]
        .map((ids) => ids[0])
        .filter(Boolean),
    )];
    const firstChars = allFirstIds.length > 0
      ? await prisma.character.findMany({
          where: { id: { in: allFirstIds } },
          select: { id: true, name: true, species: true, characterLevel: true },
        })
      : [];
    const charById = new Map(firstChars.map((c) => [c.id, c]));

    return campaigns.map((c) => {
      const characterIds = charIdsByCampaign.get(c.id) || [];
      const firstChar = characterIds[0] ? charById.get(characterIds[0]) : null;
      return {
        id: c.id,
        name: c.name,
        genre: c.genre,
        tone: c.tone,
        lastSaved: c.lastSaved,
        createdAt: c.createdAt,
        characterIds,
        characterName: firstChar?.name || '',
        characterSpecies: firstChar?.species || '',
        characterLevel: firstChar?.characterLevel || 1,
        sceneCount: sceneCountMap[c.id] || 0,
        totalCost: c.totalCost || 0,
      };
    });
  });

  app.get('/:id', async (request, reply) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

    const coreState = campaign.coreState || {};
    await reconstructFromNormalized(campaign.id, coreState, {
      currentLocationName: campaign.currentLocationName || null,
    });

    const characterIds = await getCampaignCharacterIds(campaign.id);
    const [scenes, characters] = await Promise.all([
      prisma.campaignScene.findMany({
        where: { campaignId: campaign.id },
        orderBy: { sceneIndex: 'asc' },
        select: SCENE_CLIENT_SELECT,
      }),
      fetchCampaignCharacters(characterIds),
    ]);
    const dedupedScenes = dedupeScenesByIndexAsc(scenes);

    return {
      ...campaign,
      coreState,
      characterIds,
      scenes: dedupedScenes,
      characters,
    };
  });

  app.post('/', {
    schema: { body: CAMPAIGN_WRITE_SCHEMA },
    config: { idempotency: true },
  }, async (request, reply) => {
    const {
      name,
      genre,
      tone,
      coreState: rawCoreState,
      characterIds: rawCharIds,
      livingWorldEnabled,
      worldTimeRatio,
      worldTimeMaxGapDays,
      difficultyTier,
    } = request.body;
    const parsed = typeof rawCoreState === 'object' ? rawCoreState : JSON.parse(rawCoreState || '{}');

    const { slim, npcs, knowledgeEvents, knowledgeDecisions, quests, currentLocationName } =
      stripNormalizedFromCoreState(parsed);

    const characterIds = Array.isArray(rawCharIds) ? rawCharIds.filter((id) => typeof id === 'string' && id) : [];
    if (characterIds.length > 0) {
      const owned = await prisma.character.findMany({
        where: { id: { in: characterIds }, userId: request.user.id },
        select: { id: true, characterLevel: true },
      });
      const ownedSet = new Set(owned.map((c) => c.id));
      for (const id of characterIds) {
        if (!ownedSet.has(id)) {
          return reply.code(403).send({ error: `Character ${id} not found or not owned by user` });
        }
      }

      // G1 — validate difficultyTier against the primary character's level.
      if (typeof difficultyTier === 'string') {
        const maxLevel = owned.reduce((acc, c) => Math.max(acc, Number(c.characterLevel) || 1), 1);
        const allowed = maxLevel <= 5 ? ['low']
          : maxLevel <= 10 ? ['low', 'medium', 'high']
          : ['low', 'medium', 'high', 'deadly'];
        if (!allowed.includes(difficultyTier)) {
          return reply.code(400).send({
            error: `difficultyTier "${difficultyTier}" not allowed at character level ${maxLevel} (allowed: ${allowed.join(', ')})`,
          });
        }
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId: request.user.id,
        name: name || '',
        genre: genre || '',
        tone: tone || '',
        coreState: slim,
        totalCost: extractTotalCost(slim),
        lastSaved: new Date(),
        shareToken: crypto.randomUUID(),
        // F5 — currentLocationName lifted from coreState.world.currentLocation
        currentLocationName: currentLocationName || null,
        ...(livingWorldEnabled === true ? { livingWorldEnabled: true } : {}),
        ...(typeof worldTimeRatio === 'number' ? { worldTimeRatio } : {}),
        ...(Number.isInteger(worldTimeMaxGapDays) ? { worldTimeMaxGapDays } : {}),
        ...(typeof difficultyTier === 'string' ? { difficultyTier } : {}),
        ...(characterIds.length > 0
          ? {
              participants: {
                create: characterIds.map((characterId) => ({ characterId, role: 'player' })),
              },
            }
          : {}),
      },
    });

    // Phase A — per-campaign world seeding.
    // F5b — currentLocation lives in 3 columns: name (flavor) + kind + id
    // (polymorphic FK). The seeder returns all three when it picks a starting
    // settlement, so the write covers both the human name and the polymorphic
    // pointer in a single update.
    let seededStartingLocation = null;
    if (livingWorldEnabled === true) {
      try {
        const campaignLength = typeof parsed?.campaign?.length === 'string' ? parsed.campaign.length : 'Medium';
        const seedResult = await seedInitialWorld(campaign.id, {
          length: campaignLength,
          difficultyTier: typeof difficultyTier === 'string' ? difficultyTier : 'low',
        });
        seededStartingLocation = seedResult.startingLocationName;
        if (seededStartingLocation) {
          if (!slim.world) slim.world = {};
          slim.world.currentLocation = seededStartingLocation;
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              currentLocationName: seededStartingLocation,
              currentLocationKind: seedResult.startingLocationKind || null,
              currentLocationId: seedResult.startingLocationId || null,
            },
          }).catch((err) => log.warn({ err, campaignId: campaign.id }, 'Failed to persist seeded currentLocation'));
        }
      } catch (err) {
        log.error({ err: err?.message, campaignId: campaign.id }, 'seedInitialWorld failed');
      }
    }

    // Bind characters to this campaign. Lock is cleared on campaign delete
    // or when the character is released from a safe location in-game.
    if (characterIds.length > 0) {
      const initialLocation = seededStartingLocation
        || (typeof slim?.world?.currentLocation === 'string' ? slim.world.currentLocation : null);
      await prisma.character.updateMany({
        where: { id: { in: characterIds } },
        data: {
          lockedCampaignId: campaign.id,
          lockedCampaignName: campaign.name || '',
          lockedLocation: initialLocation,
        },
      }).catch((err) => log.error({ err, campaignId: campaign.id }, 'Failed to lock characters to campaign'));
    }

    // Round B (Phase 3) — start-spawn bind.
    // F5b — name override + polymorphic ref resolution. Sublocation names
    // can hit either canonical WorldLocation (e.g. capital sublocs from
    // seedWorld) or this campaign's CampaignLocation rows; resolveLocationByName
    // handles both. Null kind/id is fine (means we couldn't resolve), the name
    // still carries.
    const startSpawn = parsed?._startSpawn || null;
    if (startSpawn?.sublocationName) {
      if (!slim.world) slim.world = {};
      slim.world.currentLocation = startSpawn.sublocationName;
      const resolved = await resolveLocationByName(startSpawn.sublocationName, { campaignId: campaign.id }).catch(() => null);
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          currentLocationName: startSpawn.sublocationName,
          currentLocationKind: resolved?.kind || null,
          currentLocationId: resolved?.row?.id || null,
        },
      }).catch((err) => log.warn({ err, campaignId: campaign.id }, 'Failed to override currentLocation for startSpawn'));
    }
    if (startSpawn?.npcName && Array.isArray(quests?.active)) {
      for (const q of quests.active) {
        if (q && typeof q.questGiverId === 'string'
          && q.questGiverId.trim().toLowerCase() === String(startSpawn.npcName).toLowerCase()) {
          q.forcedGiver = true;
          if (startSpawn.sublocationName) q.locationId = startSpawn.sublocationName;
        }
      }
    }

    await syncNPCsToNormalized(campaign.id, npcs).catch((err) => log.error({ err, campaignId: campaign.id }, 'NPC sync wrapper failed'));
    await syncKnowledgeToNormalized(campaign.id, knowledgeEvents, knowledgeDecisions).catch((err) => log.error({ err, campaignId: campaign.id }, 'Knowledge sync wrapper failed'));
    await syncQuestsToNormalized(campaign.id, quests).catch((err) => log.error({ err, campaignId: campaign.id }, 'Quest sync wrapper failed'));

    if (startSpawn?.npcCanonicalId) {
      try {
        const canonical = await prisma.worldNPC.findUnique({
          where: { canonicalId: startSpawn.npcCanonicalId },
          select: { id: true, currentLocationId: true },
        });
        if (canonical) {
          await getOrCloneCampaignNpc(campaign.id, canonical.id);
          if (canonical.currentLocationId) {
            await markLocationDiscovered({
              userId: request.user.id,
              locationKind: LOCATION_KIND_WORLD,
              locationId: canonical.currentLocationId,
              campaignId: campaign.id,
            });
          }
        }
      } catch (err) {
        log.warn({ err: err?.message, campaignId: campaign.id }, 'startSpawn post-sync wiring failed');
      }
    }

    const fullState = { ...slim };
    if (npcs.length > 0) { if (!fullState.world) fullState.world = {}; fullState.world.npcs = npcs; }
    if (quests.active?.length || quests.completed?.length) fullState.quests = quests;

    // F5 — re-inject currentLocation (input or seeded/startSpawn override) so
    // the response carries the FE-shape `world.currentLocation`.
    const responseCurrentLoc = (slim.world && slim.world.currentLocation)
      || currentLocationName
      || null;
    if (responseCurrentLoc) {
      if (!fullState.world) fullState.world = {};
      fullState.world.currentLocation = responseCurrentLoc;
    }

    const characters = await fetchCampaignCharacters(characterIds);
    return { ...campaign, coreState: fullState, characterIds, scenes: [], characters };
  });

  app.put('/:id', { schema: { body: CAMPAIGN_WRITE_SCHEMA } }, async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    const { name, genre, tone, coreState: rawCoreState, characterIds: rawCharIds } = request.body;

    const updateData = { lastSaved: new Date() };

    if (name !== undefined) updateData.name = name;
    if (genre !== undefined) updateData.genre = genre;
    if (tone !== undefined) updateData.tone = tone;

    let participantsUpdate = null;
    if (Array.isArray(rawCharIds)) {
      const ids = rawCharIds.filter((id) => typeof id === 'string' && id);
      if (ids.length > 0) {
        const owned = await prisma.character.findMany({
          where: { id: { in: ids }, userId: request.user.id },
          select: { id: true },
        });
        const ownedSet = new Set(owned.map((c) => c.id));
        for (const id of ids) {
          if (!ownedSet.has(id)) {
            return reply.code(400).send({ error: `Character ${id} not found or not owned by user` });
          }
        }
      }
      participantsUpdate = ids;
    }

    let pendingSync = null;

    if (rawCoreState !== undefined) {
      const parsed = typeof rawCoreState === 'object' ? rawCoreState : JSON.parse(rawCoreState || '{}');
      const { slim, npcs, knowledgeEvents, knowledgeDecisions, quests, currentLocationName } =
        stripNormalizedFromCoreState(parsed);

      updateData.coreState = slim;
      updateData.totalCost = extractTotalCost(slim);
      // F5 — currentLocationName lifted to its own column. Always set
      // (including null) so a save that clears the field reaches the column.
      updateData.currentLocationName = currentLocationName || null;
      // F5b — invalidate the polymorphic kind+id pair when the name changes
      // so a stale ref doesn't outlive its display name. Writers that know
      // the new ref (seed, startSpawn, AI top-level entry) re-set the pair
      // explicitly; auto-save just clears + relies on name lookups downstream.
      if (currentLocationName !== existing.currentLocationName) {
        updateData.currentLocationKind = null;
        updateData.currentLocationId = null;
      }

      pendingSync = { campaignId: request.params.id, npcs, knowledgeEvents, knowledgeDecisions, quests };
    }

    // One tx so a partial save can't leave campaign.name out of sync with
    // each Character.lockedCampaignName, or the participants set out of sync
    // with the campaign row.
    const txOps = [
      prisma.campaign.update({
        where: { id: request.params.id },
        data: updateData,
      }),
    ];
    if (name !== undefined && name !== existing.name) {
      txOps.push(prisma.character.updateMany({
        where: { lockedCampaignId: request.params.id },
        data: { lockedCampaignName: name || '' },
      }));
    }
    if (participantsUpdate !== null) {
      txOps.push(prisma.campaignParticipant.deleteMany({ where: { campaignId: request.params.id } }));
      if (participantsUpdate.length > 0) {
        txOps.push(prisma.campaignParticipant.createMany({
          data: participantsUpdate.map((characterId) => ({
            campaignId: request.params.id,
            characterId,
            role: 'player',
          })),
        }));
      }
    }
    const [campaign] = await withRetry(() => prisma.$transaction(txOps));

    if (pendingSync) {
      const { campaignId, npcs, knowledgeEvents, knowledgeDecisions, quests } = pendingSync;
      await syncNPCsToNormalized(campaignId, npcs).catch((err) => log.error({ err, campaignId }, 'NPC sync wrapper failed'));
      await syncKnowledgeToNormalized(campaignId, knowledgeEvents, knowledgeDecisions).catch((err) => log.error({ err, campaignId }, 'Knowledge sync wrapper failed'));
      await syncQuestsToNormalized(campaignId, quests).catch((err) => log.error({ err, campaignId }, 'Quest sync wrapper failed'));
    }

    const characterIds = await getCampaignCharacterIds(request.params.id);
    // F5 — synthesize coreState.world.currentLocation back into the response
    // so the FE re-merge sees the same shape it sent (the client may rely on
    // round-trip equality for some sync paths).
    const responseCore = campaign.coreState || {};
    if (campaign.currentLocationName) {
      if (!responseCore.world) responseCore.world = {};
      if (!responseCore.world.currentLocation) responseCore.world.currentLocation = campaign.currentLocationName;
    }
    return { ...campaign, characterIds, coreState: responseCore };
  });

  app.delete('/:id', async (request, reply) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: request.params.id, userId: request.user.id },
    });
    if (!existing) return reply.code(404).send({ error: 'Campaign not found' });

    // FK ON DELETE CASCADE drops Campaign* child rows in one shot; the
    // character unlock is bundled into the same tx so a half-completed
    // delete can't leave characters bound to a non-existent campaign.
    await prisma.$transaction([
      prisma.character.updateMany({
        where: { lockedCampaignId: request.params.id },
        data: { lockedCampaignId: null, lockedCampaignName: null, lockedLocation: null },
      }),
      prisma.campaign.delete({ where: { id: request.params.id } }),
    ]);
    return { success: true };
  });
}
