import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { analyzeIncident, isWorldCorrectionConfirmedApplied } from '../../services/incidentAnalyzer.js';
import { getCampaignCharacterIds } from '../../services/campaignSync.js';
import { loadCharacterSnapshotById, persistCharacterSnapshot } from '../../services/characterRelations.js';
import { applyCharacterStateChanges } from '../../services/characterMutations.js';
import { processStateChanges } from '../../services/sceneGenerator/processStateChanges/index.js';
import { processNpcRenames } from '../../services/sceneGenerator/processStateChanges/npcRenames.js';

const log = childLogger({ module: 'incidents' });

// Window for the dedupe layer: how far back we look for previous incidents
// when checking duplicates and giving the AI prior-resolution context.
const DEDUPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const DEDUPE_FETCH_LIMIT = 10;

const REPORT_INCIDENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['complaint'],
  properties: {
    complaint: { type: 'string', minLength: 10, maxLength: 2000 },
  },
};

const INCIDENTS_PARAMS = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
  },
  required: ['campaignId'],
};

function normalizeComplaint(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '');
}

export async function incidentRoutes(fastify) {
  // POST /campaigns/:campaignId/incidents — report an incident
  fastify.post(
    '/campaigns/:campaignId/incidents',
    {
      schema: { params: INCIDENTS_PARAMS, body: REPORT_INCIDENT_SCHEMA },
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const { campaignId } = request.params;
      const { complaint } = request.body;
      const userId = request.user.id;

      // Verify ownership and load location ref so we can pass currentRef
      // to processStateChanges (parity with scene flow at
      // generateSceneStream.js:608).
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: {
          id: true,
          coreState: true,
          currentLocationKind: true,
          currentLocationId: true,
          currentLocationName: true,
        },
      });
      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      // Load last 5 scenes
      const recentScenes = await prisma.campaignScene.findMany({
        where: { campaignId },
        orderBy: { sceneIndex: 'desc' },
        take: 5,
        select: {
          sceneIndex: true,
          narrative: true,
          chosenAction: true,
          stateChanges: true,
        },
      });

      if (recentScenes.length === 0) {
        return reply.code(400).send({ error: 'No scenes to analyze' });
      }

      // Reverse so they're in chronological order
      recentScenes.reverse();

      const currentSceneIndex = recentScenes[recentScenes.length - 1].sceneIndex;

      // ── Dedupe layer 1 + context fetch for layer 2 ─────────────────────
      const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
      const recentIncidents = await prisma.campaignIncident.findMany({
        where: { campaignId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: DEDUPE_FETCH_LIMIT,
        select: {
          id: true,
          sceneIndex: true,
          playerComplaint: true,
          aiVerdict: true,
          isPlayerRight: true,
          corrections: true,
          worldCorrectionApplied: true,
          createdAt: true,
        },
      });

      const incomingNorm = normalizeComplaint(complaint);
      const textDuplicate = recentIncidents.find(
        (inc) => normalizeComplaint(inc.playerComplaint) === incomingNorm,
      );
      if (textDuplicate && isWorldCorrectionConfirmedApplied(textDuplicate)) {
        log.info(
          { campaignId, userId, previousIncidentId: textDuplicate.id },
          'Incident rejected — exact text duplicate within dedupe window',
        );
        return reply.code(409).send({
          error: 'Duplicate incident — already reported within the last 30 minutes',
          code: 'INCIDENT_DUPLICATE',
          previousIncidentId: textDuplicate.id,
          previousVerdict: textDuplicate.aiVerdict,
          previousIsPlayerRight: textDuplicate.isPlayerRight,
          previousSceneIndex: textDuplicate.sceneIndex,
          createdAt: textDuplicate.createdAt,
        });
      }

      const recentResolvedIncidents = recentIncidents.filter(isWorldCorrectionConfirmedApplied);

      const userApiKeys = await loadUserApiKeys(prisma, userId);

      let analyzed;
      try {
        analyzed = await analyzeIncident({
          recentScenes,
          playerComplaint: complaint,
          campaignState: campaign.coreState,
          recentResolvedIncidents,
          userApiKeys,
          userId,
        });
      } catch (err) {
        const status = err.statusCode || 502;
        return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
      }

      const { verdict, isPlayerRight, technicalDetails, stateChanges, correctionSummary, narrativeComment } = analyzed;

      // ── Apply corrections server-side when isPlayerRight ────────────────
      let appliedStateChanges = false;
      let appliedRenames = [];
      let activeCharacterId = null;
      let storedCorrections = null;

      if (isPlayerRight && stateChanges) {
        try {
          const characterIds = await getCampaignCharacterIds(campaignId);
          activeCharacterId = characterIds[0] || null;

          let nextCharacter = null;
          if (activeCharacterId) {
            const activeCharacter = await loadCharacterSnapshotById(activeCharacterId);
            if (activeCharacter) {
              nextCharacter = applyCharacterStateChanges(activeCharacter, stateChanges);
              if (stateChanges.rewardAttributePoint === 1) {
                nextCharacter = {
                  ...nextCharacter,
                  attributePoints: (nextCharacter.attributePoints || 0) + 1,
                };
              }
            }
          }

          storedCorrections = { stateChanges, summary: correctionSummary || [] };

          const incidentRow = await prisma.$transaction(async (tx) => {
            const created = await tx.campaignIncident.create({
              data: {
                campaignId,
                userId,
                sceneIndex: currentSceneIndex,
                playerComplaint: complaint,
                aiVerdict: verdict,
                isPlayerRight: true,
                technicalDetails: technicalDetails || null,
                corrections: storedCorrections,
                narrativeComment: narrativeComment || null,
              },
            });
            if (activeCharacterId && nextCharacter) {
              await persistCharacterSnapshot(activeCharacterId, nextCharacter, tx);
            }
            return created;
          });

          appliedStateChanges = true;

          // Outside the tx — best-effort, parity with postSceneWork.
          // processStateChanges issues its own non-tx writes (embeddings,
          // fame, world events) so it cannot share the snapshot tx.
          if (Array.isArray(stateChanges.npcRename) && stateChanges.npcRename.length > 0) {
            try {
              appliedRenames = await processNpcRenames(campaignId, stateChanges.npcRename);
            } catch (err) {
              log.warn({ err: err?.message, campaignId, incidentId: incidentRow.id }, 'processNpcRenames failed (non-fatal)');
            }
          }

          let worldCorrectionApplied = false;
          try {
            const currentRef = (campaign.currentLocationKind && campaign.currentLocationId)
              ? { kind: campaign.currentLocationKind, id: campaign.currentLocationId, name: campaign.currentLocationName }
              : null;
            await processStateChanges(campaignId, stateChanges, {
              prevLoc: campaign.currentLocationName || null,
              sceneIndex: currentSceneIndex,
              currentRef,
            });
            worldCorrectionApplied = true;
            await prisma.campaignIncident.update({
              where: { id: incidentRow.id },
              data: { worldCorrectionApplied: true },
            });
          } catch (err) {
            log.warn(
              { err: err?.message, campaignId, incidentId: incidentRow.id },
              'processStateChanges failed for incident correction (non-fatal — character snapshot already persisted)',
            );
            try {
              await prisma.campaignIncident.update({
                where: { id: incidentRow.id },
                data: { worldCorrectionApplied: false },
              });
            } catch (updErr) {
              log.warn({ err: updErr?.message, campaignId, incidentId: incidentRow.id }, 'worldCorrectionApplied=false update failed');
            }
          }

          return {
            id: incidentRow.id,
            sceneIndex: incidentRow.sceneIndex,
            playerComplaint: incidentRow.playerComplaint,
            aiVerdict: incidentRow.aiVerdict,
            isPlayerRight: true,
            technicalDetails: incidentRow.technicalDetails,
            corrections: storedCorrections,
            correctionSummary: correctionSummary || [],
            narrativeComment: incidentRow.narrativeComment,
            appliedStateChanges,
            renamedNpcs: appliedRenames,
            worldCorrectionApplied,
            createdAt: incidentRow.createdAt,
          };
        } catch (err) {
          log.error(
            { err: err?.message, campaignId, userId },
            'Incident apply failed — character snapshot persist threw, incident NOT recorded',
          );
          return reply.code(502).send({
            error: 'Verdict reached but state apply failed; correction was not recorded',
            code: 'INCIDENT_APPLY_FAILED',
            verdict,
            technicalDetails,
          });
        }
      }

      // ── isPlayerRight === false (or stateChanges null after dedupe layer 3) ──
      const incident = await prisma.campaignIncident.create({
        data: {
          campaignId,
          userId,
          sceneIndex: currentSceneIndex,
          playerComplaint: complaint,
          aiVerdict: verdict,
          isPlayerRight: false,
          technicalDetails: technicalDetails || null,
          corrections: undefined,
          narrativeComment: null,
        },
      });

      // Wrong complaint → character slips next scene (only for genuine
      // disagreements, not dedupe rejections — dedupe gives no slip).
      if (!analyzed.dedupedAgainst) {
        try {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { pendingSlip: complaint },
          });
        } catch (err) {
          log.warn({ err: err?.message, campaignId }, 'pendingSlip write failed (non-fatal)');
        }
      }

      return {
        id: incident.id,
        sceneIndex: incident.sceneIndex,
        playerComplaint: incident.playerComplaint,
        aiVerdict: incident.aiVerdict,
        isPlayerRight: false,
        technicalDetails: incident.technicalDetails,
        corrections: null,
        correctionSummary: null,
        narrativeComment: null,
        appliedStateChanges: false,
        dedupedAgainst: analyzed.dedupedAgainst || null,
        createdAt: incident.createdAt,
      };
    },
  );

  // GET /campaigns/:campaignId/incidents — list past incidents
  fastify.get(
    '/campaigns/:campaignId/incidents',
    { schema: { params: INCIDENTS_PARAMS } },
    async (request, reply) => {
      const { campaignId } = request.params;
      const userId = request.user.id;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: { id: true },
      });
      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      const incidents = await prisma.campaignIncident.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          sceneIndex: true,
          playerComplaint: true,
          aiVerdict: true,
          isPlayerRight: true,
          technicalDetails: true,
          corrections: true,
          narrativeComment: true,
          worldCorrectionApplied: true,
          createdAt: true,
        },
      });

      return { incidents };
    },
  );
}
