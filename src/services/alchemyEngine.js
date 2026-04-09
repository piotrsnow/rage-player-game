/**
 * RPGon Alchemy Engine — deterministic potion brewing via Alchemia skill.
 * No AI involved — pure d50 skill checks.
 * Structure mirrors craftingEngine.js but with alchemy-specific logic.
 */

import { resolveSkillCheck } from './mechanics/skillCheck.js';

// ── Outcome Tiers ──

export const ALCHEMY_TIERS = {
  CRITICAL_SUCCESS: 'criticalSuccess', // margin >= 15 → double yield or enhanced effect
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
 * Check which alchemy recipes the character can brew.
 * @param {Array} inventory - character.inventory
 * @param {object} skills - character.skills
 * @param {Array} allRecipes - ALCHEMY_RECIPES array
 * @returns {Array} enriched recipes with canCraft flag and ingredient status
 */
export function getAvailableRecipes(inventory, skills, allRecipes) {
  const inventoryCounts = countInventoryItems(inventory);
  const alchemiaLevel = getSkillLevel(skills, 'Alchemia');

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
    const hasSkill = alchemiaLevel > 0;

    return {
      ...recipe,
      materialStatus,
      canCraft: canCraft && hasSkill,
      missingMaterials: materialStatus.filter((m) => !m.satisfied),
      skillLevel: alchemiaLevel,
    };
  });
}

/**
 * Resolve an alchemy attempt.
 */
export function resolveAlchemy(character, recipe, currentMomentum = 0) {
  const skillCheck = resolveSkillCheck({
    character,
    actionText: `brew ${recipe.name}`,
    currentMomentum,
    actionContext: {
      attribute: 'inteligencja',
      suggestedSkills: ['Alchemia'],
      difficulty: recipe.difficulty || 'medium',
    },
    difficultyOverride: recipe.difficulty || 'medium',
  });

  if (!skillCheck) {
    return {
      success: false,
      tier: ALCHEMY_TIERS.CRITICAL_FAILURE,
      skillCheck: null,
      resultItem: null,
      materialsConsumed: recipe.requiredMaterials,
      stateChanges: buildStateChanges(recipe, ALCHEMY_TIERS.CRITICAL_FAILURE, null),
    };
  }

  const tier = determineTier(skillCheck.margin);
  const resultItem = buildResultItem(recipe, tier);
  const materialsConsumed = determineMaterialsConsumed(recipe, tier);

  return {
    success: tier === ALCHEMY_TIERS.CRITICAL_SUCCESS || tier === ALCHEMY_TIERS.SUCCESS,
    tier,
    skillCheck,
    resultItem,
    materialsConsumed,
    stateChanges: buildStateChanges(recipe, tier, resultItem),
  };
}

// ── Helpers ──

function determineTier(margin) {
  if (margin >= MARGIN_THRESHOLDS.criticalSuccess) return ALCHEMY_TIERS.CRITICAL_SUCCESS;
  if (margin >= MARGIN_THRESHOLDS.success) return ALCHEMY_TIERS.SUCCESS;
  if (margin >= MARGIN_THRESHOLDS.partialFailure) return ALCHEMY_TIERS.PARTIAL_FAILURE;
  return ALCHEMY_TIERS.CRITICAL_FAILURE;
}

function buildResultItem(recipe, tier) {
  if (tier === ALCHEMY_TIERS.PARTIAL_FAILURE || tier === ALCHEMY_TIERS.CRITICAL_FAILURE) {
    return null;
  }

  const base = recipe.resultItem;
  const item = {
    id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: base.name,
    type: base.type || 'potion',
    rarity: base.rarity || 'common',
  };

  // Preserve potion effect
  if (base.effect) {
    item.effect = { ...base.effect };
  }

  if (tier === ALCHEMY_TIERS.CRITICAL_SUCCESS) {
    item.quality = 'superior';
    // Critical success: enhanced effect
    if (item.effect) {
      if (item.effect.value) {
        item.effect.value = Math.round(item.effect.value * 1.5);
      }
      if (item.effect.durationHours) {
        item.effect.durationHours = Math.round(item.effect.durationHours * 1.5);
      }
      if (item.effect.attacks) {
        item.effect.attacks = item.effect.attacks + 2;
      }
    }
    // Also give double yield (quantity 2)
    item.quantity = 2;
  }

  return item;
}

function determineMaterialsConsumed(recipe, tier) {
  switch (tier) {
    case ALCHEMY_TIERS.CRITICAL_SUCCESS:
    case ALCHEMY_TIERS.SUCCESS:
      return recipe.requiredMaterials;
    case ALCHEMY_TIERS.PARTIAL_FAILURE:
      return recipe.requiredMaterials.map((m) => ({
        ...m,
        quantity: Math.ceil(m.quantity / 2),
      }));
    case ALCHEMY_TIERS.CRITICAL_FAILURE:
      return recipe.requiredMaterials;
    default:
      return recipe.requiredMaterials;
  }
}

function buildStateChanges(recipe, tier, resultItem) {
  const changes = {};

  const consumed = determineMaterialsConsumed(recipe, tier);
  changes.removeItemsByName = consumed.map((m) => ({ name: m.name, quantity: m.quantity }));

  if (resultItem) {
    changes.newItems = [resultItem];
  }

  const diffKey = recipe.difficulty || 'medium';
  const baseXp = tier === ALCHEMY_TIERS.CRITICAL_SUCCESS ? 3 :
    tier === ALCHEMY_TIERS.SUCCESS ? 2 :
      tier === ALCHEMY_TIERS.PARTIAL_FAILURE ? 1 : 0;
  const diffMultiplier = { easy: 0.5, medium: 1, hard: 1.5, veryHard: 2, extreme: 3 };
  changes.skillProgress = {
    Alchemia: Math.round(baseXp * (diffMultiplier[diffKey] || 1)),
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
