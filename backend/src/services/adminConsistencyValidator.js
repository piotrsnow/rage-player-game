// Admin panel consistency validator.
//
// Single-file rule engine. Each rule pulls from a shared payload of campaign
// relations (loaded once via Promise.all) and emits zero or more issues:
//
//   {
//     severity: 'error' | 'warning',
//     ruleId: 'dagPrerequisites',
//     entity: 'CampaignQuestPrerequisite',
//     entityId: '...',
//     message: 'human-readable',
//     autoFix?: { method, path, body }   // hint the FE can replay against admin API
//   }
//
// Severity contract: `error` = state that violates a hard invariant or will
// cause a constraint violation if saved (Save anyway still allowed except
// where the FE chooses to harden — DAG cycles are the one place we suggest
// blocking, since prerequisites can never resolve). `warning` = soft
// inconsistency (dead questgiver with active quest etc.) — fine to leave but
// the user should know.

import { prisma } from '../lib/prisma.js';

const MOVEMENT_EDGE_TYPES = new Set([
  'road', 'path', 'door', 'stairs', 'portal', 'secret_path',
]);

async function loadCampaignSnapshot(campaignId) {
  const [
    campaign,
    npcs,
    quests,
    objectives,
    prerequisites,
    edges,
    campaignLocations,
    participants,
  ] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.npc.findMany({ where: { campaignId } }),
    prisma.campaignQuest.findMany({ where: { campaignId } }),
    prisma.campaignQuestObjective.findMany({ where: { quest: { campaignId } } }),
    prisma.campaignQuestPrerequisite.findMany({ where: { quest: { campaignId } } }),
    prisma.locationEdge.findMany({ where: { campaignId } }),
    prisma.location.findMany({ where: { campaignId } }),
    prisma.campaignParticipant.findMany({ where: { campaignId } }),
  ]);

  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const characterIds = participants.map((p) => p.characterId);
  const characters = characterIds.length > 0
    ? await prisma.character.findMany({
        where: { id: { in: characterIds } },
        include: { inventoryItems: true },
      })
    : [];

  // Resolve location targets across both kinds in a single round-trip per side.
  const worldLocIds = new Set();
  const campaignLocIdSet = new Set(campaignLocations.map((l) => l.id));

  function recordRef(kind, id) {
    if (!kind || !id) return;
    if (kind === 'world') worldLocIds.add(id);
  }
  recordRef(campaign.currentLocationKind, campaign.currentLocationId);
  for (const n of npcs) recordRef(n.lastLocationKind, n.lastLocationId);
  for (const q of quests) recordRef(q.locationKind, q.locationId);
  for (const e of edges) {
    if (e.fromKind === 'world') worldLocIds.add(e.fromId);
    if (e.toKind === 'world') worldLocIds.add(e.toId);
  }

  const worldLocations = worldLocIds.size > 0
    ? await prisma.location.findMany({
        where: { id: { in: Array.from(worldLocIds) } },
        select: { id: true },
      })
    : [];
  const worldLocIdSet = new Set(worldLocations.map((l) => l.id));

  // Cross-campaign WorldNPC sync check needs the canonical alive flag.
  const worldNpcIds = Array.from(
    new Set(npcs.map((n) => n.worldNpcId).filter(Boolean)),
  );
  const worldNpcs = worldNpcIds.length > 0
    ? await prisma.npc.findMany({
        where: { id: { in: worldNpcIds } },
        select: { id: true, alive: true, name: true },
      })
    : [];
  const worldNpcById = new Map(worldNpcs.map((w) => [w.id, w]));

  return {
    campaign,
    npcs,
    quests,
    objectives,
    prerequisites,
    edges,
    campaignLocations,
    characters,
    worldLocIdSet,
    campaignLocIdSet,
    worldNpcById,
  };
}

function locationExists({ kind, id }, snap) {
  if (!kind || !id) return true;
  if (kind === 'world') return snap.worldLocIdSet.has(id);
  if (kind === 'campaign') return snap.campaignLocIdSet.has(id);
  return false;
}

// ── Rules ──

