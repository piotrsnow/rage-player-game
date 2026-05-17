// Admin panel — point-in-time snapshots of a full campaign graph.
//
// `createSnapshot` dumps the Campaign row + every owned child row + all linked
// Characters into a single JSONB payload. Reference snapshots of WorldNPC /
// WorldLocation that the campaign points at are also captured (read-only —
// shared kanon, never restored back into them).
//
// `restoreSnapshot` runs in a transaction: deletes child rows owned by the
// campaign, recreates them from payload, restores linked Characters via
// `persistCharacterSnapshot`, then calls `reconstructFromNormalized` so the
// `coreState` JSONB stays in sync with the normalized tables.
//
// `withSnapshot` is the wrapper used by every mutating admin endpoint to
// auto-snapshot before applying changes (FIFO trim to MAX_AUTO_PER_CAMPAIGN
// non-pinned rows, oldest first).

import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import {
  loadCharacterSnapshotById,
  persistCharacterSnapshot,
  reconstructCharacterSnapshot,
} from './characterRelations.js';
import { reconstructFromNormalized } from './campaignSync.js';

const log = childLogger({ module: 'campaignSnapshot' });

const MAX_AUTO_PER_CAMPAIGN = 20;

// ── Capture ──

async function loadCampaignGraph(campaignId) {
  const [
    campaign,
    participants,
    npcs,
    quests,
    questPrerequisites,
    scenes,
    campaignLocations,
    locationSummaries,
    locationEdges,
    campaignEdges,
    knowledge,
    codex,
    incidents,
    discoveredLocations,
    edgeDiscoveries,
    dmAgent,
  ] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.campaignParticipant.findMany({ where: { campaignId } }),
    prisma.npc.findMany({
      where: { campaignId },
      include: { relationships: true, experiences: true },
    }),
    prisma.campaignQuest.findMany({
      where: { campaignId },
      include: { objectives: true, prerequisites: true },
    }),
    prisma.campaignQuestPrerequisite.findMany({
      where: { quest: { campaignId } },
    }),
    prisma.campaignScene.findMany({
      where: { campaignId },
      orderBy: { sceneIndex: 'asc' },
    }),
    prisma.location.findMany({ where: { campaignId } }),
    prisma.locationSummary.findMany({ where: { campaignId } }),
    prisma.locationEdge.findMany({ where: { campaignId } }),
    prisma.campaignEdge.findMany({ where: { campaignId } }),
    prisma.campaignKnowledge.findMany({ where: { campaignId } }),
    prisma.campaignCodex.findMany({ where: { campaignId } }),
    prisma.campaignIncident.findMany({ where: { campaignId } }),
    prisma.discoveredLocation.findMany({ where: { campaignId } }),
    prisma.campaignEdgeDiscovery.findMany({ where: { campaignId } }),
    prisma.campaignDmAgent.findUnique({ where: { campaignId } }).catch(() => null),
  ]);

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  // Hydrate linked characters via FE-shape snapshot helper.
  const characterIds = participants.map((p) => p.characterId);
  const characters = [];
  for (const cid of characterIds) {
    const snap = await loadCharacterSnapshotById(cid);
    if (snap) characters.push(snap);
  }

  // Reference (read-only) snapshots of canonical WorldNPC / WorldLocation
  // that this campaign currently points at. Captured for forensics; never
  // written back during restore.
  const worldNpcIds = Array.from(
    new Set(npcs.map((n) => n.worldNpcId).filter(Boolean)),
  );
  const worldLocationIds = new Set();
  if (campaign.currentLocationKind === 'world' && campaign.currentLocationId) {
    worldLocationIds.add(campaign.currentLocationId);
  }
  for (const n of npcs) {
    if (n.lastLocationKind === 'world' && n.lastLocationId) {
      worldLocationIds.add(n.lastLocationId);
    }
  }
  for (const q of quests) {
    if (q.locationKind === 'world' && q.locationId) {
      worldLocationIds.add(q.locationId);
    }
  }
  const [worldNpcRefs, worldLocationRefs] = await Promise.all([
    worldNpcIds.length > 0
      ? prisma.npc.findMany({ where: { id: { in: worldNpcIds } } })
      : Promise.resolve([]),
    worldLocationIds.size > 0
      ? prisma.location.findMany({ where: { id: { in: Array.from(worldLocationIds) } } })
      : Promise.resolve([]),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    schemaVersion: 1,
    campaign,
    participants,
    npcs,
    quests,
    questPrerequisites,
    scenes,
    campaignLocations,
    locationSummaries,
    locationEdges,
    campaignEdges,
    knowledge,
    codex,
    incidents,
    discoveredLocations,
    edgeDiscoveries,
    dmAgent,
    characters,
    worldNpcRefs,
    worldLocationRefs,
  };
}

