import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AI_MODELS, RECOMMENDED_MODELS } from '../../../services/ai';

const PROVIDER_OPTIONS = [
  { id: 'openai', icon: 'auto_awesome', envVar: 'OPENAI_API_KEY' },
  { id: 'anthropic', icon: 'psychology', envVar: 'ANTHROPIC_API_KEY' },
];

const BADGE_META = {
  budget:   { icon: 'bolt',           colors: 'bg-primary/10 text-primary-dim border-primary/20' },
  balanced: { icon: 'diamond',        colors: 'bg-tertiary/10 text-tertiary border-tertiary/30' },
  premium:  { icon: 'workspace_premium', colors: 'bg-amber-400/10 text-amber-300 border-amber-400/30' },
  reasoner: { icon: 'psychology',     colors: 'bg-secondary/10 text-secondary border-secondary/25' },
};

export default function AiProviderSection({ settings, updateSettings, backendKeys }) {
  const { t } = useTranslation();
  const providerLabels = {
    openai: t('settings.openaiLabel'),
    anthropic: t('settings.anthropicLabel'),
  };

  const provider = settings.aiProvider;
  const isProviderAvailable = (id) => !!backendKeys?.[id]?.configured;

  // Auto-switch to an available provider if the selected one lost its key.
  // Without this, the user could be locked on a greyed-out provider with no
  // way to pick a working model.
  useEffect(() => {
    if (!backendKeys) return;
    if (provider && !isProviderAvailable(provider)) {
      const fallback = PROVIDER_OPTIONS.find((o) => isProviderAvailable(o.id));
      if (fallback && fallback.id !== provider) {
        updateSettings({ aiProvider: fallback.id, aiModel: '' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendKeys, provider]);
  const sceneModels = AI_MODELS.filter((m) => m.provider === provider && m.sceneBadge);
  const recommendedId = RECOMMENDED_MODELS[provider];
  // Empty aiModel means "use provider default" which also resolves to recommended.
  const effectiveModelId = settings.aiModel || recommendedId;

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">auto_stories</span>
        {t('settings.aiProvider')}
      </h2>

      <div className="space-y-3 mb-8">
        {PROVIDER_OPTIONS.map((opt) => {
          const available = isProviderAvailable(opt.id);
          const selected = provider === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!available}
              title={!available ? t('keys.providerUnavailable', { envVar: opt.envVar }) : undefined}
              onClick={() => available && updateSettings({ aiProvider: opt.id, aiModel: '' })}
              className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
                selected
                  ? 'bg-surface-tint/10 border-primary/30 text-primary'
                  : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
              } ${!available ? 'opacity-40 cursor-not-allowed hover:border-outline-variant/15' : ''}`}
            >
              <span className="material-symbols-outlined">{opt.icon}</span>
              <span className="font-headline text-sm">{providerLabels[opt.id]}</span>
              {!available && (
                <span className="ml-auto text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-error/30 text-error/80 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">lock</span>
                  {opt.envVar}
                </span>
              )}
              {available && selected && (
                <span className="material-symbols-outlined text-primary ml-auto text-sm">check_circle</span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        <h3 className="font-headline text-sm text-tertiary mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-dim text-base">speed</span>
          {t('settings.modelTier')}
        </h3>
        <p className="text-[10px] text-on-surface-variant mb-4 leading-relaxed">{t('settings.modelTierDesc')}</p>
        <div className="space-y-2">
          {sceneModels.map((m) => {
            const meta = BADGE_META[m.sceneBadge];
            const isSelected = effectiveModelId === m.id;
            const isRecommended = m.id === recommendedId;
            return (
              <button
                key={m.id}
                onClick={() => updateSettings({ aiModel: m.id })}
                className={`w-full p-3 rounded-sm border text-left flex items-start gap-3 transition-all ${
                  isSelected
                    ? 'bg-surface-tint/10 border-primary/30 text-primary'
                    : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                }`}
              >
                <span className={`material-symbols-outlined text-sm mt-0.5 ${isSelected ? '' : 'opacity-70'}`}>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-headline text-sm">{m.label}</span>
                    <span className={`text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${meta.colors}`}>
                      {t(`settings.sceneBadge${m.sceneBadge.charAt(0).toUpperCase() + m.sceneBadge.slice(1)}`)}
                    </span>
                    {isRecommended && (
                      <span className="text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm border bg-primary/15 text-primary border-primary/30">
                        {t('settings.modelRecommended')}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-70 block mt-1 leading-relaxed">
                    {t(`settings.sceneBadge${m.sceneBadge.charAt(0).toUpperCase() + m.sceneBadge.slice(1)}Desc`)}
                  </span>
                  <span className="text-[9px] opacity-50 block mt-0.5 font-mono">{m.cost}</span>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined text-primary text-sm mt-0.5">check_circle</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
