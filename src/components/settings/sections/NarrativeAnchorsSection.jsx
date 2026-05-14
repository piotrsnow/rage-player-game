import { useTranslation } from 'react-i18next';
import Slider from '../../ui/Slider';

export default function NarrativeAnchorsSection({ dmSettings, updateDMSettings }) {
  const { t } = useTranslation();

  const difficultyLabel = dmSettings.difficulty < 25
    ? t('settings.difficultyLabels.easy')
    : dmSettings.difficulty < 50
      ? t('settings.difficultyLabels.normal')
      : dmSettings.difficulty < 75
        ? t('settings.difficultyLabels.hard')
        : t('settings.difficultyLabels.expert');

  const chaosLabel = dmSettings.narrativeStyle < 25
    ? t('settings.chaosLabels.stable')
    : dmSettings.narrativeStyle < 50
      ? t('settings.chaosLabels.balanced')
      : dmSettings.narrativeStyle < 75
        ? t('settings.chaosLabels.chaotic')
        : t('settings.chaosLabels.wild');

  const lengthLabel = dmSettings.responseLength < 20
    ? t('settings.lengthLabels.veryShort')
    : dmSettings.responseLength < 40
      ? t('settings.lengthLabels.short')
      : dmSettings.responseLength < 60
        ? t('settings.lengthLabels.medium')
        : dmSettings.responseLength < 80
          ? t('settings.lengthLabels.long')
          : t('settings.lengthLabels.veryLong');

  const combatCommentaryFrequency = dmSettings.combatCommentaryFrequency ?? 3;
  const combatCommentaryLabel = combatCommentaryFrequency === 0
    ? t('settings.combatCommentaryDisabled')
    : t('settings.combatCommentaryEveryRounds', { count: combatCommentaryFrequency });

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-8 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">vital_signs</span>
        {t('settings.narrativeAnchors')}
      </h2>

      <Slider
        label={t('settings.storyChaos')}
        description={t('settings.storyChaosDesc')}
        value={dmSettings.narrativeStyle}
        onChange={(v) => updateDMSettings({ narrativeStyle: v })}
        displayValue={`${dmSettings.narrativeStyle}% — ${chaosLabel}`}
      />

      <Slider
        label={t('settings.responseLength')}
        description={t('settings.responseLengthDesc')}
        value={dmSettings.responseLength}
        onChange={(v) => updateDMSettings({ responseLength: v })}
        displayValue={lengthLabel}
      />

      <Slider
        label={t('settings.difficulty')}
        description={t('settings.difficultyDesc')}
        value={dmSettings.difficulty}
        onChange={(v) => updateDMSettings({ difficulty: v })}
        displayValue={difficultyLabel}
      />

      <Slider
        label={t('settings.skillChecks')}
        description={t('settings.skillChecksDesc')}
        value={dmSettings.testsFrequency}
        onChange={(v) => updateDMSettings({ testsFrequency: v })}
        displayValue={`${dmSettings.testsFrequency}%`}
      />

      <Slider
        label={t('settings.combatCommentaryFrequency')}
        description={t('settings.combatCommentaryFrequencyDesc')}
        min={0}
        max={5}
        value={combatCommentaryFrequency}
        onChange={(v) => updateDMSettings({ combatCommentaryFrequency: v })}
        displayValue={combatCommentaryLabel}
      />

      <div className="mb-6">
        <label className="flex items-center justify-between text-sm font-label text-on-surface mb-1.5">
          {t('settings.minigameCommentaryMode', 'Komentarz w minigrach')}
        </label>
        <p className="text-[11px] text-on-surface-variant/70 mb-2">
          {t('settings.minigameCommentaryModeDesc', 'Źródło komentarzy NPC podczas minigier (oczko, kości, piwny pojedynek).')}
        </p>
        <div className="flex gap-2">
          {[
            { value: 'pool', label: t('settings.commentaryPool', 'Losowe z puli'), icon: 'shuffle' },
            { value: 'ai', label: t('settings.commentaryAi', 'AI (nano)'), icon: 'smart_toy' },
          ].map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => updateDMSettings({ minigameCommentaryMode: value })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-label border rounded-sm transition-all ${
                (dmSettings.minigameCommentaryMode || 'pool') === value
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-outline-variant/20 bg-surface-container/60 text-on-surface-variant hover:border-primary/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label={t('settings.playerFreedom')}
        description={t('settings.playerFreedomDesc')}
        value={dmSettings.freedom}
        onChange={(v) => updateDMSettings({ freedom: v })}
        displayValue={`${dmSettings.freedom}%`}
      />
    </div>
  );
}
