import { useTranslation } from 'react-i18next';

/**
 * Slider that controls how much historical context the AI sees during scene
 * generation. 0 = minimal, 100 = full. Hidden in readOnly viewer mode.
 * Settings live on `settings.dmSettings.contextDepth`.
 */
export default function ContextDepthSlider({ settings, updateDMSettings }) {
  const { t } = useTranslation();
  const value = settings.dmSettings?.contextDepth ?? 100;

  return (
    <div className="px-2 flex items-center gap-3 group">
      <span
        className="text-[10px] text-on-surface-variant/60 uppercase tracking-widest font-label whitespace-nowrap cursor-help"
        title={t('gameplay.contextDepthTooltip')}
      >
        {t('gameplay.contextDepth')}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={25}
        value={value}
        onChange={(e) => updateDMSettings({ contextDepth: Number(e.target.value) })}
        className="flex-1 h-1 appearance-none bg-outline/20 rounded-full accent-primary cursor-pointer [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(197,154,255,0.5)]"
      />
      <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[72px] text-right">
        {value === 100
          ? t('gameplay.contextLevel_full')
          : value >= 75
            ? t('gameplay.contextLevel_rich')
            : value >= 50
              ? t('gameplay.contextLevel_standard')
              : value >= 25
                ? t('gameplay.contextLevel_light')
                : t('gameplay.contextLevel_minimal')}
        {' '}{value}%
      </span>
    </div>
  );
}
