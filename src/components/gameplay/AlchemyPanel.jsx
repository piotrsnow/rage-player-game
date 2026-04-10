import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAvailableRecipes, resolveAlchemy, ALCHEMY_TIERS } from '../../services/alchemyEngine.js';
import { gameData } from '../../services/gameDataService.js';

const DIFFICULTY_COLORS = {
  easy: 'text-success',
  medium: 'text-warning',
  hard: 'text-error',
  veryHard: 'text-error',
  extreme: 'text-error font-bold',
};

export default function AlchemyPanel({ character, dispatch, disabled }) {
  const { t } = useTranslation();
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const recipes = useMemo(() => {
    const allRecipes = gameData.alchemyRecipes || [];
    return getAvailableRecipes(character?.materialBag || [], character?.skills || {}, allRecipes);
  }, [character?.materialBag, character?.skills]);

  const alchemiaLevel = getSkillLevel(character?.skills, 'Alchemia');
  const inteligencja = character?.attributes?.inteligencja || 0;

  const handleBrew = useCallback((recipe) => {
    if (!recipe.canCraft || disabled) return;

    const result = resolveAlchemy(character, recipe, 0);
    setLastResult(result);

    if (result.stateChanges) {
      dispatch({ type: 'APPLY_STATE_CHANGES', payload: result.stateChanges });
    }
  }, [character, disabled, dispatch]);

  const handleClose = useCallback(() => {
    dispatch({ type: 'END_ALCHEMY' });
  }, [dispatch]);

  return (
    <div className="bg-surface-container-low/60 backdrop-blur-sm border border-success/15 rounded-sm p-3 space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-success">science</span>
          <span className="text-[10px] font-label font-bold uppercase tracking-widest text-on-surface">
            {t('alchemy.title')}
          </span>
          <span className="text-[9px] text-on-surface-variant">
            Alchemia: poz. {alchemiaLevel} | INT: {inteligencja}
          </span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-surface-container-high/40 rounded-sm transition-colors"
        >
          <span className="material-symbols-outlined text-xs text-on-surface-variant">close</span>
        </button>
      </div>

      {/* Recipe List */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
        {recipes.length === 0 && (
          <p className="text-[10px] text-on-surface-variant text-center py-4">{t('alchemy.noRecipes')}</p>
        )}
        {recipes.map((recipe, idx) => {
          const isSelected = selectedRecipe === idx;
          const diffColor = DIFFICULTY_COLORS[recipe.difficulty] || 'text-on-surface-variant';

          return (
            <div
              key={recipe.name}
              onClick={() => setSelectedRecipe(isSelected ? null : idx)}
              className={`p-2 rounded-sm border cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-success/10 border-success/20'
                  : recipe.canCraft
                    ? 'bg-surface-container/30 border-outline-variant/10 hover:bg-surface-container/50'
                    : 'bg-surface-container/20 border-outline-variant/5 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs ${recipe.canCraft ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                  {recipe.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] ${diffColor}`}>
                    {t(`crafting.${recipe.difficulty || 'medium'}`)}
                  </span>
                  <span className="text-[9px] text-on-surface-variant flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[10px]">timer</span>
                    {recipe.time}h
                  </span>
                </div>
              </div>

              {/* Effect preview */}
              {recipe.resultItem?.effect && (
                <div className="mt-0.5">
                  <span className="text-[9px] text-success/80">
                    {formatEffect(recipe.resultItem.effect, t)}
                  </span>
                </div>
              )}

              {isSelected && (
                <div className="mt-2 space-y-1">
                  {/* Ingredients */}
                  {recipe.materialStatus.map((mat) => (
                    <div key={mat.name} className="flex items-center gap-1.5">
                      <span className={`material-symbols-outlined text-[10px] ${
                        mat.satisfied ? 'text-success' : 'text-error'
                      }`}>
                        {mat.satisfied ? 'check_circle' : 'cancel'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">{mat.name}</span>
                      <span className={`text-[10px] ${mat.satisfied ? 'text-success' : 'text-error'}`}>
                        ({mat.have}/{mat.need})
                      </span>
                    </div>
                  ))}

                  {recipe.description && (
                    <p className="text-[9px] text-on-surface-variant/70 italic mt-1">{recipe.description}</p>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleBrew(recipe); }}
                    disabled={disabled || !recipe.canCraft}
                    className="mt-2 w-full py-1.5 text-[10px] font-label font-bold uppercase tracking-widest rounded-sm bg-success/20 border border-success/30 text-success hover:bg-success/30 disabled:opacity-40 transition-colors"
                  >
                    {t('alchemy.brew')}
                  </button>
                </div>
              )}

              {/* Compact summary */}
              {!isSelected && !recipe.resultItem?.effect && (
                <div className="mt-0.5">
                  {recipe.canCraft ? (
                    <span className="text-[9px] text-success flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[9px]">check_circle</span>
                      {t('crafting.allMaterials')}
                    </span>
                  ) : (
                    <span className="text-[9px] text-error flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[9px]">cancel</span>
                      {t('crafting.missingMaterials')} ({recipe.missingMaterials.length})
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Result */}
      {lastResult && (
        <div className={`text-[10px] p-2 rounded-sm border ${
          lastResult.success
            ? lastResult.tier === ALCHEMY_TIERS.CRITICAL_SUCCESS
              ? 'bg-tertiary/10 border-tertiary/20 text-tertiary'
              : 'bg-success/10 border-success/20 text-success'
            : 'bg-error/10 border-error/20 text-error'
        }`}>
          {lastResult.tier === ALCHEMY_TIERS.CRITICAL_SUCCESS && t('alchemy.criticalSuccess')}
          {lastResult.tier === ALCHEMY_TIERS.SUCCESS && t('alchemy.success', { item: lastResult.resultItem?.name })}
          {lastResult.tier === ALCHEMY_TIERS.PARTIAL_FAILURE && t('alchemy.partialFail')}
          {lastResult.tier === ALCHEMY_TIERS.CRITICAL_FAILURE && t('alchemy.criticalFail')}
          {lastResult.skillCheck && (
            <span className="block mt-1 text-[9px] text-on-surface-variant">
              d50: {lastResult.skillCheck.roll} | threshold: {lastResult.skillCheck.threshold} | margin: {lastResult.skillCheck.margin > 0 ? '+' : ''}{lastResult.skillCheck.margin}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatEffect(effect, t) {
  switch (effect.type) {
    case 'heal': return t('alchemy.effectHeal', { value: effect.value });
    case 'buff': return t('alchemy.effectBuff', { value: effect.value, stat: effect.stat, duration: effect.durationHours });
    case 'poison_coating': return t('alchemy.effectPoison', { value: effect.bonusDamage, attacks: effect.attacks });
    case 'resistance': return t('alchemy.effectResistance', { element: effect.element, duration: effect.durationHours });
    case 'night_vision': return t('alchemy.effectNightVision', { duration: effect.durationHours });
    case 'sleep': return t('alchemy.effectSleep', { duration: effect.durationHours });
    case 'cure_poison': return t('alchemy.effectCurePoison');
    case 'restore_mana': return t('alchemy.effectRestoreMana', { value: effect.value });
    default: return effect.type;
  }
}

function getSkillLevel(skills, name) {
  const e = skills?.[name];
  if (!e) return 0;
  return typeof e === 'object' ? (e.level || 0) : e;
}
