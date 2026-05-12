import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const OVERRIDABLE_PROVIDERS = [
  { id: 'openai', labelKey: 'settings.openaiApiKey', envVar: 'OPENAI_API_KEY' },
  { id: 'anthropic', labelKey: 'settings.anthropicApiKey', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', labelKey: 'settings.geminiApiKey', envVar: 'GEMINI_API_KEY' },
  { id: 'stability', labelKey: 'settings.stabilityApiKey', envVar: 'STABILITY_API_KEY' },
  { id: 'elevenlabs', labelKey: 'keys.elevenlabsKey', envVar: 'ELEVENLABS_API_KEY' },
  { id: 'meshy', labelKey: 'keys.meshyKey', envVar: 'MESHY_API_KEY' },
];

export default function ApiKeyOverridesSection({ backendKeys, backendKeyOverrides, onSave }) {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const handleChange = (id, value) => {
    setInputs((prev) => ({ ...prev, [id]: value }));
  };

  const handleClear = (id) => {
    setInputs((prev) => ({ ...prev, [id]: '' }));
    handleSave({ [id]: '' });
  };

  const handleSave = async (override) => {
    setSaving(true);
    setToast(null);
    try {
      const keys = override || {};
      if (!override) {
        for (const [id, value] of Object.entries(inputs)) {
          if (value !== undefined) keys[id] = value;
        }
      }
      await onSave(keys);
      if (!override) setInputs({});
      setToast({ type: 'success', text: t('keys.overridesSaved') });
    } catch (err) {
      setToast({ type: 'error', text: err.message || t('keys.overridesSaveError') });
    }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  const hasChanges = Object.values(inputs).some((v) => v !== undefined && v !== '');

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm border-l border-tertiary/20">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="font-mono text-sm text-tertiary flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-tertiary/70">admin_panel_settings</span>
          {t('keys.overridesTitle')}
        </h2>
        {hasChanges && (
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="shrink-0 px-4 py-1.5 rounded-sm bg-primary/15 border border-primary/30 text-primary text-xs font-label uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            {saving ? t('keys.modelsSaving') : t('keys.modelsSaveBtn')}
          </button>
        )}
      </div>
      <p className="font-mono text-xs text-on-surface-variant/70 mb-6 leading-relaxed">
        # {t('keys.overridesHint')}
      </p>

      {toast && (
        <div className={`text-xs px-3 py-2 rounded-sm border mb-4 ${
          toast.type === 'success'
            ? 'bg-primary/10 border-primary/20 text-primary'
            : 'bg-error/10 border-error/20 text-error'
        }`}>
          {toast.text}
        </div>
      )}

      <div className="space-y-3">
        {OVERRIDABLE_PROVIDERS.map((provider) => {
          const override = backendKeyOverrides?.[provider.id];
          const envEntry = backendKeys?.[provider.id];
          const hasOverride = !!override?.configured;
          const inputValue = inputs[provider.id] ?? '';

          return (
            <div key={provider.id} className="font-mono text-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-on-surface">{t(provider.labelKey, { defaultValue: provider.id })}</span>
                <span className="text-on-surface-variant/40">&mdash;</span>
                <span className="text-tertiary/60 text-xs">{provider.envVar}</span>
                {hasOverride && (
                  <span className="text-xs px-1.5 py-0.5 rounded-sm bg-tertiary/10 border border-tertiary/20 text-tertiary/80">
                    {t('keys.overrideActive', { masked: override.masked })}
                  </span>
                )}
                {!hasOverride && envEntry?.envConfigured && (
                  <span className="text-xs text-on-surface-variant/40">
                    env: {envEntry.masked}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) => handleChange(provider.id, e.target.value)}
                  placeholder={hasOverride ? t('keys.overridePlaceholderReplace') : t('keys.overridePlaceholder')}
                  className="flex-1 text-xs bg-surface-container-lowest border border-outline-variant/15 rounded-sm px-3 py-2 text-on-surface placeholder:text-on-surface-variant/30 focus:border-primary/40 focus:ring-0 focus:outline-none font-mono"
                  autoComplete="off"
                />
                {hasOverride && (
                  <button
                    type="button"
                    onClick={() => handleClear(provider.id)}
                    disabled={saving}
                    title={t('keys.overrideClear')}
                    className="text-error/60 hover:text-error transition-colors disabled:opacity-40 shrink-0"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
