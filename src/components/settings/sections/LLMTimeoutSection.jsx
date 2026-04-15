import { useTranslation } from 'react-i18next';
import Slider from '../../ui/Slider';

export default function LLMTimeoutSection({ dmSettings, updateDMSettings }) {
  const { t } = useTranslation();

  const premiumSec = Math.round((dmSettings.llmPremiumTimeoutMs ?? 45000) / 1000);
  const nanoSec = Math.round((dmSettings.llmNanoTimeoutMs ?? 15000) / 1000);

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-8 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">timer</span>
        {t('settings.llmTimeouts')}
      </h2>

      <Slider
        label={t('settings.llmPremiumTimeout')}
        description={t('settings.llmPremiumTimeoutDesc')}
        min={10}
        max={120}
        value={premiumSec}
        onChange={(v) => updateDMSettings({ llmPremiumTimeoutMs: v * 1000 })}
        displayValue={`${premiumSec}s`}
      />

      <Slider
        label={t('settings.llmNanoTimeout')}
        description={t('settings.llmNanoTimeoutDesc')}
        min={3}
        max={60}
        value={nanoSec}
        onChange={(v) => updateDMSettings({ llmNanoTimeoutMs: v * 1000 })}
        displayValue={`${nanoSec}s`}
      />
    </div>
  );
}
