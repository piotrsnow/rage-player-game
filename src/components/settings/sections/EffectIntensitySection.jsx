import { useTranslation } from 'react-i18next';

export default function EffectIntensitySection({ settings, updateSettings }) {
  const { t } = useTranslation();
  if (settings.canvasEffectsEnabled === false) return null;

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">auto_awesome</span>
        {t('settings.effectIntensityTitle')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">{t('settings.effectIntensityDesc')}</p>
      <div className="flex gap-3">
        {['low', 'medium', 'high'].map((level) => (
          <button
            key={level}
            onClick={() => updateSettings({ effectIntensity: level })}
            className={`flex-1 px-4 py-3 rounded-sm border text-center transition-all ${
              (settings.effectIntensity || 'medium') === level
                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            }`}
          >
            <span className="font-headline text-sm">{t(`settings.effectLevels.${level}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
