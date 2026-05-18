import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { analyzeItemCombination } from '../../services/combineItemsAnalyzer.js';
import { getCampaignCharacterIds } from '../../services/campaignSync.js';
import { loadCharacterSnapshotById } from '../../services/characterRelations.js';
import { isLuckySuccess } from '../../../../shared/domain/luck.js';
import {
  itemPowerScore,
  bumpRarity,
  MAX_POWER_SCORE,
} from '../../../../shared/domain/itemKeys.js';

const log = childLogger({ module: 'combineItems' });

// Threshold sums for the d50 roll: base 30 (combine is more accessible than
// spell invention's 51). Crafting skill + INT + circumstance push it.
const COMBINE_DC = 30;
const COMBINE_BUMP_CAP = 5;

const COMBINE_PARAMS = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
  },
  required: ['campaignId'],
};

const COMBINE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceIds', 'successRoll', 'powerRoll'],
  properties: {
    sourceIds: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'string', minLength: 1, maxLength: 200 },
    },
    intent: { type: 'string', maxLength: 500 },
    successRoll: { type: 'integer', minimum: 1, maximum: 50 },
    powerRoll: { type: 'integer', minimum: 1, maximum: 50 },
    characterId: { type: 'string', format: 'uuid' },
  },
};

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function makeItemKey() {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Bump the result's rarity up to `COMBINE_BUMP_CAP` times until its power
 * score reaches the sum of source powers. Cap at MAX_POWER_SCORE — at
 * legendary tier the bump effectively no-ops once the cap is reached.
 */
function enforcePowerFloor(resultItem, sumPower) {
  const target = Math.min(sumPower, MAX_POWER_SCORE);
  let attempts = 0;
  let next = { ...resultItem };
  let currentPower = itemPowerScore(next);
  while (currentPower < target && attempts < COMBINE_BUMP_CAP) {
    const bumped = bumpRarity(next.rarity);
    if (bumped === next.rarity) break;
    next = { ...next, rarity: bumped };
    currentPower = itemPowerScore(next);
    attempts += 1;
  }
  return { item: next, finalPower: currentPower, target, bumpAttempts: attempts };
}

function buildLineageEntry(src, kind = 'combine_source') {
  const props = src.props || {};
  return {
    itemKey: src.itemKey,
    name: src.displayName || props.name || 'unnamed',
    rarity: (props.rarity || src.rarity || 'common').toLowerCase(),
    kind,
  };
}

/**
 * `Rzemioslo` skill bonus + intelligence + luck check, vs DC 30.
 * Mirrors the spellInvention shape so the FE result UI can reuse the same
 * "sum / threshold / luck" layout.
 */
function buildCheckContext(character, successRoll) {
  const attrs = character?.attributes || {};
  const intelligence = clampInt(attrs.inteligencja ?? 0, 0, 50);
  const luck = clampInt(attrs.szczescie ?? 0, 0, 50);
  const skills = character?.skills || {};
  const skill = clampInt(skills.Rzemioslo?.level ?? 0, 0, 25);
  return {
    intelligence,
    luck,
    skill,
    sum: successRoll + intelligence + skill,
    threshold: COMBINE_DC,
  };
}

export async function combineItemsRoutes(fastify) {
  fastify.post(
    '/campaigns/:campaignId/combine-items',
    {
      schema: { params: COMBINE_PARAMS, body: COMBINE_BODY },
      config: { rateLimit: { max: 6, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const { campaignId } = request.params;
      const { sourceIds, intent = '', successRoll, powerRoll, characterId: requestedCharacterId } = request.body;
      const userId = request.user.id;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: { id: true },
      });
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });

      const characterIds = await getCampaignCharacterIds(campaignId);
      let activeCharacterId = characterIds[0] || null;
      if (requestedCharacterId) {
        if (!characterIds.includes(requestedCharacterId)) {
          return reply.code(400).send({ error: 'Character does not belong to this campaign' });
        }
        activeCharacterId = requestedCharacterId;
      }
      if (!activeCharacterId) {
        return reply.code(400).send({ error: 'No active character in campaign' });
      }

      if (sourceIds[0] === sourceIds[1]) {
        return reply.code(400).send({ error: 'Cannot combine an item with itself', code: 'COMBINE_SELF' });
      }

      // Load both source rows directly (FE may have stale view). Both must be
      // visible (hidden=false), belong to this character, and exist.
      const sourceRows = await prisma.characterInventoryItem.findMany({
        where: {
          characterId: activeCharacterId,
          itemKey: { in: sourceIds },
          hidden: false,
        },
      });
      if (sourceRows.length !== 2) {
        return reply.code(404).send({ error: 'Source items not found in inventory', code: 'COMBINE_SOURCES_MISSING' });
      }
      // Reject combining stacks > 1 — v1 punts on stack-split UX; the user must
      // separate the stack first. Materials always live in materialBag (which
      // never lands in CharacterInventoryItem), so this only catches duplicate
      // weapon-style rows that managed to stack qty>1.
      for (const row of sourceRows) {
        if ((row.quantity || 1) > 1) {
          return reply.code(400).send({
            error: 'Stacked items must be split before combining',
            code: 'COMBINE_STACKED',
          });
        }
        if (row.props?.questItem === true) {
          return reply.code(403).send({
            error: 'Cannot combine quest items',
            code: 'COMBINE_QUEST_ITEM',
          });
        }
      }

      const activeCharacter = await loadCharacterSnapshotById(activeCharacterId);
      if (!activeCharacter) return reply.code(404).send({ error: 'Character not found' });

      const checkCtx = buildCheckContext(activeCharacter, successRoll);
      const luckRoll = Math.floor(Math.random() * 100) + 1;
      const luckySuccess = isLuckySuccess(checkCtx.luck, luckRoll);
      const isCritFail = successRoll === 1;
      const isSuccess = !isCritFail && (luckySuccess || checkCtx.sum >= checkCtx.threshold);

      // Equip slot scrub helper — both for crit-fail (destroy) and success
      // (consume sources). Re-uses the discard pattern.
      const scrubEquipment = async (tx, itemKeys) => {
        const keys = new Set(itemKeys);
        const equipUpdate = {};
        if (keys.has(activeCharacter.equipped?.mainHand)) equipUpdate.equippedMainHand = null;
        if (keys.has(activeCharacter.equipped?.offHand)) equipUpdate.equippedOffHand = null;
        if (keys.has(activeCharacter.equipped?.armour)) equipUpdate.equippedArmour = null;
        if (Object.keys(equipUpdate).length > 0) {
          await tx.character.update({ where: { id: activeCharacterId }, data: equipUpdate });
        }
      };

      // ── CRIT FAIL: both sources destroyed ──
      if (isCritFail) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.characterInventoryItem.updateMany({
              where: {
                characterId: activeCharacterId,
                itemKey: { in: sourceIds },
                hidden: false,
              },
              data: { hidden: true, hiddenReason: 'destroyed', hiddenAt: new Date() },
            });
            await scrubEquipment(tx, sourceIds);
          });
        } catch (err) {
          log.error({ err: err?.message }, 'combine crit-fail destroy failed');
          return reply.code(500).send({ error: 'Failed to apply crit-fail', code: 'COMBINE_PERSIST_FAILED' });
        }

        const snapshot = await loadCharacterSnapshotById(activeCharacterId);
        return {
          outcome: 'crit_fail',
          threshold: checkCtx.threshold,
          sum: checkCtx.sum,
          intelligence: checkCtx.intelligence,
          luck: checkCtx.luck,
          skill: checkCtx.skill,
          successRoll,
          powerRoll,
          luckRoll,
          luckySuccess: false,
          result: null,
          verdict: `Krytyczna porażka! Próba łączenia kończy się katastrofą — oba przedmioty (${sourceRows[0].displayName}, ${sourceRows[1].displayName}) zostają zniszczone.`,
          character: snapshot,
        };
      }

      // ── FAIL: no-op ──
      if (!isSuccess) {
        return {
          outcome: 'fail_roll',
          threshold: checkCtx.threshold,
          sum: checkCtx.sum,
          intelligence: checkCtx.intelligence,
          luck: checkCtx.luck,
          skill: checkCtx.skill,
          successRoll,
          powerRoll,
          luckRoll,
          luckySuccess: false,
          result: null,
          verdict: `Próba kończy się fiaskiem — energia rozprasza się, składniki pozostają nietknięte. Potrzebujesz sumy ${checkCtx.threshold}, masz ${checkCtx.sum}.`,
          character: activeCharacter,
        };
      }

      // ── SUCCESS: call the analyzer + enforce power floor + persist ──
      const userApiKeys = await loadUserApiKeys(prisma, userId);

      let analyzed;
      try {
        analyzed = await analyzeItemCombination({
          sourceItems: sourceRows,
          intent: intent.trim(),
          successRoll,
          powerRoll,
          character: activeCharacter,
          userApiKeys,
          userId,
        });
      } catch (err) {
        const status = err.statusCode || 502;
        return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
      }

      const sourcePowers = sourceRows.map((row) => itemPowerScore({
        ...row,
        rarity: row.props?.rarity || row.rarity || 'common',
        attackModes: row.props?.attackModes || null,
      }));
      const sumPower = sourcePowers.reduce((acc, p) => acc + p, 0);
      const { item: floored, finalPower, target, bumpAttempts } = enforcePowerFloor(analyzed, sumPower);
      if (finalPower < target) {
        log.warn(
          { sumPower, finalPower, bumpAttempts, name: floored.name },
          'combine result could not meet power floor even at legendary — accepting soft',
        );
      }

      const composedFrom = sourceRows.map((row) => buildLineageEntry(row, 'combine_source'));
      const newKey = makeItemKey();
      const newProps = {
        type: floored.type || 'misc',
        rarity: floored.rarity || 'uncommon',
        description: floored.description,
        ...(floored.longDescription ? { longDescription: floored.longDescription } : {}),
        ...(floored.icon ? { icon: floored.icon } : {}),
        ...(floored.attackModes ? { attackModes: floored.attackModes } : {}),
      };

      try {
        await prisma.$transaction(async (tx) => {
          await tx.characterInventoryItem.updateMany({
            where: {
              characterId: activeCharacterId,
              itemKey: { in: sourceIds },
              hidden: false,
            },
            data: { hidden: true, hiddenReason: 'combined', hiddenAt: new Date() },
          });
          await scrubEquipment(tx, sourceIds);
          await tx.characterInventoryItem.create({
            data: {
              characterId: activeCharacterId,
              itemKey: newKey,
              displayName: floored.name,
              baseType: floored.baseType || null,
              quantity: 1,
              props: newProps,
              imageUrl: null,
              composedFrom,
            },
          });
        });
      } catch (err) {
        log.error({ err: err?.message }, 'combine success persist failed');
        return reply.code(500).send({ error: 'Failed to persist combined item', code: 'COMBINE_PERSIST_FAILED' });
      }

      const snapshot = await loadCharacterSnapshotById(activeCharacterId);

      return {
        outcome: 'success',
        threshold: checkCtx.threshold,
        sum: checkCtx.sum,
        intelligence: checkCtx.intelligence,
        luck: checkCtx.luck,
        skill: checkCtx.skill,
        successRoll,
        powerRoll,
        luckRoll,
        luckySuccess,
        bumpAttempts,
        sumPower,
        finalPower,
        result: {
          id: newKey,
          name: floored.name,
          rarity: floored.rarity,
          baseType: floored.baseType,
          type: newProps.type,
          description: floored.description,
          longDescription: floored.longDescription,
          attackModes: floored.attackModes,
          icon: floored.icon,
          imageUrl: null,
          composedFrom,
        },
        verdict: luckySuccess && checkCtx.sum < checkCtx.threshold
          ? `Czyste szczęście! Twój rzut (${successRoll}) by nie wystarczył, ale szczęście Cię ratuje — łączenie się udaje.`
          : `Łączenie się udaje. Sumarycznie zebrałeś ${checkCtx.sum} przeciwko progowi ${checkCtx.threshold}.`,
        character: snapshot,
      };
    },
  );
}

// Helpers exported for unit tests if we add them later.
export const __testables = { enforcePowerFloor, buildCheckContext };
