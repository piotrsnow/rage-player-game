import { useTranslation } from 'react-i18next';

export default function ImageProviderSection({ settings, updateSettings, localKeys, setLocalKeys, backendKeys }) {
  const { t } = useTranslation();

  const options = [
    { id: 'dalle', icon: 'auto_awesome', label: t('settings.dalleLabel') },
    { id: 'gpt-image', icon: 'brush', label: t('settings.gptImageLabel') },
    { id: 'stability', icon: 'speed', label: t('settings.stabilityLabel') },
    { id: 'gemini', icon: 'stars', label: t('settings.geminiLabel') },
  ];

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">image</span>
        {t('settings.imageProvider')}
      </h2>

      <div className="space-y-3 mb-8">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => updateSettings({ imageProvider: opt.id })}
            className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
              settings.imageProvider === opt.id
                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            }`}
          >
            <span className="material-symbols-outlined">{opt.icon}</span>
            <span className="font-headline text-sm">{opt.label}</span>
            {settings.imageProvider === opt.id && (
              <span className="material-symbols-outlined text-primary ml-auto text-sm">check_circle</span>
            )}
          </button>
        ))}
      </div>

      {settings.imageProvider === 'stability' && (
        <div>
          <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
            {t('settings.stabilityApiKey')}
          </label>
          <input
            type="password"
            value={localKeys.stabilityApiKey}
            onChange={(e) => setLocalKeys((p) => ({ ...p, stabilityApiKey: e.target.value }))}
            placeholder={backendKeys.stability ? backendKeys.stability : 'sk-...'}
            className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
          />
          {!localKeys.stabilityApiKey && backendKeys.stability ? (
            <p className="text-[10px] text-primary/70 mt-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">cloud_done</span>
              {t('settings.serverKeyHint', { masked: backendKeys.stability })}
            </p>
          ) : (
            <p className="text-[10px] text-on-surface-variant mt-2">
              {t('settings.stabilityApiKeyDesc')}
            </p>
          )}
        </div>
      )}

      {settings.imageProvider === 'gemini' && (
        <div>
          <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
            {t('settings.geminiApiKey')}
          </label>
          <input
            type="password"
            value={localKeys.geminiApiKey}
            onChange={(e) => setLocalKeys((p) => ({ ...p, geminiApiKey: e.target.value }))}
            placeholder={backendKeys.gemini ? backendKeys.gemini : 'AIza...'}
            className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
          />
          {!localKeys.geminiApiKey && backendKeys.gemini ? (
            <p className="text-[10px] text-primary/70 mt-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">cloud_done</span>
              {t('settings.serverKeyHint', { masked: backendKeys.gemini })}
            </p>
          ) : (
            <p className="text-[10px] text-on-surface-variant mt-2">
              {t('settings.geminiApiKeyDesc')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
