import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { analyzeEnchantItem } from '../../services/enchantItemAnalyzer.js';
import { getCampaignCharacterIds } from '../../services/campaignSync.js';
import { loadCharacterSnapshotById } from '../../services/characterRelations.js';
import { isLuckySuccess } from '../../../../shared/domain/luck.js';
import {
  itemPowerScore,
  bumpRarity,
  MAX_POWER_SCORE,
} from '../../../../shared/domain/itemKeys.js';

const log = childLogger({ module: 'enchantItem' });

// Same DC as combine — enchant is its mirror twin, only mana cost differs.
const ENCHANT_DC = 30;
const ENCHANT_BUMP_CAP = 5;

const ENCHANT_PARAMS = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
  },
  required: ['campaignId'],
};

const ENCHANT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId', 'spellName', 'successRoll', 'powerRoll'],
  properties: {
    itemId: { type: 'string', minLength: 1, maxLength: 200 },
    spellName: { type: 'string', minLength: 1, maxLength: 200 },
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
 * For enchant we want **strictly greater** power, so we keep bumping rarity
 * until the result beats the original. Cap at `ENCHANT_BUMP_CAP`; if we hit
 * legendary the bump no-ops once we reach it.
 */
function enforceStrictGreater(resultItem, originalPower) {
  const target = Math.min(originalPower + 1, MAX_POWER_SCORE);
  let attempts = 0;
  let next = { ...resultItem };
  let currentPower = itemPowerScore(next);
  while (currentPower < target && attempts < ENCHANT_BUMP_CAP) {
    const bumped = bumpRarity(next.rarity);
    if (bumped === next.rarity) break;
    next = { ...next, rarity: bumped };
    currentPower = itemPowerScore(next);
    attempts += 1;
  }
  return { item: next, finalPower: currentPower, target, bumpAttempts: attempts };
}

/**
 * `Alchemia` skill bonus + intelligence + luck check, vs DC 30. Distinct from
 * combine (Rzemioslo) because enchant is fundamentally an alchemy/magic act.
 */
function buildCheckContext(character, successRoll) {
  const attrs = character?.attributes || {};
  const intelligence = clampInt(attrs.inteligencja ?? 0, 0, 50);
  const luck = clampInt(attrs.szczescie ?? 0, 0, 50);
  const skills = character?.skills || {};
  const skill = clampInt(skills.Alchemia?.level ?? 0, 0, 25);
  return {
    intelligence,
    luck,
    skill,
    sum: successRoll + intelligence + skill,
    threshold: ENCHANT_DC,
  };
}

/**
 * Lookup spell by name across the union of (known custom spells, character
 * known list, baseline starters). Returns at minimum { name, school?, manaCost? }
 * or null when not found.
 */
async function resolveSpell(character, spellName, log) {
  const knownArr = Array.isArray(character?.spells?.known) ? character.spells.known : [];
  const known = knownArr.find((s) => s?.name && String(s.name).toLowerCase() === spellName.toLowerCase()) || null;
  if (known) return known;

  try {
    const row = await prisma.customSpell.findUnique({
      where: { name: spellName },
      select: { name: true, school: true, description: true, longDescription: true, manaCost: true, icon: true },
    });
    if (row) return row;
  } catch (err) {
    log.warn({ err: err?.message, spellName }, 'enchant: customSpell lookup failed');
  }
  return null;
}

function buildLineageEntry(src, spellName, kind = 'enchant_source') {
  const props = src.props || {};
  return {
    itemKey: src.itemKey,
    name: src.displayName || props.name || 'unnamed',
    rarity: (props.rarity || src.rarity || 'common').toLowerCase(),
    kind,
    ...(spellName ? { spell: spellName } : {}),
  };
}

export async function enchantItemRoutes(fastify) {
  fastify.post(
    '/campaigns/:campaignId/enchant-item',
    {
      schema: { params: ENCHANT_PARAMS, body: ENCHANT_BODY },
      config: { rateLimit: { max: 6, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const { campaignId } = request.params;
      const { itemId, spellName, intent = '', successRoll, powerRoll, characterId: requestedCharacterId } = request.body;
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

      const sourceRow = await prisma.characterInventoryItem.findFirst({
        where: { characterId: activeCharacterId, itemKey: itemId, hidden: false },
      });
      if (!sourceRow) {
        return reply.code(404).send({ error: 'Item not found in inventory', code: 'ENCHANT_SOURCE_MISSING' });
      }
      if ((sourceRow.quantity || 1) > 1) {
        return reply.code(400).send({
          error: 'Stacked items must be split before enchanting',
          code: 'ENCHANT_STACKED',
        });
      }
      if (sourceRow.props?.questItem === true) {
        return reply.code(403).send({
          error: 'Cannot enchant quest items',
          code: 'ENCHANT_QUEST_ITEM',
        });
      }
      // Mana crystals already have bespoke use semantics — refuse to enchant.
      if (sourceRow.props?.manaCrystal === true || sourceRow.props?.type === 'mana_crystal') {
        return reply.code(400).send({
          error: 'Cannot enchant a mana crystal',
          code: 'ENCHANT_MANA_CRYSTAL',
        });
      }

      const activeCharacter = await loadCharacterSnapshotById(activeCharacterId);
      if (!activeCharacter) return reply.code(404).send({ error: 'Character not found' });

      const spell = await resolveSpell(activeCharacter, spellName, log);
      if (!spell) {
        return reply.code(404).send({
          error: 'Spell not known by character',
          code: 'ENCHANT_SPELL_UNKNOWN',
        });
      }

      const manaCost = clampInt(spell.manaCost ?? 2, 1, 50);
      const currentMana = clampInt(activeCharacter.mana?.current, 0, 9999);
      if (currentMana < manaCost) {
        return reply.code(400).send({
          error: 'Not enough mana',
          code: 'ENCHANT_NO_MANA',
          required: manaCost,
          available: currentMana,
        });
      }

      const checkCtx = buildCheckContext(activeCharacter, successRoll);
      const luckRoll = Math.floor(Math.random() * 100) + 1;
      const luckySuccess = isLuckySuccess(checkCtx.luck, luckRoll);
      const isCritFail = successRoll === 50;
      const isSuccess = !isCritFail && (luckySuccess || checkCtx.sum >= checkCtx.threshold);

      // Equipment scrub for both destroyed (critFail) and consumed-on-enchant
      // (success) paths. Mirrors discard / combine.
      const scrubEquipment = async (tx, itemKey) => {
        const equipUpdate = {};
        if (activeCharacter.equipped?.mainHand === itemKey) equipUpdate.equippedMainHand = null;
        if (activeCharacter.equipped?.offHand === itemKey) equipUpdate.equippedOffHand = null;
        if (activeCharacter.equipped?.armour === itemKey) equipUpdate.equippedArmour = null;
        if (Object.keys(equipUpdate).length > 0) {
          await tx.character.update({ where: { id: activeCharacterId }, data: equipUpdate });
        }
      };

      // Mana is consumed in ALL outcomes (success + fail + critFail) — the spell
      // already left the caster's hands. Mana lives on Character.mana (JSONB),
      // so each outcome path writes the same delta inline via this helper.
      const nextMana = {
        current: Math.max(0, currentMana - manaCost),
        max: activeCharacter.mana?.max ?? currentMana,
      };
      const applyManaToScalars = async (tx) => {
        await tx.character.update({
          where: { id: activeCharacterId },
          data: { mana: nextMana },
        });
      };

      // ── CRIT FAIL: item destroyed, mana paid ──
      if (isCritFail) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.characterInventoryItem.update({
              where: { characterId_itemKey: { characterId: activeCharacterId, itemKey: itemId } },
              data: { hidden: true, hiddenReason: 'destroyed', hiddenAt: new Date() },
            });
            await scrubEquipment(tx, itemId);
            await applyManaToScalars(tx);
          });
        } catch (err) {
          log.error({ err: err?.message }, 'enchant crit-fail destroy failed');
          return reply.code(500).send({ error: 'Failed to apply crit-fail', code: 'ENCHANT_PERSIST_FAILED' });
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
          manaPaid: manaCost,
          spellName: spell.name,
          result: null,
          verdict: `Krytyczna porażka! Magia wymyka się spod kontroli — ${sourceRow.displayName} eksploduje w drobny mak, a mana (${manaCost}) wyparowuje.`,
          character: snapshot,
        };
      }

      // ── FAIL: mana paid, item intact ──
      if (!isSuccess) {
        try {
          await prisma.$transaction(async (tx) => {
            await applyManaToScalars(tx);
          });
        } catch (err) {
          log.error({ err: err?.message }, 'enchant fail mana persist failed');
          return reply.code(500).send({ error: 'Failed to apply mana cost', code: 'ENCHANT_PERSIST_FAILED' });
        }
        const snapshot = await loadCharacterSnapshotById(activeCharacterId);
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
          manaPaid: manaCost,
          spellName: spell.name,
          result: null,
          verdict: `Zaklęcie rozprasza się bez wiązania. Przedmiot pozostaje nietknięty, ale mana (${manaCost}) jest stracona. Potrzebujesz sumy ${checkCtx.threshold}, masz ${checkCtx.sum}.`,
          character: snapshot,
        };
      }

      // ── SUCCESS: analyzer + strict-greater enforcement + persist ──
      const userApiKeys = await loadUserApiKeys(prisma, userId);

      let analyzed;
      try {
        analyzed = await analyzeEnchantItem({
          sourceItem: sourceRow,
          spell,
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

      const originalPower = itemPowerScore({
        ...sourceRow,
        rarity: sourceRow.props?.rarity || sourceRow.rarity || 'common',
        attackModes: sourceRow.props?.attackModes || null,
      });
      const { item: floored, finalPower, target, bumpAttempts } = enforceStrictGreater(analyzed, originalPower);
      if (finalPower < target) {
        log.warn(
          { originalPower, finalPower, bumpAttempts, name: floored.name },
          'enchant result could not exceed original power even at legendary — accepting soft',
        );
      }

      const composedFrom = [buildLineageEntry(sourceRow, spell.name, 'enchant_source')];
      // Preserve prior enchantment chain so multi-enchanted items stack chips.
      const priorEnchantments = Array.isArray(sourceRow.props?.enchantments)
        ? sourceRow.props.enchantments
        : [];
      const enchantments = [
        ...priorEnchantments,
        {
          spell: spell.name,
          school: spell.school || null,
          addedAt: new Date().toISOString(),
          effect: floored.enchantEffect || null,
          flavor: floored.narrativeFlavor || null,
        },
      ];

      const newKey = makeItemKey();
      const newProps = {
        type: floored.type || sourceRow.props?.type || 'misc',
        rarity: floored.rarity || 'uncommon',
        description: floored.description,
        ...(floored.longDescription ? { longDescription: floored.longDescription } : {}),
        ...(floored.icon ? { icon: floored.icon } : {}),
        ...(floored.attackModes ? { attackModes: floored.attackModes } : {}),
        enchantments,
      };

      try {
        await prisma.$transaction(async (tx) => {
          await tx.characterInventoryItem.update({
            where: { characterId_itemKey: { characterId: activeCharacterId, itemKey: itemId } },
            data: { hidden: true, hiddenReason: 'enchanted_into', hiddenAt: new Date() },
          });
          await scrubEquipment(tx, itemId);
          await tx.characterInventoryItem.create({
            data: {
              characterId: activeCharacterId,
              itemKey: newKey,
              displayName: floored.name,
              baseType: floored.baseType || sourceRow.baseType || null,
              quantity: 1,
              props: newProps,
              imageUrl: sourceRow.imageUrl || null,
              composedFrom,
            },
          });
          await applyManaToScalars(tx);
        });
      } catch (err) {
        log.error({ err: err?.message }, 'enchant success persist failed');
        return reply.code(500).send({ error: 'Failed to persist enchanted item', code: 'ENCHANT_PERSIST_FAILED' });
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
        originalPower,
        finalPower,
        manaPaid: manaCost,
        spellName: spell.name,
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
          imageUrl: sourceRow.imageUrl || null,
          enchantEffect: floored.enchantEffect,
          narrativeFlavor: floored.narrativeFlavor,
          composedFrom,
        },
        verdict: luckySuccess && checkCtx.sum < checkCtx.threshold
          ? `Czyste szczęście! Twój rzut (${successRoll}) by nie wystarczył, ale szczęście Cię ratuje — zaklęcie ${spell.name} wiąże się z przedmiotem.`
          : `Zaklęcie ${spell.name} wiąże się z przedmiotem. ${floored.narrativeFlavor}`,
        character: snapshot,
      };
    },
  );
}

export const __testables = { enforceStrictGreater, buildCheckContext };
