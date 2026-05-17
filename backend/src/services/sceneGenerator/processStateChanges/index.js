import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import {
  walkUpAncestors,
  resolveLocationByName,
  findOrCreateCampaignLocation,
} from '../../livingWorld/worldStateService.js';
import { lookupLocationByKindId } from '../../locationRefs.js';

import { generateSceneEmbedding } from './sceneEmbedding.js';
import { processNpcChanges } from './npcs.js';
import { processNpcMemoryUpdates } from './npcMemoryUpdates.js';
import { evaluateQuestGraphForCampaign } from '../../livingWorld/questDynamicsService.js';
import {
  parseNpcChanges,
  parseObjectiveReveals,
  parseBranchGroupReveals,
  parseQuestMutations,
  parseQuestUpdates,
  parseQuestOffers,
} from './schemas.js';
import { processKnowledgeUpdates, processCodexUpdates } from './knowledgeCodex.js';
import {
  processQuestObjectiveUpdates,
  processQuestStatusChange,
  processObjectiveReveals,
  processBranchGroupReveals,
  processQuestMutations,
  processQuestOffers,
} from './quests.js';
import { processLocationChanges } from './locations.js';
import {
  shouldPromoteToGlobal,
  processLocationMentions,
  processCampaignComplete,
} from './livingWorld.js';
import { processBoardUpdates, parseBoardUpdates } from './boardUpdates.js';
import { createEdge } from '../../locationGraph/graphService.js';
import { findSimilarNodeImage } from '../../locationGraph/imageMatcher.js';
import { markLocationEdgeTraversed, markLocationDiscovered } from '../../livingWorld/userDiscoveryService.js';
import { loadCampaignNpcNames, isNpcName } from '../../livingWorld/npcNameGuard.js';

// Re-exported so existing test file processStateChanges.test.js keeps
// working via `import { shouldPromoteToGlobal } from './processStateChanges.js'`.
export { shouldPromoteToGlobal, generateSceneEmbedding };

const log = childLogger({ module: 'sceneGenerator' });

// Match-or-drop resolver for AI-emitted `stateChanges.currentLocation`.
// Returns `{ id, name }` when the target name resolves to an existing
// canonical or campaign-scoped Location in this campaign's fog.
// Returns null on miss — caller decides whether to create-on-miss
// (with guards) or drop.
async function resolveCurrentLocationTarget(campaignId, targetName) {
  const ref = await resolveLocationByName(targetName, { campaignId }).catch(() => null);
  if (!ref?.location?.id) return null;
  const name = ref.location.canonicalName || ref.location.displayName || targetName;
  return { id: ref.location.id, name };
}

// Create the bidirectional movement edge between two location nodes if it
// doesn't already exist, then mark it traversed for the current scene.
// Used by every code path that transitions the player between two resolved
// nodes (anchor, retry-after-subloc-create, auto-promote, create-on-miss).
async function ensureMovementEdge({ from, to, sceneIndex, campaignId }) {
  if (!from || !to) return;
  if (from === to) return;
  try {
    const existing = await prisma.locationEdge.findFirst({
      where: {
        fromLocationId: from, toLocationId: to,
        category: 'movement', isActive: true,
        OR: [{ campaignId: null }, { campaignId }],
      },
    });
    if (!existing) {
      await createEdge({
        fromLocationId: from,
        toLocationId: to,
        edgeType: 'path_to',
        category: 'movement',
        bidirectional: true,
        weight: 1.0,
        metadata: { autoCreated: true },
        discoveryState: 'visited',
        campaignId,
        createdBy: 'system',
      });
    }
    await markLocationEdgeTraversed({
      fromLocationId: from,
      toLocationId: to,
      sceneIndex,
      campaignId,
    });
  } catch (edgeErr) {
    log.debug({ err: edgeErr?.message, campaignId, from, to }, 'ensureMovementEdge failed (non-fatal)');
  }
}

