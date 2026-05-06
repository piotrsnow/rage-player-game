import { useTranslation } from 'react-i18next';
import Toggle from '../../ui/Toggle';

const PROMPT_LLM_MODELS = [
  { provider: 'openai', id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { provider: 'openai', id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { provider: 'openai', id: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
  { provider: 'anthropic', id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

export default function ImagePromptLlmSection({ settings, updateSettings }) {
  const { t } = useTranslation();
  const enabled = !!settings.imagePromptLlmEnabled;
  const customStyleEnabled = !!settings.imagePromptCustomStyleEnabled;

  const selectedModelId = settings.imagePromptLlmModel || '';
  const selectedProvider = settings.imagePromptLlmProvider || 'openai';

  function handleModelChange(e) {
    const modelId = e.target.value;
    const entry = PROMPT_LLM_MODELS.find((m) => m.id === modelId);
    updateSettings({
      imagePromptLlmModel: modelId,
      imagePromptLlmProvider: entry?.provider || 'openai',
    });
  }

  return (
    <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-primary-dim">auto_awesome</span>
          <div>
            <p className="font-headline text-tertiary">{t('imageConfig.promptLlm.title')}</p>
            <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-0.5">
              {t('imageConfig.promptLlm.desc')}
            </p>
          </div>
        </div>
        <Toggle
          checked={enabled}
          onClick={() => updateSettings({ imagePromptLlmEnabled: !enabled })}
        />
      </div>

      {enabled && (
        <div className="space-y-4 mt-4 pl-2 border-l-2 border-primary/20">
          <div>
            <label className="block text-xs font-label text-on-surface-variant uppercase tracking-widest mb-1.5">
              {t('imageConfig.promptLlm.modelLabel')}
            </label>
            <select
              value={selectedModelId}
              onChange={handleModelChange}
              className="w-full bg-surface-container-highest/60 border border-outline-variant/20 rounded-sm px-3 py-2 text-sm text-on-surface font-body focus:border-primary/40 focus:outline-none transition-colors"
            >
              <option value="">{t('imageConfig.promptLlm.modelDefault')}</option>
              {PROMPT_LLM_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-surface-container-high/40 rounded-sm border border-outline-variant/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary-dim">edit_note</span>
              <div>
                <p className="font-headline text-tertiary text-sm">{t('imageConfig.promptLlm.customStyleLabel')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-0.5">
                  {t('imageConfig.promptLlm.customStyleDesc')}
                </p>
              </div>
            </div>
            <Toggle
              checked={customStyleEnabled}
              onClick={() => updateSettings({ imagePromptCustomStyleEnabled: !customStyleEnabled })}
            />
          </div>

          {customStyleEnabled && (
            <div>
              <textarea
                value={settings.imagePromptCustomStyle || ''}
                onChange={(e) => updateSettings({ imagePromptCustomStyle: e.target.value })}
                placeholder={t('imageConfig.promptLlm.customStylePlaceholder')}
                rows={4}
                maxLength={1000}
                className="w-full bg-surface-container-highest/60 border border-outline-variant/20 rounded-sm px-3 py-2 text-sm text-on-surface font-body placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none resize-y min-h-[80px] transition-colors"
              />
              <p className="text-[10px] text-on-surface-variant/70 mt-1 text-right">
                {(settings.imagePromptCustomStyle || '').length}/1000
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
