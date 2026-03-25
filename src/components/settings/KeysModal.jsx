import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { apiClient } from '../../services/apiClient';
import { useModalA11y } from '../../hooks/useModalA11y';
import { AI_MODELS, RECOMMENDED_MODELS } from '../../services/ai';
import Button from '../ui/Button';

const providerOptions = [
  { id: 'openai', icon: 'auto_awesome' },
  { id: 'anthropic', icon: 'psychology' },
];

export default function KeysModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, hasApiKey, backendKeys, fetchBackendKeys } = useSettings();

  const [localKeys, setLocalKeys] = useState({
    openaiApiKey: settings.openaiApiKey,
    anthropicApiKey: settings.anthropicApiKey,
    stabilityApiKey: settings.stabilityApiKey,
    geminiApiKey: settings.geminiApiKey,
  });
  const [elevenlabsKey, setElevenlabsKey] = useState(settings.elevenlabsApiKey || '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalKeys({
      openaiApiKey: settings.openaiApiKey,
      anthropicApiKey: settings.anthropicApiKey,
      stabilityApiKey: settings.stabilityApiKey,
      geminiApiKey: settings.geminiApiKey,
    });
  }, [settings.openaiApiKey, settings.anthropicApiKey, settings.stabilityApiKey, settings.geminiApiKey]);

  const handleApply = async () => {
    updateSettings({
      openaiApiKey: localKeys.openaiApiKey,
      anthropicApiKey: localKeys.anthropicApiKey,
      stabilityApiKey: localKeys.stabilityApiKey,
      geminiApiKey: localKeys.geminiApiKey,
      elevenlabsApiKey: elevenlabsKey,
    });

    if (apiClient.isConnected()) {
      try {
        await apiClient.put('/auth/settings', {
          apiKeys: {
            openai: localKeys.openaiApiKey || '',
            anthropic: localKeys.anthropicApiKey || '',
            stability: localKeys.stabilityApiKey || '',
            gemini: localKeys.geminiApiKey || '',
            elevenlabs: elevenlabsKey || '',
          },
        });
        fetchBackendKeys();
      } catch {
        // local save still succeeds
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const providerLabels = {
    openai: t('settings.openaiLabel'),
    anthropic: t('settings.anthropicLabel'),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('keys.title')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">vpn_key</span>
            {t('keys.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1">
          <div className="max-w-5xl mx-auto px-6 lg:px-12 py-8">
            <header className="mb-8 animate-fade-in">
              <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
                {t('keys.subtitle')}
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Provider & Model */}
              <section className="space-y-6 animate-fade-in">
                <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
                  <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-dim">auto_stories</span>
                    {t('settings.aiProvider')}
                  </h2>

                  <div className="space-y-3 mb-8">
                    {providerOptions.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => updateSettings({ aiProvider: opt.id })}
                        className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
                          settings.aiProvider === opt.id
                            ? 'bg-surface-tint/10 border-primary/30 text-primary'
                            : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                        }`}
                      >
                        <span className="material-symbols-outlined">{opt.icon}</span>
                        <span className="font-headline text-sm">{providerLabels[opt.id]}</span>
                        {settings.aiProvider === opt.id && (
                          <span className="material-symbols-outlined text-primary ml-auto text-sm">check_circle</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div>
                    <h3 className="font-headline text-sm text-tertiary mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary-dim text-base">speed</span>
                      {t('settings.modelTier')}
                    </h3>
                    <p className="text-[10px] text-on-surface-variant mb-4">{t('settings.modelTierDesc')}</p>
                    <div className="space-y-2">
                      <button
                        onClick={() => updateSettings({ aiModel: '', aiModelTier: 'premium' })}
                        className={`w-full p-3 rounded-sm border text-left flex items-center gap-3 transition-all ${
                          !settings.aiModel
                            ? 'bg-surface-tint/10 border-primary/30 text-primary'
                            : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                        <div className="flex-1">
                          <span className="font-headline text-sm block">{t('settings.modelRecommended')}</span>
                          <span className="text-[10px] font-label uppercase tracking-widest opacity-70">
                            {AI_MODELS.find((m) => m.id === RECOMMENDED_MODELS[settings.aiProvider])?.label || RECOMMENDED_MODELS[settings.aiProvider]}
                          </span>
                        </div>
                        {!settings.aiModel && (
                          <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          if (!settings.aiModel) {
                            updateSettings({ aiModel: RECOMMENDED_MODELS[settings.aiProvider] });
                          }
                        }}
                        className={`w-full p-3 rounded-sm border text-left flex items-center gap-3 transition-all ${
                          settings.aiModel
                            ? 'bg-surface-tint/10 border-primary/30 text-primary'
                            : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">tune</span>
                        <div className="flex-1">
                          <span className="font-headline text-sm block">{t('settings.modelCustom')}</span>
                          <span className="text-[10px] font-label uppercase tracking-widest opacity-70">
                            {t('settings.modelCustomDesc')}
                          </span>
                        </div>
                        {!!settings.aiModel && (
                          <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                        )}
                      </button>

                      {!!settings.aiModel && (
                        <div className="ml-4 mt-1 space-y-1.5 border-l-2 border-primary/20 pl-3">
                          {AI_MODELS.filter((m) => m.provider === settings.aiProvider).map((m) => (
                            <button
                              key={m.id}
                              onClick={() => updateSettings({ aiModel: m.id })}
                              className={`w-full p-2.5 rounded-sm border text-left flex items-center gap-3 transition-all ${
                                settings.aiModel === m.id
                                  ? 'bg-surface-tint/8 border-primary/25 text-primary'
                                  : 'bg-surface-container-high/30 border-outline-variant/10 text-on-surface-variant hover:border-primary/15'
                              }`}
                            >
                              <span className="material-symbols-outlined text-sm">{m.tier === 'premium' ? 'diamond' : 'bolt'}</span>
                              <div className="flex-1">
                                <span className="font-headline text-xs block">{m.label}</span>
                                <span className="text-[9px] opacity-60 block">{m.cost}</span>
                              </div>
                              {settings.aiModel === m.id && (
                                <span className="material-symbols-outlined text-primary text-xs">check_circle</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {(settings.sceneVisualization || 'image') === 'image' && (
                  <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
                    <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary-dim">image</span>
                      {t('settings.imageProvider')}
                    </h2>

                    <div className="space-y-3 mb-8">
                      {[
                        { id: 'dalle', icon: 'auto_awesome', label: t('settings.dalleLabel') },
                        { id: 'stability', icon: 'speed', label: t('settings.stabilityLabel') },
                        { id: 'gemini', icon: 'stars', label: t('settings.geminiLabel') },
                      ].map((opt) => (
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
                )}

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
              </section>

              {/* Right: API Keys */}
              <section className="space-y-6 animate-fade-in">
                <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
                  <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-dim">vpn_key</span>
                    {t('keys.apiKeys')}
                  </h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                        {t('settings.openaiApiKey')}
                      </label>
                      <input
                        type="password"
                        value={localKeys.openaiApiKey}
                        onChange={(e) => setLocalKeys((p) => ({ ...p, openaiApiKey: e.target.value }))}
                        placeholder={backendKeys.openai ? backendKeys.openai : 'sk-...'}
                        className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                      />
                      {!localKeys.openaiApiKey && backendKeys.openai && (
                        <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">cloud_done</span>
                          {t('settings.serverKeyHint', { masked: backendKeys.openai })}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                        {t('settings.anthropicApiKey')}
                      </label>
                      <input
                        type="password"
                        value={localKeys.anthropicApiKey}
                        onChange={(e) => setLocalKeys((p) => ({ ...p, anthropicApiKey: e.target.value }))}
                        placeholder={backendKeys.anthropic ? backendKeys.anthropic : 'sk-ant-...'}
                        className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                      />
                      {!localKeys.anthropicApiKey && backendKeys.anthropic && (
                        <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">cloud_done</span>
                          {t('settings.serverKeyHint', { masked: backendKeys.anthropic })}
                        </p>
                      )}
                    </div>

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
                      {!localKeys.stabilityApiKey && backendKeys.stability && (
                        <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">cloud_done</span>
                          {t('settings.serverKeyHint', { masked: backendKeys.stability })}
                        </p>
                      )}
                    </div>

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
                      {!localKeys.geminiApiKey && backendKeys.gemini && (
                        <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">cloud_done</span>
                          {t('settings.serverKeyHint', { masked: backendKeys.gemini })}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
                        {t('settings.elevenlabsApiKey')}
                      </label>
                      <input
                        type="password"
                        value={elevenlabsKey}
                        onChange={(e) => setElevenlabsKey(e.target.value)}
                        placeholder={backendKeys.elevenlabs ? backendKeys.elevenlabs : 'xi-...'}
                        className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-sm py-3 px-1 placeholder:text-outline/30 font-mono"
                      />
                      {!elevenlabsKey && backendKeys.elevenlabs && (
                        <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">cloud_done</span>
                          {t('settings.serverKeyHint', { masked: backendKeys.elevenlabs })}
                        </p>
                      )}
                    </div>

                  </div>
                </div>

                <div className="bg-surface-container-highest/60 backdrop-blur-md p-6 rounded-sm border-r border-tertiary/10">
                  <div className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-tertiary mt-1">info</span>
                    <div>
                      <h3 className="font-headline text-tertiary text-sm mb-2">{t('settings.apiKeysTitle')}</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {t('settings.apiKeysDescription')}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-outline-variant/15 bg-surface-container-highest/80 backdrop-blur-xl px-6 lg:px-12 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-8 items-center">
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.activeProvider')}
              </p>
              <p className="font-headline text-tertiary">
                {settings.aiProvider === 'openai' ? t('settings.openaiProvider') : t('settings.anthropicProvider')}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-outline-variant/20 hidden md:block" />
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.modelTier')}
              </p>
              <p className="font-headline text-tertiary">
                {settings.aiModel
                  ? (AI_MODELS.find((m) => m.id === settings.aiModel)?.label || settings.aiModel)
                  : t('settings.modelRecommended')}
              </p>
            </div>
            <div className="h-8 w-[1px] bg-outline-variant/20 hidden md:block" />
            <div className="text-center md:text-left">
              <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                {t('settings.status')}
              </p>
              <p className={`font-headline ${(hasApiKey('openai') || hasApiKey('anthropic')) ? 'text-primary' : 'text-error'}`}>
                {(hasApiKey('openai') || hasApiKey('anthropic'))
                  ? (!(localKeys.openaiApiKey || localKeys.anthropicApiKey) && apiClient.isConnected()
                    ? t('settings.serverKeyActive')
                    : t('settings.keyConfigured'))
                  : t('settings.noKeySet')}
              </p>
            </div>
          </div>
          <Button onClick={handleApply} className="w-full md:w-auto">
            {saved ? t('settings.saved') : t('settings.applyChanges')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
