import { useTranslation } from 'react-i18next';

const KEYS = [
  { field: 'openaiApiKey', backend: 'openai', labelKey: 'settings.openaiApiKey', placeholder: 'sk-...' },
  { field: 'anthropicApiKey', backend: 'anthropic', labelKey: 'settings.anthropicApiKey', placeholder: 'sk-ant-...' },
  { field: 'stabilityApiKey', backend: 'stability', labelKey: 'settings.stabilityApiKey', placeholder: 'sk-...' },
  { field: 'geminiApiKey', backend: 'gemini', labelKey: 'settings.geminiApiKey', placeholder: 'AIza...' },
];

export default function ApiKeysPanel({ localKeys, setLocalKeys, backendKeys }) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">vpn_key</span>
        {t('keys.apiKeys')}
      </h2>

      <div className="space-y-6">
        {KEYS.map(({ field, backend, labelKey, placeholder }) => {
          const localValue = localKeys[field];
          const backendValue = backendKeys[backend];
          return (
            <div key={field}>
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                {t(labelKey)}
              </label>
              <input
                type="password"
                value={localValue}
                onChange={(e) => setLocalKeys((p) => ({ ...p, [field]: e.target.value }))}
                placeholder={backendValue || placeholder}
                className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
              />
              {!localValue && backendValue && (
                <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">cloud_done</span>
                  {t('settings.serverKeyHint', { masked: backendValue })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
