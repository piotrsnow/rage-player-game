import { useTranslation } from 'react-i18next';

const TTS_OPTIONS = [
  { id: 'none', icon: 'volume_off', cost: 0 },
  { id: 'local', icon: 'computer', cost: 0.02 },
  { id: 'best', icon: 'record_voice_over', cost: 0.10 },
];

const IMAGE_OPTIONS = [
  { id: 'none', icon: 'visibility_off', cost: 0 },
  { id: 'good', icon: 'auto_awesome', cost: 0.10 },
  { id: 'local', icon: 'computer', cost: 0.02 },
];

const BASE_COST = 0.05;

function fmt(v) {
  return v.toFixed(2);
}

export default function SceneCostSection({ settings, updateSettings }) {
  const { t } = useTranslation();

  const ttsTier = settings.sceneTtsTier || 'none';
  const imageTier = settings.sceneImageTier || 'none';

  const ttsCost = TTS_OPTIONS.find((o) => o.id === ttsTier)?.cost || 0;
  const imageCost = IMAGE_OPTIONS.find((o) => o.id === imageTier)?.cost || 0;
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
          {TTS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => updateSettings({ sceneTtsTier: opt.id })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
                ttsTier === opt.id
                  ? 'bg-surface-tint/10 border-primary/30 text-primary'
                  : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{opt.icon}</span>
              <span className="font-headline text-xs">{t(`sceneCost.tts.${opt.id}`)}</span>
              {opt.cost > 0 && (
                <span className="text-[10px] font-mono opacity-70">+${fmt(opt.cost)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-headline text-on-surface-variant mb-2">{t('sceneCost.imageLabel')}</p>
        <div className="flex gap-2">
          {IMAGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => updateSettings({ sceneImageTier: opt.id })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
                imageTier === opt.id
                  ? 'bg-surface-tint/10 border-primary/30 text-primary'
                  : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{opt.icon}</span>
              <span className="font-headline text-xs">{t(`sceneCost.image.${opt.id}`)}</span>
              {opt.cost > 0 && (
                <span className="text-[10px] font-mono opacity-70">+${fmt(opt.cost)}</span>
              )}
            </button>
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
