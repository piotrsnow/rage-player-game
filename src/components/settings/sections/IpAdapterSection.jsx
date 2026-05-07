import { useTranslation } from 'react-i18next';

const IPA_MODES = [
  { value: 'off',      icon: 'block' },
  { value: 'speed',    icon: 'bolt' },
  { value: 'balanced', icon: 'tune' },
  { value: 'quality',  icon: 'auto_awesome' },
];

export default function IpAdapterSection({ settings, updateSettings }) {
  const { t } = useTranslation();
  const current = settings.sdWebuiIpaMode || 'balanced';

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm">
      <p className="font-headline text-tertiary mb-1">
        {t('imageConfig.ipAdapter.title')}
      </p>
      <p className="text-xs text-on-surface-variant/70 mb-4">
        {t('imageConfig.ipAdapter.subtitle')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {IPA_MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => updateSettings({ sdWebuiIpaMode: mode.value })}
            className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-sm text-sm font-label transition-all ${
              current === mode.value
                ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                : 'bg-surface-container-highest/40 text-on-surface-variant hover:bg-surface-container-highest/60'
            }`}
          >
            <span className="material-symbols-outlined text-base">{mode.icon}</span>
            <span>{t(`imageConfig.ipAdapter.${mode.value}`)}</span>
            <span className="text-[10px] opacity-60">
              {t(`imageConfig.ipAdapter.${mode.value}Hint`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
