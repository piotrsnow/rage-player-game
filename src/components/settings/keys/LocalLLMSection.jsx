import { useTranslation } from 'react-i18next';

export default function LocalLLMSection({ settings, updateSettings }) {
  const { t } = useTranslation();
  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-tertiary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">memory</span>
        {t('settings.localLLM', 'Local LLM')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">{t('settings.localLLMDesc', 'Connect to a locally running LLM via Ollama or LM Studio for offline play.')}</p>

      <div className="space-y-4">
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">{t('settings.enableLocalLLM', 'Enable Local LLM')}</span>
          <input
            type="checkbox"
            checked={settings.localLLMEnabled || false}
            onChange={(e) => updateSettings({ localLLMEnabled: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
        </label>

        {settings.localLLMEnabled && (
          <>
            <div>
              <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                {t('settings.localLLMEndpoint', 'Endpoint URL')}
              </label>
              <input
                type="text"
                value={settings.localLLMEndpoint || 'http://localhost:11434'}
                onChange={(e) => updateSettings({ localLLMEndpoint: e.target.value })}
                placeholder="http://localhost:11434"
                className="w-full bg-surface-container/60 border border-outline-variant/15 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary/40 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                {t('settings.localLLMModel', 'Model Name')}
              </label>
              <input
                type="text"
                value={settings.localLLMModel || ''}
                onChange={(e) => updateSettings({ localLLMModel: e.target.value })}
                placeholder="llama3, mistral, etc."
                className="w-full bg-surface-container/60 border border-outline-variant/15 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-outline-variant focus:border-primary/40 focus:outline-none"
              />
            </div>

            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">{t('settings.reducedPrompt', 'Use reduced prompts (recommended for 7B-13B models)')}</span>
              <input
                type="checkbox"
                checked={settings.localLLMReducedPrompt !== false}
                onChange={(e) => updateSettings({ localLLMReducedPrompt: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