// Generic-terrain blacklist for create-on-miss guard. AI emits these as
// "I am in <generic terrain>" but they're not POI — they describe the
// patch the player is wandering across. Keep wandering (flavor name +
// coords) instead of materializing a CampaignLocation.
const GENERIC_TERRAIN_TOKENS = new Set([
  'las', 'lasu', 'lasie',
  'polana', 'polanie', 'polany',
  'łąka', 'łąki', 'łące',
  'błota', 'bagno', 'bagna',
  'dolina', 'doliny', 'dolinie',
  'góry', 'górach', 'wzgórza', 'wzgórze',
  'rzeka', 'rzeki', 'rzece',
  'droga', 'drogi', 'drodze', 'trakt', 'traktu',
  'pole', 'pola',
  'pustkowie', 'pustkowia',
]);


function isGenericTerrainName(name) {
  const lower = String(name || '').toLowerCase().trim();
  if (!lower) return true;
  const tokens = lower.split(/\s+/);
  // If every token is a stopword/adjective + a generic-terrain noun ("stary
  // las", "głęboka dolina"), treat as generic. We don't enumerate adjectives
  // — just check whether ANY token is a known generic-terrain noun. AI-named
  // POI like "Magowa Wieża" / "Karczma Pod Wilkiem" don't share these tokens.
  return tokens.some((t) => GENERIC_TERRAIN_TOKENS.has(t));
}

