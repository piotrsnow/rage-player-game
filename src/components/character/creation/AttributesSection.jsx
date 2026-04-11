import { useTranslation } from 'react-i18next';
import { ATTRIBUTE_KEYS, CREATION_LIMITS } from '../../../data/rpgSystem';
import { SectionHeader, PointBuyRow } from './Primitives';

export default function AttributesSection({
  attrAdded,
  attributes,
  speciesData,
  attrPointsUsed,
  attrPointsRemaining,
  attrPointCost,
  maxWounds,
  onIncrement,
  onDecrement,
  onRandomize,
}) {
  const { t } = useTranslation();
  return (
    <section>
      <SectionHeader icon="monitoring" label={t('charCreator.characteristicsLabel')} onRandomize={onRandomize} />
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
            {t('charCreator.attributePointsRemaining')}
          </span>
          <span className={`text-xs font-bold tabular-nums ${
            attrPointsRemaining <= 0 ? 'text-error' : attrPointsRemaining <= 3 ? 'text-tertiary' : 'text-primary'
          }`}>
            {attrPointsRemaining} / {CREATION_LIMITS.distributableAttributePoints}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-container-high/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              attrPointsRemaining <= 0 ? 'bg-error' : attrPointsRemaining <= 3 ? 'bg-tertiary' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(100, (attrPointsUsed / CREATION_LIMITS.distributableAttributePoints) * 100)}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ATTRIBUTE_KEYS.map((key) => {
          const added = attrAdded[key] || 0;
          const specMod = speciesData.attributes[key] || 0;
          const cost = attrPointCost(key);
          return (
            <PointBuyRow
              key={key}
              label={t(`rpgAttributes.${key}`)}
              shortLabel={t(`rpgAttributeShort.${key}`)}
              baseValue={CREATION_LIMITS.baseAttribute}
              added={added}
              speciesMod={specMod}
              finalValue={attributes[key]}
              pointCost={cost}
              onIncrement={() => onIncrement(key)}
              onDecrement={() => onDecrement(key)}
              canIncrement={added < CREATION_LIMITS.maxPerAttributeAtCreation && attrPointsRemaining >= cost}
              canDecrement={added > 0}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-on-surface-variant">
        <span>{t('charCreator.derivedWounds')}: <strong className="text-tertiary">{maxWounds}</strong></span>
        <span>{t('charCreator.derivedMovement')}: <strong className="text-tertiary">{speciesData.movement}</strong></span>
        <span>Mana: <strong className="text-tertiary">{speciesData.startingMana || 0}</strong></span>
      </div>
    </section>
  );
}
