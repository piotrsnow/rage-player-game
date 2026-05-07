import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import ImageProviderSection from './keys/ImageProviderSection';
import SceneVisualizationSection from './sections/SceneVisualizationSection';
import ImagePromptLlmSection from './sections/ImagePromptLlmSection';
import ImagePlaygroundSection from './sections/ImagePlaygroundSection';
import EffectIntensitySection from './sections/EffectIntensitySection';
import IpAdapterSection from './sections/IpAdapterSection';
import Toggle from '../ui/Toggle';

const RESOLUTION_OPTIONS = [
  { value: 0.125, label: 'x1/8' },
  { value: 0.25,  label: 'x1/4' },
  { value: 0.5,   label: 'x1/2' },
  { value: 1,     label: 'x1' },
];

function roundTo8(v) {
  return Math.max(256, Math.round(v / 8) * 8);
}

function ResolutionMultiplierSection({ settings, updateSettings }) {
  const { t } = useTranslation();
  const current = settings.imageResolutionMultiplier ?? 1;
  const baseW = 1344;
  const baseH = 512;
  const effectiveW = roundTo8(baseW * current);
  const effectiveH = roundTo8(baseH * current);

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm">
      <p className="font-headline text-tertiary mb-1">{t('imageConfig.resolution.title')}</p>
      <p className="text-xs text-on-surface-variant/70 mb-4">
        {t('imageConfig.resolution.hint', { width: effectiveW, height: effectiveH })}
      </p>
      <div className="flex gap-2">
        {RESOLUTION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateSettings({ imageResolutionMultiplier: opt.value })}
            className={`px-4 py-2 rounded-sm text-sm font-label transition-all ${
              current === opt.value
                ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                : 'bg-surface-container-highest/40 text-on-surface-variant hover:bg-surface-container-highest/60'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const IMAGE_PROVIDERS = [
  { id: 'dalle', icon: 'auto_awesome', label: 'DALL-E 3', keyId: 'openai' },
  { id: 'gpt-image', icon: 'brush', label: 'GPT Image', keyId: 'openai' },
  { id: 'stability', icon: 'speed', label: 'Stability AI', keyId: 'stability' },
  { id: 'gemini', icon: 'stars', label: 'Gemini', keyId: 'gemini' },
  { id: 'sd-webui', icon: 'memory', label: 'Stable Diffusion (local)', keyId: 'sd-webui' },
];

export default function ImageConfigModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { settings, updateSettings, updateDMSettings, backendKeys, backendUser, sceneModelConfig, updateSceneModelConfig } = useSettings();
  const isAdmin = !!backendUser?.isAdmin;

  const showImageProvider = (settings.sceneVisualization || 'image') === 'image';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('imageConfig.title')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">brush</span>
            {t('imageConfig.title')}
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
                {t('imageConfig.subtitle')}
              </p>
            </header>

            <div className="space-y-6 animate-fade-in">
              <SceneVisualizationSection
                settings={settings}
                updateSettings={updateSettings}
                updateDMSettings={updateDMSettings}
              />

              {showImageProvider && (
                <ResolutionMultiplierSection
                  settings={settings}
                  updateSettings={updateSettings}
                />
              )}

              {showImageProvider && settings.imageProvider === 'sd-webui' && (
                <IpAdapterSection
                  settings={settings}
                  updateSettings={updateSettings}
                />
              )}

              {showImageProvider && isAdmin && (
                <div className="relative bg-[#1a0c1e]/80 rounded-sm ring-1 ring-[#4a1838]/40">
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] text-[#c59aff]/50 font-label uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                    Admin
                  </div>
                  <ImageProviderSection
                    settings={settings}
                    updateSettings={updateSettings}
                    backendKeys={backendKeys}
                  />
                </div>
              )}

              {isAdmin && (
                <div className="relative bg-[#1a0c1e]/80 rounded-sm ring-1 ring-[#4a1838]/40">
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] text-[#c59aff]/50 font-label uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                    Admin
                  </div>
                  <div className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm">
                    <p className="font-headline text-tertiary mb-4">{t('sceneModelConfig.imageTitle')}</p>
                    <div className="space-y-3">
                      {IMAGE_PROVIDERS.map((p) => {
                        const entry = sceneModelConfig?.image?.[p.id] || {};
                        const keyAvailable = !!backendKeys?.[p.keyId]?.configured;
                        return (
                          <div key={p.id} className={`flex items-center gap-3 p-3 rounded-sm border border-outline-variant/15 ${!keyAvailable ? 'opacity-50' : ''}`}>
                            <span className="material-symbols-outlined text-sm text-on-surface-variant">{p.icon}</span>
                            <span className="font-headline text-xs text-on-surface-variant flex-shrink-0 w-36">{p.label}</span>
                            {keyAvailable ? (
                              <>
                                <Toggle
                                  checked={!!entry.enabled}
                                  onClick={() => updateSceneModelConfig({ image: { [p.id]: { enabled: !entry.enabled } } })}
                                />
                                <div className="flex items-center gap-1 ml-auto">
                                  <span className="text-[10px] text-on-surface-variant font-mono">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={entry.pricePerScene ?? ''}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (Number.isFinite(val) && val >= 0) {
                                        updateSceneModelConfig({ image: { [p.id]: { pricePerScene: val } } });
                                      }
                                    }}
                                    placeholder="0.00"
                                    className="w-20 bg-surface-container-high/80 border border-outline-variant/20 rounded-sm px-2 py-1 text-xs font-mono text-on-surface focus:border-primary/40 focus:outline-none"
                                  />
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] text-error/70 ml-auto">{t('sceneModelConfig.noKeyHint')}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {showImageProvider && (
                <ImagePromptLlmSection
                  settings={settings}
                  updateSettings={updateSettings}
                />
              )}

              {showImageProvider && isAdmin && (
                <div className="relative bg-[#1a0c1e]/80 rounded-sm ring-1 ring-[#4a1838]/40">
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-[9px] text-[#c59aff]/50 font-label uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                    Admin
                  </div>
                  <ImagePlaygroundSection />
                </div>
              )}

              <EffectIntensitySection settings={settings} updateSettings={updateSettings} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
