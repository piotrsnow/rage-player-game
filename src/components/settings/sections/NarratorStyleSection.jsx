import { useTranslation } from 'react-i18next';
import Slider from '../../ui/Slider';

function tierLabel(t, value, defaultValue, keys) {
  const v = value ?? defaultValue;
  if (v < 25) return t(keys[0]);
  if (v < 50) return t(keys[1]);
  if (v < 75) return t(keys[2]);
  return t(keys[3]);
}

export default function NarratorStyleSection({ dmSettings, updateDMSettings }) {
  const { t } = useTranslation();

  const poeticismLabel = tierLabel(t, dmSettings.narratorPoeticism, 50, [
    'settings.poeticismLabels.prosaic',
    'settings.poeticismLabels.literary',
    'settings.poeticismLabels.poetic',
    'settings.poeticismLabels.lyrical',
  ]);
  const grittinessLabel = tierLabel(t, dmSettings.narratorGrittiness, 30, [
    'settings.grittinessLabels.light',
    'settings.grittinessLabels.grounded',
    'settings.grittinessLabels.gritty',
    'settings.grittinessLabels.brutal',
  ]);
  const detailLevelLabel = tierLabel(t, dmSettings.narratorDetail, 50, [
    'settings.detailLabels.minimal',
    'settings.detailLabels.balanced',
    'settings.detailLabels.rich',
    'settings.detailLabels.lavish',
  ]);
  const humorLabel = tierLabel(t, dmSettings.narratorHumor, 20, [
    'settings.humorLabels.serious',
    'settings.humorLabels.dry',
    'settings.humorLabels.witty',
    'settings.humorLabels.absurd',
  ]);
  const dramaLabel = tierLabel(t, dmSettings.narratorDrama, 50, [
    'settings.dramaLabels.subtle',
    'settings.dramaLabels.measured',
    'settings.dramaLabels.heightened',
    'settings.dramaLabels.theatrical',
  ]);

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">stylus_note</span>
        {t('settings.narratorStyle')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-8">{t('settings.narratorStyleDesc')}</p>

      <Slider
        label={t('settings.poeticism')}
        description={t('settings.poeticismDesc')}
        value={dmSettings.narratorPoeticism ?? 50}
        onChange={(v) => updateDMSettings({ narratorPoeticism: v })}
        displayValue={`${dmSettings.narratorPoeticism ?? 50}% — ${poeticismLabel}`}
      />

      <Slider
        label={t('settings.grittiness')}
        description={t('settings.grittinessDesc')}
        value={dmSettings.narratorGrittiness ?? 30}
        onChange={(v) => updateDMSettings({ narratorGrittiness: v })}
        displayValue={`${dmSettings.narratorGrittiness ?? 30}% — ${grittinessLabel}`}
      />

      <Slider
        label={t('settings.narratorDetail')}
        description={t('settings.narratorDetailDesc')}
        value={dmSettings.narratorDetail ?? 50}
        onChange={(v) => updateDMSettings({ narratorDetail: v })}
        displayValue={`${dmSettings.narratorDetail ?? 50}% — ${detailLevelLabel}`}
      />

      <Slider
        label={t('settings.narratorHumor')}
        description={t('settings.narratorHumorDesc')}
        value={dmSettings.narratorHumor ?? 20}
        onChange={(v) => updateDMSettings({ narratorHumor: v })}
        displayValue={`${dmSettings.narratorHumor ?? 20}% — ${humorLabel}`}
      />

      <Slider
        label={t('settings.narratorDrama')}
        description={t('settings.narratorDramaDesc')}
        value={dmSettings.narratorDrama ?? 50}
        onChange={(v) => updateDMSettings({ narratorDrama: v })}
        displayValue={`${dmSettings.narratorDrama ?? 50}% — ${dramaLabel}`}
      />

      <div className="mt-6">
        <label className="block font-headline text-sm text-tertiary mb-2">
          {t('settings.narratorCustomInstructions')}
        </label>
        <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
          {t('settings.narratorCustomInstructionsDesc')}
        </p>
        <textarea
          value={dmSettings.narratorCustomInstructions || ''}
          onChange={(e) => updateDMSettings({ narratorCustomInstructions: e.target.value })}
          placeholder={t('settings.narratorCustomInstructionsPlaceholder')}
          rows={4}
          className="w-full bg-surface-container-highest/60 border border-outline-variant/15 rounded-sm px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-primary/40 resize-y"
        />
      </div>
    </div>
  );
}
