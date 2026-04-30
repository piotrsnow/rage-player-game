import { toCanonicalStoragePath } from './urlCanonical.js';

export function extractTotalCost(coreState) {
  if (!coreState) return 0;
  // Prisma returns Json columns as native objects; strings only happen when
  // a caller (legacy / test) hands us a serialized blob.
  const obj = typeof coreState === 'string' ? JSON.parse(coreState) : coreState;
  return obj?.aiCosts?.total || 0;
}

/**
 * Strip normalized branches out of coreState before saving.
 * Character data is NOT touched here — characters live in their own collection
 * and are referenced via Campaign.characterIds.
 *
 * F5 — also lifts `world.currentLocation` (flavor name) onto its own
 * `currentLocationName` field. Caller writes it to the dedicated
 * Campaign.currentLocationName column; reconstructFromNormalized injects it
 * back into coreState.world on read.
 */
export function stripNormalizedFromCoreState(coreStateObj) {
  const slim = { ...coreStateObj };

  if ('character' in slim) delete slim.character;

  const npcs = slim.world?.npcs || [];
  if (slim.world && 'npcs' in slim.world) {
    const { npcs: _n, ...worldRest } = slim.world;
    slim.world = worldRest;
  }

  let currentLocationName = null;
  if (slim.world && typeof slim.world === 'object' && 'currentLocation' in slim.world) {
    const raw = slim.world.currentLocation;
    currentLocationName = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    const { currentLocation: _drop, ...worldRest } = slim.world;
    slim.world = worldRest;
  }

  const knowledgeEvents = slim.world?.knowledgeBase?.events || [];
  const knowledgeDecisions = slim.world?.knowledgeBase?.decisions || [];
  if (slim.world?.knowledgeBase && ('events' in slim.world.knowledgeBase || 'decisions' in slim.world.knowledgeBase)) {
    const { events: _e, decisions: _d, ...kbRest } = slim.world.knowledgeBase;
    slim.world = { ...slim.world, knowledgeBase: kbRest };
  }

  const quests = slim.quests || { active: [], completed: [] };
  delete slim.quests;

  return { slim, npcs, knowledgeEvents, knowledgeDecisions, quests, currentLocationName };
}

export const SCENE_CLIENT_SELECT = {
  id: true, campaignId: true, sceneIndex: true,
  narrative: true, chosenAction: true,
  suggestedActions: true, dialogueSegments: true,
  imagePrompt: true, imageUrl: true, soundEffect: true,
  diceRoll: true, stateChanges: true, scenePacing: true,
  createdAt: true,
};

export function buildDistinctSceneCountMap(rows) {
  const perCampaign = new Map();
  for (const row of rows) {
    if (!perCampaign.has(row.campaignId)) {
      perCampaign.set(row.campaignId, new Set());
    }
    perCampaign.get(row.campaignId).add(row.sceneIndex);
  }
  return Object.fromEntries(
    Array.from(perCampaign.entries()).map(([campaignId, indices]) => [campaignId, indices.size])
  );
}

export function dedupeScenesByIndexAsc(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const byIndex = new Map();
  for (const scene of rows) {
    const existing = byIndex.get(scene.sceneIndex);
    if (!existing || new Date(scene.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      byIndex.set(scene.sceneIndex, scene);
    }
  }
  return Array.from(byIndex.values())
    .sort((a, b) => a.sceneIndex - b.sceneIndex)
    .map(normalizeSceneAssetUrls);
}

/**
 * Rewrite any hydrated asset URLs (host + `?token=`) on a scene row to their
 * canonical `/v1/media/file/...` form. Safe to call on rows that already use
 * the canonical path. Applied on read so the FE never sees a stale token.
 */
export function normalizeSceneAssetUrls(scene) {
  if (!scene || typeof scene !== 'object') return scene;
  if (typeof scene.imageUrl === 'string' && scene.imageUrl) {
    const canonical = toCanonicalStoragePath(scene.imageUrl);
    if (canonical !== scene.imageUrl) return { ...scene, imageUrl: canonical };
  }
  return scene;
}
