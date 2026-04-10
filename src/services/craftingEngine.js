/**
 * RPGon Crafting Engine — deterministic item crafting via Rzemiosło skill.
 * No AI involved — pure d50 skill checks.
 */

import { resolveSkillCheck } from './mechanics/skillCheck.js';
import { DIFFICULTY_THRESHOLDS } from '../data/rpgSystem.js';

// ── Outcome Tiers ──

export const CRAFTING_TIERS = {
  CRITICAL_SUCCESS: 'criticalSuccess', // margin >= 15
  SUCCESS: 'success',                   // margin >= 0
  PARTIAL_FAILURE: 'partialFailure',    // margin >= -10
  CRITICAL_FAILURE: 'criticalFailure',  // margin < -10
};

const MARGIN_THRESHOLDS = {
  criticalSuccess: 15,
  success: 0,
  partialFailure: -10,
};

// ── Recipe Availability ──

/**
 * Check which recipes the character can craft given their material bag and skills.
 * @param {Array} materialBag - character.materialBag (stacked materials)
 * @param {object} skills - character.skills
 * @param {Array} allRecipes - CRAFTING_RECIPES array
 * @returns {Array} enriched recipes with canCraft flag and material status
 */
export function getAvailableRecipes(materialBag, skills, allRecipes) {
  const inventoryCounts = countInventoryItems(materialBag);
  const rzemiosloLevel = getSkillLevel(skills, 'Rzemioslo');

  return allRecipes.map((recipe) => {
    const materialStatus = recipe.requiredMaterials.map((req) => {
      const have = inventoryCounts[req.name.toLowerCase()] || 0;
      return {
        name: req.name,
        need: req.quantity,
        have,
        satisfied: have >= req.quantity,
      };
    });

    const canCraft = materialStatus.every((m) => m.satisfied);
    const hasSkill = rzemiosloLevel > 0;

    return {
      ...recipe,
      materialStatus,
      canCraft: canCraft && hasSkill,
      missingMaterials: materialStatus.filter((m) => !m.satisfied),
      skillLevel: rzemiosloLevel,
    };
  });
}

/**
 * Resolve a crafting attempt.
 * @param {object} character - player character
 * @param {object} recipe - crafting recipe
 * @param {number} [currentMomentum=0]
 * @returns {object} { success, tier, roll details, resultItem?, materialsConsumed[], stateChanges }
 */
export function resolveCrafting(character, recipe, currentMomentum = 0) {
  const skillCheck = resolveSkillCheck({
    character,
    actionText: `craft ${recipe.name}`,
    currentMomentum,
    actionContext: {
      attribute: 'inteligencja',
      suggestedSkills: ['Rzemioslo'],
      difficulty: recipe.difficulty || 'medium',
    },
    difficultyOverride: recipe.difficulty || 'medium',
  });

  if (!skillCheck) {
    return {
      success: false,
      tier: CRAFTING_TIERS.CRITICAL_FAILURE,
      skillCheck: null,
      resultItem: null,
      materialsConsumed: recipe.requiredMaterials,
      stateChanges: buildStateChanges(recipe, CRAFTING_TIERS.CRITICAL_FAILURE, null),
    };
  }

  const tier = determineTier(skillCheck.margin);
  const resultItem = buildResultItem(recipe, tier);
  const materialsConsumed = determineMaterialsConsumed(recipe, tier);

  return {
    success: tier === CRAFTING_TIERS.CRITICAL_SUCCESS || tier === CRAFTING_TIERS.SUCCESS,
    tier,
    skillCheck,
    resultItem,
    materialsConsumed,
    stateChanges: buildStateChanges(recipe, tier, resultItem),
  };
}

// ── Helpers ──

function determineTier(margin) {
  if (margin >= MARGIN_THRESHOLDS.criticalSuccess) return CRAFTING_TIERS.CRITICAL_SUCCESS;
  if (margin >= MARGIN_THRESHOLDS.success) return CRAFTING_TIERS.SUCCESS;
  if (margin >= MARGIN_THRESHOLDS.partialFailure) return CRAFTING_TIERS.PARTIAL_FAILURE;
  return CRAFTING_TIERS.CRITICAL_FAILURE;
}

function buildResultItem(recipe, tier) {
  if (tier === CRAFTING_TIERS.PARTIAL_FAILURE || tier === CRAFTING_TIERS.CRITICAL_FAILURE) {
    return null;
  }

  const item = {
    id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: recipe.resultItem.name,
    type: recipe.resultItem.type || 'misc',
    rarity: recipe.resultItem.rarity || 'common',
  };

  if (tier === CRAFTING_TIERS.CRITICAL_SUCCESS) {
    item.quality = 'superior';
    // Bump rarity one tier on critical success
    const rarityBump = { common: 'uncommon', uncommon: 'rare', rare: 'epic' };
    item.rarity = rarityBump[item.rarity] || item.rarity;
  }

  return item;
}

function determineMaterialsConsumed(recipe, tier) {
  switch (tier) {
    case CRAFTING_TIERS.CRITICAL_SUCCESS:
    case CRAFTING_TIERS.SUCCESS:
      return recipe.requiredMaterials; // all consumed
    case CRAFTING_TIERS.PARTIAL_FAILURE:
      // 50% of materials lost (round up)
      return recipe.requiredMaterials.map((m) => ({
        ...m,
        quantity: Math.ceil(m.quantity / 2),
      }));
    case CRAFTING_TIERS.CRITICAL_FAILURE:
      return recipe.requiredMaterials; // all lost
    default:
      return recipe.requiredMaterials;
  }
}

function buildStateChanges(recipe, tier, resultItem) {
  const changes = {};

  // Remove consumed materials from inventory
  // Materials are matched by name (case-insensitive)
  const consumed = determineMaterialsConsumed(recipe, tier);
  changes.removeItemsByName = consumed.map((m) => ({ name: m.name, quantity: m.quantity }));

  // Add crafted item on success
  if (resultItem) {
    changes.newItems = [resultItem];
  }

  // Skill XP (learn by doing)
  const diffKey = recipe.difficulty || 'medium';
  const baseXp = tier === CRAFTING_TIERS.CRITICAL_SUCCESS ? 3 :
    tier === CRAFTING_TIERS.SUCCESS ? 2 :
      tier === CRAFTING_TIERS.PARTIAL_FAILURE ? 1 : 0;
  const diffMultiplier = { easy: 0.5, medium: 1, hard: 1.5, veryHard: 2, extreme: 3 };
  changes.skillProgress = {
    Rzemioslo: Math.round(baseXp * (diffMultiplier[diffKey] || 1)),
  };

  return changes;
}

function countInventoryItems(inventory) {
  const counts = {};
  for (const item of inventory || []) {
    const key = (item.name || '').toLowerCase();
    const qty = item.quantity || 1;
    counts[key] = (counts[key] || 0) + qty;
  }
  return counts;
}

function getSkillLevel(skills, skillName) {
  const entry = skills?.[skillName];
  if (!entry) return 0;
  return typeof entry === 'object' ? (entry.level || 0) : entry;
}

export { DIFFICULTY_THRESHOLDS };
