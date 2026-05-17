import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ATTRIBUTE_KEYS, ATTRIBUTE_DESCRIPTIONS, DIFFICULTY_THRESHOLDS, getAdjustedThresholds, cumulativeCharXpThreshold } from '../../data/rpgSystem';
import { useGameStore } from '../../stores/gameStore';

const ATTR_ICONS = {
  sila: 'fitness_center',
  inteligencja: 'menu_book',
  charyzma: 'handshake',
  zrecznosc: 'directions_run',
  wytrzymalosc: 'shield',
  szczescie: 'casino',
};

const DIFFICULTY_LABELS = {
  easy: 'Łatwy',
  medium: 'Średni',
  hard: 'Trudny',
  veryHard: 'B. trudny',
  extreme: 'Ekstremalny',
};

function StatDetailPanel({ attrKey, value, t }) {
  const fullName = t(`rpgAttributes.${attrKey}`, { defaultValue: attrKey });
  const description = t(`tooltips.stats.${attrKey}`, { defaultValue: '' }) || ATTRIBUTE_DESCRIPTIONS[attrKey] || '';

  return (
    <div className="col-span-3 sm:col-span-6 bg-surface-container/90 backdrop-blur-xl border border-primary/20 rounded-sm p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-primary text-2xl mt-0.5">
          {ATTR_ICONS[attrKey] || 'star'}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-primary font-headline text-lg leading-tight">{fullName}</h4>
          <p className="text-on-surface-variant text-sm mt-1 leading-relaxed">{description}</p>

          <div className="mt-3 p-3 bg-surface-container-high/60 rounded-sm border border-outline-variant/10">
            <p className="text-on-surface text-xs font-label uppercase tracking-wider mb-2">Rzut cechy</p>
            <p className="text-on-surface-variant text-sm">
              <span className="text-tertiary font-headline">d50</span>
              {' + '}
              <span className="text-primary font-headline">{value}</span>
              <span className="text-on-surface-variant/60"> ({fullName})</span>
              {' + umiejętność vs próg trudności'}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(DT).map(([key, val]) => (
                <span key={key} className="text-[10px] px-2 py-0.5 rounded-sm bg-surface-container-highest/80 text-on-surface-variant border border-outline-variant/10">
                  {DIFFICULTY_LABELS[key] || key}: <span className="text-tertiary font-headline">{val}</span>
                </span>
              ))}
            </div>
          </div>

          {attrKey === 'szczescie' && (
            <p className="text-xs text-on-surface-variant/70 mt-2 italic">
              Każdy rzut ma {value}% szans na automatyczny sukces (fart).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StatsGrid({ attributes, characterLevel, characterXp, attributePoints, backstory }) {
  const { t } = useTranslation();
  const [selectedStat, setSelectedStat] = useState(null);
  const campaignTier = useGameStore((s) => s.state.campaign?.difficultyTier || null);
  const DT = getAdjustedThresholds(campaignTier);

  if (!attributes) return null;

  const charLevel = characterLevel || 1;
  const charXp = characterXp || 0;
  const prevThreshold = cumulativeCharXpThreshold(charLevel);
  const nextThreshold = cumulativeCharXpThreshold(charLevel + 1);
  const charPct = nextThreshold > prevThreshold
    ? Math.min(100, ((charXp - prevThreshold) / (nextThreshold - prevThreshold)) * 100)
    : 0;

  const handleStatClick = (key) => {
    setSelectedStat((prev) => (prev === key ? null : key));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-3 py-2 bg-tertiary-container/10 border border-tertiary/20 rounded-sm">
        <span className="material-symbols-outlined text-tertiary text-lg">military_tech</span>
        <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">
          {t('stats.level', { defaultValue: 'Poziom' })} {charLevel}
        </span>
        <div className="flex-1 h-2 bg-surface-container-high/60 rounded-full overflow-hidden">
          <div className="h-full bg-tertiary rounded-full transition-all duration-300" style={{ width: `${charPct}%` }} />
        </div>
        <span className="text-sm font-headline text-tertiary tabular-nums">{charXp}/{nextThreshold}</span>
        {(attributePoints || 0) > 0 && (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-sm bg-primary/20 text-primary animate-pulse">
            +{attributePoints}
          </span>
        )}
      </div>

      <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 relative">
        <div className="absolute top-0 right-0 p-4">
          <span className="material-symbols-outlined text-primary-dim text-sm opacity-50">
            psychology
          </span>
        </div>
        <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">auto_stories</span>
          {t('character.origins')}
        </h3>
        <div className="text-on-surface-variant font-body leading-relaxed text-sm">
          {backstory || (
            <p className="italic text-outline">
              {t('character.originsEmpty')}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {ATTRIBUTE_KEYS.map((key) => {
          const value = attributes[key] || 0;
          const icon = ATTR_ICONS[key] || 'star';
          const short = t(`rpgAttributeShort.${key}`, { defaultValue: key });
          const isSelected = selectedStat === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleStatClick(key)}
              className={`bg-surface-container-high/60 backdrop-blur-md p-4 border-b-2 flex flex-col items-center text-center transition-all cursor-pointer hover:bg-surface-container-highest/80 ${
                isSelected ? 'border-primary bg-surface-container-highest/80' : 'border-primary/20'
              }`}
            >
              <span className="material-symbols-outlined text-primary-dim/50 mb-1 text-3xl">
                {icon}
              </span>
              <span className="text-on-surface-variant font-label text-[9px] uppercase tracking-[0.15em] mb-1">
                {short}
              </span>
              <span className="text-tertiary font-headline text-3xl">{value}</span>
            </button>
          );
        })}

        {selectedStat && (
          <StatDetailPanel
            attrKey={selectedStat}
            value={attributes[selectedStat] || 0}
            t={t}
          />
        )}
      </div>
    </div>
  );
}
