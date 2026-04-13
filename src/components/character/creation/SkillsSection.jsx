import { useTranslation } from 'react-i18next';
import { SKILL_CATEGORIES, SKILL_CAPS } from '../../../data/rpgSystem';
import { translateSkill } from '../../../utils/rpgTranslate';
import { SectionHeader } from './Primitives';

export default function SkillsSection({
  skills,
  racialSkillNames,
  racialBase,
  totalSkillPoints,
  skillPointsUsed,
  remainingSkillPoints,
  skillPointsPct,
  onIncrement,
  onDecrement,
  onRandomize,
}) {
  const { t } = useTranslation();
  const maxSkillLevel = SKILL_CAPS.basic;

  return (
    <section>
      <SectionHeader icon="construction" label={t('charCreator.skillsLabel')} onRandomize={onRandomize} />
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
            {t('charCreator.skillPointsRemaining')}
          </span>
          <span className={`text-xs font-bold tabular-nums ${
            remainingSkillPoints <= 0 ? 'text-error' : remainingSkillPoints <= 5 ? 'text-tertiary' : 'text-primary'
          }`}>
            {remainingSkillPoints} / {totalSkillPoints}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-container-high/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              remainingSkillPoints <= 0 ? 'bg-error' : remainingSkillPoints <= 5 ? 'bg-tertiary' : 'bg-primary'
            }`}
            style={{ width: `${skillPointsPct}%` }}
          />
        </div>
      </div>
      <div className="space-y-4">
        {SKILL_CATEGORIES.map((cat) => (
          <div key={cat.key}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-sm text-primary">{cat.icon}</span>
              <span className="text-[11px] font-label uppercase tracking-wider text-on-surface-variant">{t(`rpgSkillCategories.${cat.key}`, { defaultValue: cat.label })}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {cat.skills.map((skillName) => {
                const val = skills[skillName];
                const level = typeof val === 'object' ? val.level : (val || 0);
                const isRacial = racialSkillNames.has(skillName);
                const minLevel = isRacial ? racialBase : 0;
                return (
                  <div key={skillName} className="flex items-center justify-between py-1 border-b border-outline-variant/5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-on-surface truncate">{translateSkill(skillName, t)}</span>
                      {isRacial && (
                        <span className="shrink-0 text-[9px] px-1 py-0.5 bg-primary/15 text-primary rounded-sm font-label">
                          {t('charCreator.racialSkill')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onDecrement(skillName)}
                        disabled={level <= minLevel}
                        className="w-5 h-5 flex items-center justify-center rounded-sm text-on-surface-variant hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                      >
                        −
                      </button>
                      <span className={`w-6 text-center text-xs tabular-nums ${level > 0 ? 'text-tertiary font-bold' : 'text-outline'}`}>
                        {level}
                      </span>
                      <button
                        type="button"
                        onClick={() => onIncrement(skillName)}
                        disabled={level >= maxSkillLevel || remainingSkillPoints <= 0}
                        className="w-5 h-5 flex items-center justify-center rounded-sm text-on-surface-variant hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