export async function processStateChanges(campaignId, stateChanges, { prevLoc = null, sceneIndex = null, currentRef = null } = {}) {
  // Fetch campaign once to check living-world flag + userId for Phase 4
  // WorldEvent attribution (cheap — same record is already loaded by
  // postSceneWork for the same campaignId).
  let livingWorldEnabled = false;
  let ownerUserId = null;
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { livingWorldEnabled: true, userId: true },
    });
    livingWorldEnabled = campaign?.livingWorldEnabled === true;
    ownerUserId = campaign?.userId || null;
  } catch {
    // non-fatal — fall back to legacy behaviour
  }

  // Phase 7 — single timestamp per scene so intra-scene WorldEvents are
  // internally consistent (instead of each appendEvent minting its own
  // `new Date()` drifting by milliseconds). Cross-user time reconstruction
  // later depends on this being stable per scene.
  const sceneGameTime = new Date();

  // NPC name guard — loaded once, reused by all location-write paths in
  // this scene. Prevents AI from materializing NPC names as location rows.
  let npcNames = new Set();
  try {
    npcNames = await loadCampaignNpcNames(campaignId);
  } catch {
    // non-fatal — guard runs permissive if load fails
  }

  if (stateChanges.npcs?.length) {
    const parsed = parseNpcChanges(stateChanges.npcs);
    if (parsed.ok) {
      await processNpcChanges(campaignId, parsed.data, { livingWorldEnabled, sceneIndex });
    } else {
      // Schema violation on the npcs bucket is non-fatal — log and skip so
      // one malformed entry doesn't kill the rest of the scene's side
      // effects. `processNpcChanges` already logs per-NPC errors of its own.
      log.warn({ campaignId, issues: parsed.error?.issues?.slice(0, 5) }, 'stateChanges.npcs failed schema validation — skipped');
    }
  }

  // Stage 2 — NPC memory accumulation (shadow only). Runs AFTER processNpcChanges
  // so any NPC introduced in the same scene already has a CampaignNPC row
  // the memory can attach to. Not gated on livingWorldEnabled: cross-scene
  // NPC consistency benefits classic campaigns too. Canonical WorldNPC is
  // never touched here — post-campaign write-back (Stage 2b) will extract
  // important entries to WorldNPC.knowledgeBase.
  if (Array.isArray(stateChanges.npcMemoryUpdates) && stateChanges.npcMemoryUpdates.length > 0) {
    await processNpcMemoryUpdates(campaignId, stateChanges.npcMemoryUpdates);
  }

  // ── Oś 3 — materialize questOffers (graph-aware) ────────────────────
  // PO processNpcChanges aby questGiverId/turnInNpcId mogli mieć już
  // CampaignNPC row utworzony w tej samej scenie. Walidacja grafu po
  // stronie processQuestOffers (validateGraphIntegrity).
  if (Array.isArray(stateChanges.questOffers) && stateChanges.questOffers.length > 0) {
    const parsed = parseQuestOffers(stateChanges.questOffers);
    if (parsed.ok) {
      await processQuestOffers(campaignId, parsed.data);
    } else {
      log.warn({ campaignId, issues: parsed.error?.issues?.slice(0, 5) }, 'stateChanges.questOffers failed schema validation — skipped');
    }
  }

  if (livingWorldEnabled && stateChanges.campaignComplete) {
    await processCampaignComplete({
      campaignId,
      data: stateChanges.campaignComplete,
    });
  }


  // AI emits `stateChanges.currentLocation` (string) and/or `currentX/currentY`
  // (numbers) after a travel montage, sublocation walk-in, or free-vector
  // movement. F5d Phase 2 — three modes:
  //
  //   1. Name resolves to fog-visible POI → anchored: write FK trio + sync
  //      currentX/Y from the POI's regionX/regionY.
  //   2. Name doesn't resolve, but currentX/Y given → wandering: store the
  //      flavor name (no FK), set continuous coords. The flavor name does NOT
  //      create a CampaignLocation row — it's a one-shot label for the patch
  //      of biome the player is standing on.
  //   3. Bare currentX/Y, no name → wandering with no flavor (clear name).
  //
  // Unresolved name with no coords falls through with a warning (legacy
  // match-or-drop behaviour preserved).
  const aiName = typeof stateChanges.currentLocation === 'string' && stateChanges.currentLocation.trim()
    ? stateChanges.currentLocation.trim()
    : null;
  // AI may emit a composite ref "kind:uuid" directly — resolve it first.
  const aiLocRef = typeof stateChanges.currentLocationRef === 'string'
    ? stateChanges.currentLocationRef.match(/^(world|campaign):([0-9a-f-]{36})$/i)
    : null;
  const aiX = typeof stateChanges.currentX === 'number' && Number.isFinite(stateChanges.currentX)
    ? stateChanges.currentX
    : null;
  const aiY = typeof stateChanges.currentY === 'number' && Number.isFinite(stateChanges.currentY)
    ? stateChanges.currentY
    : null;
  const hasCoords = aiX !== null && aiY !== null;

  let aiNameResolved = false;
  if (aiName || aiLocRef || hasCoords) {
    try {
      let updates = null;
      // Prefer the composite ref if AI provided one.
      let resolved = null;
      if (aiLocRef) {
        const refId = aiLocRef[2];
        const row = await lookupLocationByKindId({
          prisma,
          kind: null,
          id: refId,
          select: { id: true, canonicalName: true, displayName: true, regionX: true, regionY: true },
        }).catch(() => null);
        if (row) {
          resolved = { id: refId, name: row.canonicalName || row.displayName || aiName || '' };
          log.info({ campaignId, ref: stateChanges.currentLocationRef }, 'currentLocation resolved via AI-emitted ref');
        }
      }
      if (!resolved && aiName) {
        resolved = await resolveCurrentLocationTarget(campaignId, aiName);
      }
      if (aiName || resolved) {
        if (resolved) {
          aiNameResolved = true;
          const coords = await lookupLocationByKindId({
            prisma,
            kind: null,
            id: resolved.id,
            select: { regionX: true, regionY: true },
          }).catch(() => null);
          updates = {
            currentLocationName: resolved.name,
            currentLocationId: resolved.id,
            currentX: coords?.regionX ?? null,
            currentY: coords?.regionY ?? null,
          };
          log.info({ campaignId, name: resolved.name, locId: resolved.id, x: updates.currentX, y: updates.currentY }, 'currentLocation updated (anchored at POI)');
        } else if (
          livingWorldEnabled
          && currentRef
          && aiName.trim().split(/\s+/).length >= 2
          && !isGenericTerrainName(aiName)
          && !isNpcName(aiName, npcNames)
        ) {
          const anchorRow = await lookupLocationByKindId({
            prisma,
            kind: null,
            id: currentRef,
            select: { regionX: true, regionY: true, region: true },
          }).catch(() => null);
          const newRegionX = aiX ?? anchorRow?.regionX ?? 0;
          const newRegionY = aiY ?? anchorRow?.regionY ?? 0;
          const created = await findOrCreateCampaignLocation(aiName, {
            campaignId,
            description: '',
            locationType: 'campaignPlace',
            category: 'campaignPlace',
            region: anchorRow?.region || null,
            regionX: newRegionX,
            regionY: newRegionY,
            positionConfidence: aiX != null ? 0.7 : 0.4,
            dangerLevel: 'safe',
          }).catch((err) => {
            log.warn({ err: err?.message, campaignId, aiName }, 'create-on-miss findOrCreateCampaignLocation failed (non-fatal)');
            return null;
          });
          if (created) {
            aiNameResolved = true;
            updates = {
              currentLocationName: created.name,
              currentLocationKind: LOCATION_KIND_CAMPAIGN,
              currentLocationId: created.id,
              currentX: created.regionX ?? newRegionX,
              currentY: created.regionY ?? newRegionY,
            };
            log.info(
              { campaignId, name: created.name, id: created.id, regionX: updates.currentX, regionY: updates.currentY },
              'currentLocation create-on-miss — new CampaignLocation materialized',
            );
            // Best-effort node image inheritance — same pattern as
            // processSublocationEntry.
            if (!created.nodeImageUrl) {
              try {
                const matchedUrl = await findSimilarNodeImage({
                  locationType: 'campaignPlace',
                  biome: null,
                  tags: [],
                });
                if (matchedUrl) {
                  await prisma.location.update({ where: { id: created.id }, data: { nodeImageUrl: matchedUrl } });
                }
              } catch { /* non-fatal */ }
            }
            // Mark as visited for the player's fog-of-war so the new node
            // shows up in the FE graph immediately (player-mode + GM-mode).
            if (ownerUserId) {
              try {
                await markLocationDiscovered({
                  userId: ownerUserId,
                  locationKind: LOCATION_KIND_CAMPAIGN,
                  locationId: created.id,
                  campaignId,
                });
              } catch (err) {
                log.debug({ err: err?.message, campaignId, locId: created.id }, 'create-on-miss markLocationDiscovered failed (non-fatal)');
              }
            }
          } else if (hasCoords) {
            // Fall back to wandering if creation failed.
            updates = {
              currentLocationName: aiName,
              currentLocationKind: null,
              currentLocationId: null,
              currentX: aiX,
              currentY: aiY,
            };
            log.info({ campaignId, flavorName: aiName, x: aiX, y: aiY }, 'currentLocation updated (wandering — create-on-miss failed, fallback)');
          }
        } else if (hasCoords) {
          updates = {
            currentLocationName: aiName,
            currentLocationKind: null,
            currentLocationId: null,
            currentX: aiX,
            currentY: aiY,
          };
          log.info({ campaignId, flavorName: aiName, x: aiX, y: aiY }, 'currentLocation updated (wandering — flavor name + coords, no DB POI row)');
        } else {
          log.warn(
            { campaignId, ignored: aiName },
            'AI emitted stateChanges.currentLocation but name did not resolve, guards failed, and no currentX/Y given — dropped',
          );
        }
      } else {
        updates = {
          currentLocationName: null,
          currentLocationKind: null,
          currentLocationId: null,
          currentX: aiX,
          currentY: aiY,
        };
        log.info({ campaignId, x: aiX, y: aiY }, 'currentLocation cleared (wandering — bare coords)');
      }
      if (updates) {
        await prisma.campaign.update({ where: { id: campaignId }, data: updates });

        if (updates.currentLocationKind && updates.currentLocationId) {
          await ensureMovementEdge({
            from: currentRef,
            to: { kind: updates.currentLocationKind, id: updates.currentLocationId },
            sceneIndex,
            campaignId,
          });
        }
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, aiName, aiX, aiY }, 'currentLocation resolve/update failed');
    }
  }

  let locResult = { createdSublocs: [] };
  if (livingWorldEnabled && stateChanges.newLocations?.length) {
    locResult = await processLocationChanges(campaignId, stateChanges.newLocations, { prevLoc, npcNames }) || { createdSublocs: [] };
  }

  // Retry: initial aiName resolution failed (sublocation didn't exist yet),
  // but newLocations just created a matching row. Re-resolve and anchor.
  if (aiName && !aiNameResolved && locResult.createdSublocs.length > 0) {
    try {
      const retryResolved = await resolveCurrentLocationTarget(campaignId, aiName);
      if (retryResolved) {
        const retryCoords = await lookupLocationByKindId({
          prisma,
          kind: retryResolved.kind,
          id: retryResolved.id,
          select: { regionX: true, regionY: true },
        }).catch(() => null);
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            currentLocationName: retryResolved.name,
            currentLocationKind: retryResolved.kind,
            currentLocationId: retryResolved.id,
            currentX: retryCoords?.regionX ?? null,
            currentY: retryCoords?.regionY ?? null,
          },
        });
        aiNameResolved = true;
        log.info(
          { campaignId, name: retryResolved.name, kind: retryResolved.kind },
          'currentLocation resolved on retry (sublocation created by newLocations in same scene)',
        );
        await ensureMovementEdge({
          from: currentRef,
          to: { kind: retryResolved.kind, id: retryResolved.id },
          sceneIndex,
          campaignId,
        });
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId, aiName }, 'currentLocation retry-resolve failed (non-fatal)');
    }
  }

  // Auto-promote: AI emitted exactly one new sublocation whose parent is in
  // the player's walk-up ancestor chain → set it as currentLocation. Covers
  // intra-settlement (gracz wchodzi do nowej tawerny), inter-subloc within
  // canonical settlement (Komnata Tronowa → Skarbiec, both subs of Yeralden),
  // and child-of-canonical-subloc (Wieża Maga → Pracownia). Multi-subloc
  // emission (AI mentions kilka budynków) does NOT auto-promote — only one
  // is the player's actual destination, and we'd guess wrong.
  // Skip if retry-resolve already anchored the player (aiNameResolved=true).
  if (livingWorldEnabled && locResult.createdSublocs.length === 1 && !aiNameResolved) {
    try {
      const created = locResult.createdSublocs[0];
      let shouldPromote = false;

      if (currentRef) {
        // Normal path: verify parent is in the ancestor chain of current location.
        const parentKey = `${created.row.parentLocationKind}:${created.row.parentLocationId}`;
        const ancestors = await walkUpAncestors(currentRef);
        shouldPromote = ancestors.has(parentKey);
      } else {
        // Wandering: no currentRef — promote unconditionally. The player
        // explicitly walked into this sublocation (AI emitted exactly one).
        shouldPromote = true;
      }

      if (shouldPromote) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            currentLocationName: created.row.name,
            currentLocationKind: created.kind,
            currentLocationId: created.row.id,
            currentX: typeof created.row.regionX === 'number' ? created.row.regionX : null,
            currentY: typeof created.row.regionY === 'number' ? created.row.regionY : null,
          },
        });
        log.info(
          { campaignId, sublocId: created.row.id, sublocName: created.row.name, hadCurrentRef: !!currentRef },
          'Auto-promoted new sublocation to currentLocation',
        );

        await ensureMovementEdge({
          from: currentRef,
          to: { kind: created.kind, id: created.row.id },
          sceneIndex,
          campaignId,
        });
      }
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'auto-promote sublocation → currentLocation failed (non-fatal)');
    }
  }

  // Round B (Phase 4b) — hearsay. `locationMentioned` is an array of
  // `{ locationId, byNpcId }` emitted when a key NPC reveals a location in
  // dialog. Promotes the location to "heard-about" for the player + enforces
  // policy: the NPC must have the location in their knownLocations set, else
  // we reject the mention and log a warning (prevents LLM from leaking
  // hearsay past intent). Zod-validated + array capped at 20 inside the handler.
  if (livingWorldEnabled && Array.isArray(stateChanges.locationMentioned) && stateChanges.locationMentioned.length > 0) {
    await processLocationMentions(campaignId, stateChanges.locationMentioned);
  }


  // Strict world-write gate: dungeon room state flags (WorldLocation.roomMetadata)
  // are no longer written during active campaign play. Dungeon state will be
  // tracked per-campaign in the future.

  if (stateChanges.knowledgeUpdates) {
    await processKnowledgeUpdates(campaignId, stateChanges.knowledgeUpdates);
  }

  if (stateChanges.codexUpdates?.length) {
    await processCodexUpdates(campaignId, stateChanges.codexUpdates);
  }

  // Premium sees quest *names* in its prompt (not ids), so completedQuests
  // and questUpdates[].questId may carry names or hallucinated ids. Route
  // everything through resolveActiveQuest so downstream (audit, world-impact
  // gate, goal reassigner) works against real CampaignQuest.questId values.
  //
  // Ordering matters: resolve completedQuests BEFORE questUpdates. Otherwise
  // an auto-completion during questUpdates leaves only one active quest,
  // and the single-active fallback in completedQuests could wrongly close
  // the wrong quest.
  let totalQuestXpDelta = 0;
  let totalQuestMoney = null;
  if (stateChanges.completedQuests?.length) {
    const { resolvedIds, questXpDelta } = await processQuestStatusChange(
      campaignId, stateChanges.completedQuests, 'completed',
    );
    stateChanges.completedQuests = resolvedIds;
    totalQuestXpDelta += questXpDelta;
  }

  if (stateChanges.failedQuests?.length) {
    const { resolvedIds } = await processQuestStatusChange(
      campaignId, stateChanges.failedQuests, 'failed',
    );
    stateChanges.failedQuests = resolvedIds;
  }

  // ── Oś 5 — diegetic discovery: reveals BEFORE quest updates ────────
  // LLM emituje reveals gdy NPC powiedział o kolejnym kroku. Reveals są
  // sticky i mogą wyprzedzić unlock — locked node z discovered=true jest
  // visible w UI z markerem 🔒. Aplikujemy PRZED questUpdates aby reveal
  // status był spójny w tej samej scenie z `done` na rodzeństwie.
  if (Array.isArray(stateChanges.objectiveReveals) && stateChanges.objectiveReveals.length > 0) {
    const parsed = parseObjectiveReveals(stateChanges.objectiveReveals);
    if (parsed.ok) {
      await processObjectiveReveals(campaignId, parsed.data);
    } else {
      log.warn({ campaignId, issues: parsed.error?.issues?.slice(0, 5) }, 'stateChanges.objectiveReveals failed schema validation — skipped');
    }
  }
  if (Array.isArray(stateChanges.branchGroupReveals) && stateChanges.branchGroupReveals.length > 0) {
    const parsed = parseBranchGroupReveals(stateChanges.branchGroupReveals);
    if (parsed.ok) {
      await processBranchGroupReveals(campaignId, parsed.data);
    } else {
      log.warn({ campaignId, issues: parsed.error?.issues?.slice(0, 5) }, 'stateChanges.branchGroupReveals failed schema validation — skipped');
    }
  }

  if (stateChanges.questUpdates?.length) {
    const parsed = parseQuestUpdates(stateChanges.questUpdates);
    const updates = parsed.ok ? parsed.data : null;
    if (!parsed.ok) {
      log.warn({ campaignId, issues: parsed.error?.issues?.slice(0, 5) }, 'stateChanges.questUpdates failed schema validation — passing through unchanged for legacy compat');
    }
    const { autoCompleted, questXpDelta } = await processQuestObjectiveUpdates(
      campaignId,
      updates || stateChanges.questUpdates,
      stateChanges.completedQuests || [],
    );
    totalQuestXpDelta += questXpDelta;
    if (autoCompleted.length > 0) {
      if (!Array.isArray(stateChanges.completedQuests)) stateChanges.completedQuests = [];
      for (const id of autoCompleted) {
        if (!stateChanges.completedQuests.includes(id)) stateChanges.completedQuests.push(id);
      }
      // Auto-completed quests also earn their completion bonus (XP + money).
      for (const questId of autoCompleted) {
        try {
          const quest = await prisma.campaignQuest.findFirst({
            where: { campaignId, questId },
            include: { objectives: { select: { xpAwarded: true } } },
          });
          if (quest) {
            const rewardXp = quest.reward?.xp || 0;
            if (rewardXp > 0) {
              const sumAwarded = (quest.objectives || []).reduce((s, o) => s + (o.xpAwarded || 0), 0);
              const bonus = Math.max(0, rewardXp - sumAwarded);
              if (bonus > 0) totalQuestXpDelta += bonus;
            }
            const rm = quest.reward?.money;
            if (rm?.gold || rm?.silver || rm?.copper) {
              if (!totalQuestMoney) totalQuestMoney = { gold: 0, silver: 0, copper: 0 };
              totalQuestMoney.gold += rm.gold || 0;
              totalQuestMoney.silver += rm.silver || 0;
              totalQuestMoney.copper += rm.copper || 0;
            }
          }
        } catch (err) {
          log.warn({ err: err?.message, campaignId, questId }, 'Auto-complete bonus XP/money calc failed (non-fatal)');
        }
      }
    }
  }

  if (totalQuestXpDelta > 0) {
    stateChanges.questXpDelta = totalQuestXpDelta;
  }
  if (totalQuestMoney) {
    stateChanges.questMoneyDelta = totalQuestMoney;
  }

  // ── Oś 4 — explicit quest mutations (rare, narrative override) ──────
  if (Array.isArray(stateChanges.questMutations) && stateChanges.questMutations.length > 0) {
    const parsed = parseQuestMutations(stateChanges.questMutations);
    if (parsed.ok) {
      await processQuestMutations(campaignId, parsed.data, sceneIndex);
    } else {
      log.warn({ campaignId, issues: parsed.error?.issues?.slice(0, 5) }, 'stateChanges.questMutations failed schema validation — skipped');
    }
  }

  // ── Oś 4 — reactive quest dynamics evaluation ──────────────────────
  // Na końcu, po wszystkich mutacjach NPC/quest/location: sprawdzamy czy
  // któryś active/stalled quest w tej kampanii ma `failsOn` matched przez
  // zmiany w tej scenie (npcDead, deadline). Mutuje na stalled/failed +
  // appenduje do mutationLog. Best-effort, nie blokuje commit-u sceny.
  if (livingWorldEnabled) {
    try {
      await evaluateQuestGraphForCampaign(campaignId, {
        changedNpcs: Array.isArray(stateChanges.npcs) ? stateChanges.npcs : [],
        sceneIndex,
        sceneGameTime,
      });
    } catch (err) {
      log.warn({ err: err?.message, campaignId }, 'evaluateQuestGraphForCampaign failed (non-fatal)');
    }
  }

  // Board mutations from narrative events (Phase 3 exploration board).
  if (Array.isArray(stateChanges.boardUpdates) && stateChanges.boardUpdates.length > 0) {
    const parsed = parseBoardUpdates(stateChanges.boardUpdates);
    if (parsed.success) {
      await processBoardUpdates(campaignId, parsed.data, { currentRef });
    } else {
      log.warn({ campaignId, issues: parsed.error?.issues?.slice(0, 5) }, 'stateChanges.boardUpdates failed schema validation — skipped');
    }
  }
}
