import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SdWebuiModelPicker from './SdWebuiModelPicker';

// Which backend env key each image provider option requires. `dalle` and
// `gpt-image` both run through OpenAI so they share the OPENAI_API_KEY gate.
// `sd-webui` has no API key — `configured` mirrors whether SD_WEBUI_URL is
// set on the backend (see GET /v1/auth/api-keys).
const PROVIDER_REQUIREMENTS = {
  dalle:       { keyId: 'openai',    envVar: 'OPENAI_API_KEY' },
  'gpt-image': { keyId: 'openai',    envVar: 'OPENAI_API_KEY' },
  stability:   { keyId: 'stability', envVar: 'STABILITY_API_KEY' },
  gemini:      { keyId: 'gemini',    envVar: 'GEMINI_API_KEY' },
  'sd-webui':  { keyId: 'sd-webui',  envVar: 'SD_WEBUI_URL' },
};

export default function ImageProviderSection({ settings, updateSettings, backendKeys }) {
  const { t } = useTranslation();

  const options = [
    { id: 'dalle', icon: 'auto_awesome', label: t('settings.dalleLabel') },
    { id: 'gpt-image', icon: 'brush', label: t('settings.gptImageLabel') },
    { id: 'stability', icon: 'speed', label: t('settings.stabilityLabel') },
    { id: 'gemini', icon: 'stars', label: t('settings.geminiLabel') },
    { id: 'sd-webui', icon: 'memory', label: t('settings.sdWebuiLabel', 'Stable Diffusion (local)') },
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

  const selectedOption = options.find((o) => o.id === settings.imageProvider) || options[0];
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const renderOptionRow = (opt, { isSelected, asButton, onClick }) => {
    const req = PROVIDER_REQUIREMENTS[opt.id];
    const available = isAvailable(opt.id);
    const disabled = !asButton && !available;
    return (
      <button
        key={asButton ? 'trigger' : opt.id}
        type="button"
        disabled={disabled}
        title={disabled && req ? t('keys.providerUnavailable', { envVar: req.envVar }) : undefined}
        onClick={onClick}
        className={`w-full p-4 rounded-sm border text-left flex items-center gap-3 transition-all ${
          isSelected
            ? 'bg-surface-tint/10 border-primary/30 text-primary'
            : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
        } ${disabled ? 'opacity-40 cursor-not-allowed hover:border-outline-variant/15' : ''}`}
      >
        <span className="material-symbols-outlined">{opt.icon}</span>
        <span className="font-headline text-sm">{opt.label}</span>
        {!available && req && (
          <span className="ml-auto text-[9px] font-label uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-error/30 text-error/80 flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">lock</span>
            {req.envVar}
          </span>
        )}
        {asButton ? (
          <span className={`material-symbols-outlined text-sm ml-auto transition-transform ${isOpen ? 'rotate-180' : ''} ${isSelected ? 'text-primary' : 'opacity-70'}`}>
            expand_more
          </span>
        ) : (
          available && isSelected && (
            <span className="material-symbols-outlined text-primary ml-auto text-sm">check_circle</span>
          )
        )}
      </button>
    );
  };

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
    <div className={`relative bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-primary/20 ${isOpen ? 'z-30' : ''}`}>
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">image</span>
        {t('settings.imageProvider')}
      </h2>

      <div className="relative mb-8" ref={dropdownRef}>
        {renderOptionRow(selectedOption, {
          isSelected: true,
          asButton: true,
          onClick: () => setIsOpen((v) => !v),
        })}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-surface-container-high/95 backdrop-blur-xl border border-outline-variant/20 rounded-sm shadow-lg p-2 space-y-3 max-h-96 overflow-y-auto">
            {options.map((opt) => renderOptionRow(opt, {
              isSelected: settings.imageProvider === opt.id,
              asButton: false,
              onClick: () => {
                if (!isAvailable(opt.id)) return;
                updateSettings({ imageProvider: opt.id });
                setIsOpen(false);
              },
            }))}
          </div>
        )}
      </div>

      {(settings.imageProvider === 'dalle' || settings.imageProvider === 'gpt-image') && renderEnvStatus('openai', 'OPENAI_API_KEY')}
      {settings.imageProvider === 'stability' && renderEnvStatus('stability', 'STABILITY_API_KEY')}
      {settings.imageProvider === 'gemini' && renderEnvStatus('gemini', 'GEMINI_API_KEY')}
      {settings.imageProvider === 'sd-webui' && (
        <>
          {renderEnvStatus('sd-webui', 'SD_WEBUI_URL')}
          {isAvailable('sd-webui') && (
            <SdWebuiModelPicker settings={settings} updateSettings={updateSettings} />
          )}
        </>
      )}
    </div>
  );
}
