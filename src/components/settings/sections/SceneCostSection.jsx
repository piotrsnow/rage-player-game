import { useTranslation } from 'react-i18next';

const BASE_COST = 0.05;

const TTS_PROVIDERS = [
  { id: 'elevenlabs', icon: 'cloud', keyId: 'elevenlabs' },
  { id: 'xtts', icon: 'computer', keyId: 'xtts' },
];

const IMAGE_PROVIDERS = [
  { id: 'dalle', icon: 'auto_awesome', keyId: 'openai' },
  { id: 'gpt-image', icon: 'brush', keyId: 'openai' },
  { id: 'stability', icon: 'speed', keyId: 'stability' },
  { id: 'gemini', icon: 'stars', keyId: 'gemini' },
  { id: 'sd-webui', icon: 'memory', keyId: 'sd-webui' },
];

function fmt(v) {
  return v.toFixed(2);
}

function isProviderUsable(provider, category, sceneModelConfig, backendKeys) {
  const keyConfigured = !!backendKeys?.[provider.keyId]?.configured;
  const entry = sceneModelConfig?.[category]?.[provider.id];
  const adminEnabled = !!entry?.enabled;
  return keyConfigured && adminEnabled;
}

function getProviderPrice(providerId, category, sceneModelConfig) {
  return sceneModelConfig?.[category]?.[providerId]?.pricePerScene ?? 0;
}

function ProviderButton({ provider, category, selected, onSelect, sceneModelConfig, backendKeys, t }) {
  const usable = isProviderUsable(provider, category, sceneModelConfig, backendKeys);
  const price = getProviderPrice(provider.id, category, sceneModelConfig);
  const keyConfigured = !!backendKeys?.[provider.keyId]?.configured;

  let disabledReason = null;
  if (!keyConfigured) disabledReason = t('sceneCost.providerNoKey');
  else if (!usable) disabledReason = t('sceneCost.providerDisabled');

  return (
    <button
      onClick={() => usable && onSelect(provider.id)}
      disabled={!usable}
      title={disabledReason || undefined}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
        selected
          ? 'bg-surface-tint/10 border-primary/30 text-primary'
          : usable
            ? 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            : 'bg-surface-container-high/20 border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
      }`}
    >
      <span className="material-symbols-outlined text-sm">{provider.icon}</span>
      <span className="font-headline text-xs">{t(`sceneCost.${category}.${provider.id}`)}</span>
      {price > 0 && usable && (
        <span className="text-[10px] font-mono opacity-70">+${fmt(price)}</span>
      )}
      {!usable && (
        <span className="material-symbols-outlined text-[12px] opacity-50">lock</span>
      )}
    </button>
  );
}

export default function SceneCostSection({ settings, updateSettings, sceneModelConfig, backendKeys }) {
  const { t } = useTranslation();

  const ttsTier = settings.sceneTtsTier || 'none';
  const imageTier = settings.sceneImageTier || 'none';

  const ttsCost = ttsTier !== 'none' ? getProviderPrice(ttsTier, 'tts', sceneModelConfig) : 0;
  const imageCost = imageTier !== 'none' ? getProviderPrice(imageTier, 'image', sceneModelConfig) : 0;
  const totalCost = BASE_COST + ttsCost + imageCost;

  return (
    <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors space-y-5">
      <div>
        <p className="font-headline text-tertiary flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-dim text-lg">payments</span>
          {t('sceneCost.title')}
        </p>
        <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
          {t('sceneCost.subtitle')}
        </p>
      </div>

      <div>
        <p className="text-xs font-headline text-on-surface-variant mb-2">{t('sceneCost.ttsLabel')}</p>
        <div className="flex gap-2">
          <button
            onClick={() => updateSettings({ sceneTtsTier: 'none' })}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
              ttsTier === 'none'
                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm">volume_off</span>
            <span className="font-headline text-xs">{t('sceneCost.tts.none')}</span>
          </button>
          {TTS_PROVIDERS.map((p) => (
            <ProviderButton
              key={p.id}
              provider={p}
              category="tts"
              selected={ttsTier === p.id}
              onSelect={(id) => updateSettings({ sceneTtsTier: id })}
              sceneModelConfig={sceneModelConfig}
              backendKeys={backendKeys}
              t={t}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-headline text-on-surface-variant mb-2">{t('sceneCost.imageLabel')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateSettings({ sceneImageTier: 'none' })}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
              imageTier === 'none'
                ? 'bg-surface-tint/10 border-primary/30 text-primary'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm">visibility_off</span>
            <span className="font-headline text-xs">{t('sceneCost.image.none')}</span>
          </button>
          {IMAGE_PROVIDERS.map((p) => (
            <ProviderButton
              key={p.id}
              provider={p}
              category="image"
              selected={imageTier === p.id}
              onSelect={(id) => updateSettings({ sceneImageTier: id })}
              sceneModelConfig={sceneModelConfig}
              backendKeys={backendKeys}
              t={t}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-outline-variant/15">
        <span className="text-xs text-on-surface-variant">
          {t('sceneCost.base')}: <span className="font-mono">${fmt(BASE_COST)}</span>
        </span>
        <span className="text-sm font-bold font-mono text-primary">
          {t('sceneCost.perScene')}: ${fmt(totalCost)}
        </span>
      </div>
    </div>
  );
}
