import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Which backend env key each image provider option requires. `dalle` and
// `gpt-image` both run through OpenAI so they share the OPENAI_API_KEY gate.
const PROVIDER_REQUIREMENTS = {
  dalle:       { keyId: 'openai',    envVar: 'OPENAI_API_KEY' },
  'gpt-image': { keyId: 'openai',    envVar: 'OPENAI_API_KEY' },
  stability:   { keyId: 'stability', envVar: 'STABILITY_API_KEY' },
  gemini:      { keyId: 'gemini',    envVar: 'GEMINI_API_KEY' },
};

export default function ImageProviderSection({ settings, updateSettings, backendKeys }) {
  const { t } = useTranslation();

  const options = [
    { id: 'dalle', icon: 'auto_awesome', label: t('settings.dalleLabel') },
    { id: 'gpt-image', icon: 'brush', label: t('settings.gptImageLabel') },
    { id: 'stability', icon: 'speed', label: t('settings.stabilityLabel') },
    { id: 'gemini', icon: 'stars', label: t('settings.geminiLabel') },
  ];

  const isAvailable = (optId) => {
    const req = PROVIDER_REQUIREMENTS[optId];
    if (!req) return true;
    return !!backendKeys?.[req.keyId]?.configured;
  };

  // If the currently selected provider became unavailable (e.g. key removed
  // server-side), fall back to the first available option so the user never
  // ends up stuck on a disabled choice.
  useEffect(() => {
    const current = settings.imageProvider;
    if (current && !isAvailable(current)) {
      const fallback = options.find((o) => isAvailable(o.id));
      if (fallback && fallback.id !== current) {
        updateSettings({ imageProvider: fallback.id });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendKeys, settings.imageProvider]);

  function renderEnvStatus(providerKey, envVar) {
    const entry = backendKeys?.[providerKey];
    const configured = !!entry?.configured;
    return (
      <div>
        <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
          {envVar}
        </label>
        {configured ? (
          <p className="text-[11px] text-primary/80 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">cloud_done</span>
            {t('keys.statusAvailable', { masked: entry?.masked })}
          </p>
        ) : (
          <p className="text-[11px] text-error/80 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">cloud_off</span>
            {t('keys.statusMissing')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">image</span>
        {t('settings.imageProvider')}
      </h2>

      <div className="space-y-3 mb-8">
        {options.map((opt) => {
          const available = isAvailable(opt.id);
          const req = PROVIDER_REQUIREMENTS[opt.id];
          const selected = settings.imageProvider === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!available}
              title={!available && req ? t('keys.providerUnavailable', { envVar: req.envVar }) : undefined}
              onClick={() => available && updateSettings({ imageProvider: opt.id })}
              className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
                selected
                  ? 'bg-surface-tint/10 border-primary/30 text-primary'
                  : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
              } ${!available ? 'opacity-40 cursor-not-allowed hover:border-outline-variant/15' : ''}`}
            >
              <span className="material-symbols-outlined">{opt.icon}</span>
              <span className="font-headline text-sm">{opt.label}</span>
              {!available && req && (
                <span className="ml-auto text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-error/30 text-error/80 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">lock</span>
                  {req.envVar}
                </span>
              )}
              {available && selected && (
                <span className="material-symbols-outlined text-primary ml-auto text-sm">check_circle</span>
              )}
            </button>
          );
        })}
      </div>

      {(settings.imageProvider === 'dalle' || settings.imageProvider === 'gpt-image') && renderEnvStatus('openai', 'OPENAI_API_KEY')}
      {settings.imageProvider === 'stability' && renderEnvStatus('stability', 'STABILITY_API_KEY')}
      {settings.imageProvider === 'gemini' && renderEnvStatus('gemini', 'GEMINI_API_KEY')}
    </div>
  );
}