export async function createSnapshot(campaignId, { reason, createdBy, pinned = false } = {}) {
  if (!campaignId) throw new Error('campaignId required');
  if (!createdBy) throw new Error('createdBy required');

  const payload = await loadCampaignGraph(campaignId);

  // Prisma JSONB doesn't accept Date instances or BigInt — round-trip through
  // JSON with a BigInt-aware replacer. BigInt → Number is safe here since
  // every BigInt column we capture is `@default(autoincrement())` and well
  // under MAX_SAFE_INTEGER in practice.
  const serialized = JSON.parse(
    JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
  );

  const snapshot = await prisma.campaignSnapshot.create({
    data: {
      campaignId,
      createdBy,
      reason: reason || null,
      pinned,
      payload: serialized,
    },
  });

  // FIFO trim — keep at most MAX_AUTO_PER_CAMPAIGN non-pinned snapshots per
  // campaign. Pinned ones are excluded from both the count and the delete.
  const nonPinned = await prisma.campaignSnapshot.findMany({
    where: { campaignId, pinned: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (nonPinned.length > MAX_AUTO_PER_CAMPAIGN) {
    const toDelete = nonPinned.slice(0, nonPinned.length - MAX_AUTO_PER_CAMPAIGN);
    await prisma.campaignSnapshot.deleteMany({
      where: { id: { in: toDelete.map((s) => s.id) } },
    });
  }

  return snapshot;
}

// ── Restore ──

const CAMPAIGN_SCALARS_TO_RESTORE = [
  'name', 'genre', 'tone', 'coreState', 'totalCost', 'isPublic',
  'rating', 'playCount', 'lastSaved', 'livingWorldEnabled',
  'questGraphEnabled', 'worldTimeRatio', 'worldTimeMaxGapDays',
  'difficultyTier', 'settlementCaps', 'boundsMinX', 'boundsMaxX',
  'boundsMinY', 'boundsMaxY', 'currentLocationName', 'currentLocationKind',
  'currentLocationId', 'currentX', 'currentY', 'pendingSlip',
  'pendingProvidence',
];

function pickScalars(row, keys) {
  const out = {};
  for (const k of keys) {
    if (row[k] !== undefined) out[k] = row[k];
  }
  return out;
}

function dropFkAndAudit(row, dropKeys = []) {
  const { id, createdAt, updatedAt, ...rest } = row;
  const drop = new Set(dropKeys);
  const out = { id };
  for (const [k, v] of Object.entries(rest)) {
    if (!drop.has(k)) out[k] = v;
  }
  return out;
}

export async function restoreSnapshot(snapshotId, { createdBy } = {}) {
  if (!snapshotId) throw new Error('snapshotId required');
  const snapshot = await prisma.campaignSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
  const { campaignId, payload } = snapshot;

  // Safety: snapshot the live state before clobbering it, so the user can
  // bail. Skips the safety hop if the snapshot we're restoring IS itself a
  // before-restore snapshot (avoids growing a saw-tooth chain of safeties).
  if (snapshot.reason !== 'before-restore') {
    await createSnapshot(campaignId, {
      reason: 'before-restore',
      createdBy: createdBy || snapshot.createdBy,
      pinned: false,
    });
  }

  const p = payload;
  if (!p || !p.campaign) throw new Error('Snapshot payload missing campaign');

  await prisma.$transaction(async (tx) => {
    // Campaign scalars (don't touch id, userId, createdAt, updatedAt, shareToken).
    await tx.campaign.update({
      where: { id: campaignId },
      data: pickScalars(p.campaign, CAMPAIGN_SCALARS_TO_RESTORE),
    });

    // Participants — replace strategy.
    await tx.campaignParticipant.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.participants) && p.participants.length > 0) {
      await tx.campaignParticipant.createMany({
        data: p.participants.map((row) => dropFkAndAudit(row)),
        skipDuplicates: true,
      });
    }

    // NPCs (cascade deletes relationships/experiences) → recreate.
    // Relationships/experiences both have BigInt autoincrement ids — drop
    // the id field entirely so Postgres assigns a fresh sequence value.
    await tx.campaignNPC.deleteMany({ where: { campaignId } });
    for (const n of p.npcs || []) {
      const { relationships, experiences, ...scalars } = n;
      const npcRow = await tx.campaignNPC.create({
        data: dropFkAndAudit(scalars, ['createdAt', 'updatedAt']),
      });
      if (Array.isArray(relationships) && relationships.length > 0) {
        await tx.campaignNpcRelationship.createMany({
          data: relationships.map(({ id: _drop, campaignNpcId: _drop2, ...rest }) => ({
            ...rest,
            campaignNpcId: npcRow.id,
          })),
          skipDuplicates: true,
        });
      }
      if (Array.isArray(experiences) && experiences.length > 0) {
        await tx.campaignNpcExperience.createMany({
          data: experiences.map(({ id: _drop, campaignNpcId: _drop2, addedAt: _drop3, ...rest }) => ({
            ...rest,
            campaignNpcId: npcRow.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Quests + objectives + prerequisites.
    await tx.campaignQuest.deleteMany({ where: { campaignId } });
    for (const q of p.quests || []) {
      const { objectives, prerequisites, ...scalars } = q;
      const questRow = await tx.campaignQuest.create({
        data: dropFkAndAudit(scalars, ['createdAt', 'updatedAt']),
      });
      if (Array.isArray(objectives) && objectives.length > 0) {
        await tx.campaignQuestObjective.createMany({
          data: objectives.map((o) => ({
            ...dropFkAndAudit(o, ['questId', 'createdAt', 'updatedAt']),
            questId: questRow.id,
          })),
          skipDuplicates: true,
        });
      }
    }
    // Prerequisites are recreated separately because their FKs point at
    // freshly inserted quest IDs — but quest IDs from the snapshot were
    // restored verbatim above, so we can replay them as-is.
    if (Array.isArray(p.questPrerequisites) && p.questPrerequisites.length > 0) {
      await tx.campaignQuestPrerequisite.createMany({
        data: p.questPrerequisites.map((pre) => dropFkAndAudit(pre, ['createdAt'])),
        skipDuplicates: true,
      });
    }

    // Scenes — replace.
    await tx.campaignScene.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.scenes) && p.scenes.length > 0) {
      await tx.campaignScene.createMany({
        data: p.scenes.map((s) => dropFkAndAudit(s, ['createdAt', 'updatedAt'])),
        skipDuplicates: true,
      });
    }

    // CampaignLocation + summaries.
    await tx.campaignLocation.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.campaignLocations) && p.campaignLocations.length > 0) {
      await tx.campaignLocation.createMany({
        data: p.campaignLocations.map((l) => dropFkAndAudit(l, ['createdAt', 'updatedAt'])),
        skipDuplicates: true,
      });
    }
    await tx.campaignLocationSummary.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.locationSummaries) && p.locationSummaries.length > 0) {
      await tx.campaignLocationSummary.createMany({
        data: p.locationSummaries.map((l) => dropFkAndAudit(l, ['createdAt', 'updatedAt'])),
        skipDuplicates: true,
      });
    }

    // Edges (LocationEdge + CampaignEdge).
    await tx.locationEdge.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.locationEdges) && p.locationEdges.length > 0) {
      await tx.locationEdge.createMany({
        data: p.locationEdges.map((e) => dropFkAndAudit(e, ['createdAt'])),
        skipDuplicates: true,
      });
    }
    await tx.campaignEdge.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.campaignEdges) && p.campaignEdges.length > 0) {
      await tx.campaignEdge.createMany({
        data: p.campaignEdges.map((e) => dropFkAndAudit(e, ['createdAt'])),
        skipDuplicates: true,
      });
    }

    // Knowledge / codex / discoveries / dmAgent / incidents.
    await tx.campaignKnowledge.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.knowledge) && p.knowledge.length > 0) {
      await tx.campaignKnowledge.createMany({
        data: p.knowledge.map((k) => {
          // Embedding column is `Unsupported("vector(1536)")` — Prisma can't write
          // it via createMany. Drop it; embedding service can rebuild lazily.
          const { embedding, ...rest } = k;
          return dropFkAndAudit(rest, ['createdAt', 'updatedAt']);
        }),
        skipDuplicates: true,
      });
    }
    await tx.campaignCodex.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.codex) && p.codex.length > 0) {
      await tx.campaignCodex.createMany({
        data: p.codex.map((c) => dropFkAndAudit(c, ['createdAt', 'updatedAt'])),
        skipDuplicates: true,
      });
    }
    await tx.campaignDiscoveredLocation.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.discoveredLocations) && p.discoveredLocations.length > 0) {
      await tx.campaignDiscoveredLocation.createMany({
        data: p.discoveredLocations.map((d) => dropFkAndAudit(d, ['createdAt'])),
        skipDuplicates: true,
      });
    }
    await tx.campaignEdgeDiscovery.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.edgeDiscoveries) && p.edgeDiscoveries.length > 0) {
      await tx.campaignEdgeDiscovery.createMany({
        data: p.edgeDiscoveries.map((d) => dropFkAndAudit(d, ['createdAt'])),
        skipDuplicates: true,
      });
    }
    if (p.dmAgent) {
      await tx.campaignDmAgent.upsert({
        where: { campaignId },
        update: dropFkAndAudit(p.dmAgent, ['createdAt', 'updatedAt']),
        create: dropFkAndAudit(p.dmAgent, ['createdAt', 'updatedAt']),
      });
    }

    // Incidents — restore historical record (read-only forensics).
    await tx.campaignIncident.deleteMany({ where: { campaignId } });
    if (Array.isArray(p.incidents) && p.incidents.length > 0) {
      await tx.campaignIncident.createMany({
        data: p.incidents.map((i) => dropFkAndAudit(i, ['createdAt'])),
        skipDuplicates: true,
      });
    }
  }, { timeout: 30000 });

  // Restore linked characters outside the campaign tx (each character has its
  // own internal $transaction inside persistCharacterSnapshot — nesting would
  // hit Prisma's "transaction already open" guard).
  for (const charSnapshot of p.characters || []) {
    if (!charSnapshot?.id) continue;
    try {
      await persistCharacterSnapshot(charSnapshot.id, charSnapshot);
    } catch (err) {
      log.error({ err, characterId: charSnapshot.id }, 'character restore failed');
    }
  }

  // Sync coreState back from the freshly normalized rows so the FE save-state
  // round-trip stays consistent.
  const fresh = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (fresh) {
    const coreState = fresh.coreState && typeof fresh.coreState === 'object' ? fresh.coreState : {};
    await reconstructFromNormalized(campaignId, coreState, {
      currentLocationName: fresh.currentLocationName,
      currentLocationKind: fresh.currentLocationKind,
      currentLocationId: fresh.currentLocationId,
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { coreState },
    });
  }

  return { ok: true, restoredSnapshotId: snapshotId };
}

// ── Wrapper ──

/**
 * Auto-snapshot before running a mutating operation. Returns whatever `fn`
 * returns. If snapshot creation fails we still attempt the mutation but log
 * loudly — losing one snapshot is better than blocking the admin entirely.
 *
 * Pass `skip: true` to bypass (used by bulk endpoints that want one snapshot
 * across many writes via an outer call).
 */
export async function withSnapshot(campaignId, { reason, createdBy, skip = false }, fn) {
  if (!skip) {
    try {
      await createSnapshot(campaignId, { reason, createdBy, pinned: false });
    } catch (err) {
      log.error({ err, campaignId, reason }, 'pre-mutation snapshot failed — continuing');
    }
  }
  return fn();
}