function ruleDagPrerequisites(snap) {
  const issues = [];
  // Build adjacency: questId → prerequisiteIds.
  const adj = new Map();
  const indeg = new Map();
  for (const q of snap.quests) {
    adj.set(q.id, []);
    indeg.set(q.id, 0);
  }
  for (const p of snap.prerequisites) {
    if (!adj.has(p.questId) || !adj.has(p.prerequisiteId)) continue;
    // Edge: prerequisite → quest (prereq must complete first).
    adj.get(p.prerequisiteId).push(p.questId);
    indeg.set(p.questId, (indeg.get(p.questId) || 0) + 1);
  }

  // Kahn topological sort. If any node remains with indeg > 0 there's a cycle.
  const queue = [];
  for (const [id, deg] of indeg) {
    if (deg === 0) queue.push(id);
  }
  let processed = 0;
  while (queue.length > 0) {
    const node = queue.shift();
    processed++;
    for (const next of adj.get(node) || []) {
      const d = indeg.get(next) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (processed < snap.quests.length) {
    // Find one quest still in cycle for the message.
    const stuck = [...indeg.entries()].filter(([, d]) => d > 0).map(([id]) => id);
    issues.push({
      severity: 'error',
      ruleId: 'dagPrerequisites',
      entity: 'CampaignQuestPrerequisite',
      entityId: stuck.join(','),
      message: `Cycle in quest prerequisites — ${stuck.length} quests stuck. Remove a prerequisite edge to break the loop.`,
    });
  }
  return issues;
}

function ruleNpcDeadQuestStatus(snap, campaignId) {
  const issues = [];
  const deadByNpcId = new Map();
  for (const n of snap.npcs) {
    if (!n.alive) deadByNpcId.set(n.npcId, n);
  }
  if (deadByNpcId.size === 0) return issues;
  for (const q of snap.quests) {
    if (q.status !== 'active' && q.status !== 'stalled') continue;
    const giver = q.questGiverId && deadByNpcId.get(q.questGiverId);
    const turnIn = q.turnInNpcId && deadByNpcId.get(q.turnInNpcId);
    const dead = giver || turnIn;
    if (dead) {
      issues.push({
        severity: 'warning',
        ruleId: 'npcDeadQuestStatus',
        entity: 'CampaignQuest',
        entityId: q.id,
        message: `Quest "${q.name}" depends on dead NPC ${dead.name} but status is ${q.status}.`,
        autoFix: {
          method: 'PATCH',
          path: `/v1/admin/campaigns/${campaignId}/quests/${q.id}`,
          body: { status: 'failed' },
        },
      });
    }
  }
  return issues;
}

function ruleEquippedItemsExist(snap, campaignId) {
  const issues = [];
  for (const c of snap.characters) {
    const itemKeys = new Set((c.inventoryItems || []).map((i) => i.itemKey));
    for (const slot of ['equippedMainHand', 'equippedOffHand', 'equippedArmour']) {
      const key = c[slot];
      if (key && !itemKeys.has(key)) {
        issues.push({
          severity: 'error',
          ruleId: 'equippedItemsExist',
          entity: 'Character',
          entityId: c.id,
          message: `Character "${c.name}" has ${slot}="${key}" but no matching inventory item.`,
          autoFix: {
            method: 'PATCH',
            path: `/v1/admin/campaigns/${campaignId}/characters/${c.id}`,
            body: { [slot]: null },
          },
        });
      }
    }
  }
  return issues;
}

function rulePolymorphicRefs(snap) {
  const issues = [];
  function check(kind, id, owner) {
    if (!kind && !id) return;
    if (kind && id && locationExists({ kind, id }, snap)) return;
    if (kind || id) {
      issues.push({
        severity: 'error',
        ruleId: 'polymorphicRefs',
        entity: owner.entity,
        entityId: owner.id,
        message: `${owner.label} points at ${kind || '?'}/${id || '?'} which doesn't exist.`,
      });
    }
  }
  for (const n of snap.npcs) {
    check(n.lastLocationKind, n.lastLocationId, {
      entity: 'CampaignNPC', id: n.id, label: `NPC "${n.name}" lastLocation`,
    });
  }
  for (const q of snap.quests) {
    check(q.locationKind, q.locationId, {
      entity: 'CampaignQuest', id: q.id, label: `Quest "${q.name}" location`,
    });
  }
  return issues;
}

function ruleQuestGiverExists(snap) {
  const issues = [];
  const npcIds = new Set(snap.npcs.map((n) => n.npcId));
  for (const q of snap.quests) {
    if (q.questGiverId && !npcIds.has(q.questGiverId)) {
      issues.push({
        severity: 'error',
        ruleId: 'questGiverExists',
        entity: 'CampaignQuest',
        entityId: q.id,
        message: `Quest "${q.name}" questGiverId="${q.questGiverId}" but no matching CampaignNPC.npcId in this campaign.`,
      });
    }
    if (q.turnInNpcId && !npcIds.has(q.turnInNpcId)) {
      issues.push({
        severity: 'error',
        ruleId: 'questGiverExists',
        entity: 'CampaignQuest',
        entityId: q.id,
        message: `Quest "${q.name}" turnInNpcId="${q.turnInNpcId}" but no matching CampaignNPC.npcId in this campaign.`,
      });
    }
  }
  return issues;
}

function ruleBidirectionalMovementEdges(snap, campaignId) {
  const issues = [];
  // Build a key for each edge, then look up the reverse.
  function key(kind, id) { return `${kind}:${id}`; }
  const fwdSet = new Set();
  for (const e of snap.edges) {
    fwdSet.add(`${key(e.fromKind, e.fromId)}->${key(e.toKind, e.toId)}:${e.edgeType}`);
  }
  for (const e of snap.edges) {
    if (!MOVEMENT_EDGE_TYPES.has(e.edgeType)) continue;
    if (e.bidirectional) continue;
    const reverseKey = `${key(e.toKind, e.toId)}->${key(e.fromKind, e.fromId)}:${e.edgeType}`;
    if (!fwdSet.has(reverseKey)) {
      issues.push({
        severity: 'warning',
        ruleId: 'bidirectionalMovementEdges',
        entity: 'LocationEdge',
        entityId: e.id,
        message: `Movement edge ${e.edgeType} from ${e.fromKind}/${e.fromId} → ${e.toKind}/${e.toId} has no reverse and is not bidirectional.`,
        autoFix: {
          method: 'PATCH',
          path: `/v1/admin/campaigns/${campaignId}/edges/${e.id}`,
          body: { bidirectional: true },
        },
      });
    }
  }
  return issues;
}

function ruleWorldNpcAliveSync(snap) {
  const issues = [];
  for (const n of snap.npcs) {
    if (!n.worldNpcId) continue;
    const w = snap.worldNpcById.get(n.worldNpcId);
    if (!w) continue;
    if (w.alive === false && n.alive === true) {
      issues.push({
        severity: 'warning',
        ruleId: 'worldNpcAliveSync',
        entity: 'CampaignNPC',
        entityId: n.id,
        message: `Canonical WorldNPC "${w.name}" is dead but campaign instance is alive=true.`,
      });
    }
  }
  return issues;
}

function ruleCurrentLocationExists(snap) {
  const issues = [];
  const c = snap.campaign;
  if (!c.currentLocationKind && !c.currentLocationId) return issues;
  if (!locationExists({ kind: c.currentLocationKind, id: c.currentLocationId }, snap)) {
    issues.push({
      severity: 'error',
      ruleId: 'currentLocationExists',
      entity: 'Campaign',
      entityId: c.id,
      message: `Campaign currentLocation ${c.currentLocationKind}/${c.currentLocationId} doesn't resolve.`,
    });
  }
  return issues;
}

function ruleObjectiveNodeKeyUnique(snap) {
  const issues = [];
  const seen = new Map(); // questId → Set<nodeKey>
  for (const o of snap.objectives) {
    if (!o.nodeKey) continue;
    if (!seen.has(o.questId)) seen.set(o.questId, new Set());
    const keys = seen.get(o.questId);
    if (keys.has(o.nodeKey)) {
      issues.push({
        severity: 'error',
        ruleId: 'objectiveNodeKeyUnique',
        entity: 'CampaignQuestObjective',
        entityId: String(o.id),
        message: `Objective nodeKey "${o.nodeKey}" duplicated within quest ${o.questId}.`,
      });
    }
    keys.add(o.nodeKey);
  }
  return issues;
}

const RULES = [
  ruleDagPrerequisites,
  ruleNpcDeadQuestStatus,
  ruleEquippedItemsExist,
  rulePolymorphicRefs,
  ruleQuestGiverExists,
  ruleBidirectionalMovementEdges,
  ruleWorldNpcAliveSync,
  ruleCurrentLocationExists,
  ruleObjectiveNodeKeyUnique,
];

export async function validateCampaign(campaignId) {
  const snap = await loadCampaignSnapshot(campaignId);
  const issues = [];
  for (const rule of RULES) {
    try {
      const out = rule(snap, campaignId);
      if (Array.isArray(out)) issues.push(...out);
    } catch (err) {
      issues.push({
        severity: 'warning',
        ruleId: 'validatorError',
        entity: 'Validator',
        entityId: rule.name,
        message: `Rule ${rule.name} threw: ${err.message}`,
      });
    }
  }
  const summary = issues.reduce(
    (acc, i) => {
      if (i.severity === 'error') acc.errors++;
      else acc.warnings++;
      return acc;
    },
    { errors: 0, warnings: 0 },
  );
  return { issues, summary };
}
