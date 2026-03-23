import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, getAchievementsByCategory } from '../../data/achievements';
import { getAchievementProgress } from '../../services/achievementTracker';
import { useModalA11y } from '../../hooks/useModalA11y';

const CATEGORY_KEYS = Object.keys(ACHIEVEMENT_CATEGORIES);
const ACHIEVEMENT_CATALOG_TOTAL = Object.keys(ACHIEVEMENTS).length;

const RARITY_STYLES = {
  common: 'bg-outline/12 text-on-surface-variant border-outline/20',
  uncommon: 'bg-primary/12 text-primary border-primary/25',
  rare: 'bg-tertiary/12 text-tertiary border-tertiary/25',
  legendary: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
};

function RarityBadge({ rarity, t }) {
  const label = t(`achievements.rarity.${rarity}`, { defaultValue: rarity });
  return (
    <span
      className={`text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${RARITY_STYLES[rarity] || RARITY_STYLES.common}`}
    >
      {label}
    </span>
  );
}

function AchievementCard({ achievement, unlocked, t }) {
  const { name, description, icon, rarity, xpReward } = achievement;

  return (
    <div
      className={`relative p-2.5 rounded-sm border border-outline-variant/10 bg-surface-container/35 backdrop-blur-sm transition-colors ${
        unlocked ? '' : 'opacity-55 grayscale-[0.35]'
      }`}
    >
      <div className="flex gap-2.5">
        <div className="relative shrink-0 w-10 h-10 rounded-sm bg-surface-dim/80 border border-outline-variant/15 flex items-center justify-center">
          <span className={`material-symbols-outlined text-xl ${unlocked ? 'text-primary' : 'text-outline'}`}>{icon}</span>
          {!unlocked && (
            <span
              className="absolute inset-0 flex items-center justify-center rounded-sm bg-black/45 backdrop-blur-[2px]"
              aria-hidden
            >
              <span className="material-symbols-outlined text-lg text-on-surface/90">lock</span>
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[11px] font-bold text-on-surface leading-tight">{name}</h3>
            <RarityBadge rarity={rarity} t={t} />
          </div>
          <p className="text-[10px] text-on-surface-variant leading-snug line-clamp-3">{description}</p>
          {typeof xpReward === 'number' && (
            <div className="flex items-center gap-1 text-[10px] text-primary/90 font-label uppercase tracking-wide">
              <span className="material-symbols-outlined text-xs">bolt</span>
              {t('achievements.xpReward', { count: xpReward, defaultValue: '+{{count}} XP' })}
            </div>
          )}
        </div>
      </div>
      <span className="sr-only">
        {`${unlocked ? t('achievements.unlocked', { defaultValue: 'Unlocked' }) : t('achievements.locked', { defaultValue: 'Locked' })}: ${name}`}
      </span>
    </div>
  );
}

export default function AchievementsPanel({ achievementState, onClose }) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState(CATEGORY_KEYS[0]);
  const modalRef = useModalA11y(onClose);

  const safeState = achievementState ?? { unlocked: [], stats: {} };
  const progress = useMemo(() => getAchievementProgress(safeState), [safeState]);
  const unlockedSet = useMemo(() => new Set(safeState.unlocked || []), [safeState.unlocked]);

  const list = useMemo(() => getAchievementsByCategory(activeCategory), [activeCategory]);

  const stats = safeState.stats || {};
  const scenesPlayed = stats.scenesPlayed ?? 0;
  const combatWins = stats.combatWins ?? 0;
  const enemiesDefeated = stats.enemiesDefeated ?? 0;
  const locationsCount = Array.isArray(stats.locationsVisited) ? stats.locationsVisited.length : 0;
  const hagglesSucceeded = stats.hagglesSucceeded ?? 0;
  const spellsCast = stats.spellsCast ?? 0;
  const miscasts = stats.miscasts ?? 0;
  const loreDepths = stats.spellsByLore && typeof stats.spellsByLore === 'object'
    ? Object.values(stats.spellsByLore).filter((n) => typeof n === 'number')
    : [];
  const maxSpellsOneLore = loreDepths.length ? Math.max(...loreDepths) : 0;

  const catProgress = progress.byCategory?.[activeCategory];
  const catLabel = catProgress
    ? `${catProgress.unlocked}/${catProgress.total}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('achievements.title', { defaultValue: 'Achievements' })}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[85vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-xl shrink-0">emoji_events</span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-on-surface uppercase tracking-widest truncate">
                {t('achievements.title', { defaultValue: 'Achievements' })}
              </h2>
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-wider mt-0.5 tabular-nums">
                {t('achievements.progressLabel', {
                  unlocked: progress.unlocked,
                  total: progress.total,
                  defaultValue: '{{unlocked}} / {{total}} unlocked',
                })}
                <span className="text-outline mx-1.5">·</span>
                {progress.percentage}%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors shrink-0"
          >
            close
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 border-b border-outline-variant/10 shrink-0">
          <div
            className="h-1.5 bg-surface-container rounded-full overflow-hidden border border-outline-variant/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={ACHIEVEMENT_CATALOG_TOTAL}
            aria-valuenow={progress.unlocked}
            aria-label={t('achievements.progressAria', {
              unlocked: progress.unlocked,
              total: ACHIEVEMENT_CATALOG_TOTAL,
              defaultValue: '{{unlocked}} of {{total}} achievements unlocked',
            })}
          >
            <div
              className="h-full bg-primary/80 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, progress.percentage)}%` }}
            />
          </div>
          {catLabel && (
            <p className="text-[9px] text-on-surface-variant font-label uppercase tracking-widest mt-1.5">
              {t('achievements.categoryProgress', {
                category: t(`achievements.categories.${activeCategory}`, {
                  defaultValue: ACHIEVEMENT_CATEGORIES[activeCategory]?.name,
                }),
                unlocked: catProgress.unlocked,
                total: catProgress.total,
                defaultValue: '{{category}} · {{unlocked}}/{{total}}',
              })}
            </p>
          )}
        </div>

        <div className="flex border-b border-outline-variant/10 px-2 gap-1 overflow-x-auto shrink-0">
          {CATEGORY_KEYS.map((key) => {
            const meta = ACHIEVEMENT_CATEGORIES[key];
            const isActive = activeCategory === key;
            const cProg = progress.byCategory?.[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                className={`flex items-center gap-1.5 px-2.5 py-2 text-[9px] font-label uppercase tracking-widest transition-colors whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'text-primary border-primary'
                    : 'text-outline border-transparent hover:text-on-surface-variant hover:border-outline-variant/30'
                }`}
                title={cProg ? `${cProg.unlocked}/${cProg.total}` : undefined}
              >
                <span className="material-symbols-outlined text-sm" style={isActive && meta?.color ? { color: meta.color } : undefined}>
                  {meta?.icon}
                </span>
                {t(`achievements.categories.${key}`, { defaultValue: meta?.name })}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-outline">
              <span className="material-symbols-outlined text-3xl">inventory_2</span>
              <p className="text-[10px] font-label uppercase tracking-widest">
                {t('achievements.emptyCategory', { defaultValue: 'No achievements in this category' })}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {list.map((a) => (
                <AchievementCard
                  key={a.id}
                  achievement={a}
                  unlocked={unlockedSet.has(a.id)}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-outline-variant/10 bg-surface-container/25 px-4 py-3">
          <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
            {t('achievements.statsHeading', { defaultValue: 'Tracker' })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            <StatPill icon="history" label={t('achievements.stats.scenesPlayed', { defaultValue: 'Scenes' })} value={scenesPlayed} />
            <StatPill icon="swords" label={t('achievements.stats.combatWins', { defaultValue: 'Combat wins' })} value={combatWins} />
            <StatPill icon="skull" label={t('achievements.stats.enemiesDefeated', { defaultValue: 'Enemies defeated' })} value={enemiesDefeated} />
            <StatPill icon="map" label={t('achievements.stats.locationsVisited', { defaultValue: 'Locations' })} value={locationsCount} />
            <StatPill icon="payments" label={t('achievements.stats.haggles', { defaultValue: 'Haggles won' })} value={hagglesSucceeded} />
            <StatPill icon="auto_fix_high" label={t('achievements.stats.spellsCast', { defaultValue: 'Spells cast' })} value={spellsCast} />
            <StatPill icon="error" label={t('achievements.stats.miscasts', { defaultValue: 'Miscasts' })} value={miscasts} />
            <StatPill icon="menu_book" label={t('achievements.stats.maxLoreDepth', { defaultValue: 'Max spells / lore' })} value={maxSpellsOneLore} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-outline-variant/10 bg-surface-container/40 px-2 py-1.5">
      <span className="material-symbols-outlined text-sm text-primary shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[9px] text-on-surface-variant uppercase tracking-wide truncate leading-tight">{label}</div>
        <div className="text-xs font-bold text-on-surface tabular-nums">{value}</div>
      </div>
    </div>
  );
}
