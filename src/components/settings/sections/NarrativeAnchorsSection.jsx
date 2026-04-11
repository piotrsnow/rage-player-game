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

  const lengthLabel = dmSettings.responseLength < 33
    ? t('settings.lengthLabels.short')
    : dmSettings.responseLength < 66
      ? t('settings.lengthLabels.medium')
      : t('settings.lengthLabels.long');

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
