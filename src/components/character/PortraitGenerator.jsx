import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { apiClient, toCanonicalStoragePath } from '../../services/apiClient';
import { imageService } from '../../services/imageGen';
import WebcamCapture from '../ui/WebcamCapture';

// Raised across the board: with plain img2img (no ControlNet/IP-Adapter) the
// reference photo dominates at low denoise — you get "me in a filter" instead
// of a fantasy portrait. Sweet spot for "fantasy character with my face" on
// SDXL img2img is 0.7–0.85; below 0.5 the original photo bleeds through too
// much (modern clothes, indoor bg, phone-photo lighting).
const STRENGTH_PRESETS = [
  { value: 0.55, labelKey: 'charCreator.strengthSubtle' },
  { value: 0.7, labelKey: 'charCreator.strengthBalanced' },
  { value: 0.85, labelKey: 'charCreator.strengthIntense' },
];

const EMOTION_KEYS = ['anger', 'joy', 'mockery', 'sadness', 'nostalgia'];
const EMOTION_LABEL_KEYS = {
  anger: 'charCreator.emotionAnger',
  joy: 'charCreator.emotionJoy',
  mockery: 'charCreator.emotionMockery',
  sadness: 'charCreator.emotionSadness',
  nostalgia: 'charCreator.emotionNostalgia',
};
const EMOTIONS_DEFAULT = Object.freeze({
  anger: 11,
  joy: 68,
  mockery: 96,
  sadness: 0,
  nostalgia: 23,
});
const EMOTIONS_MAX_SUM = 200;
const LIKENESS_DEFAULT = 25;

// Proportional rebalance: when a single slider is raised past the headroom,
// shrink every other slider by the same ratio so the combined sum stays <= 200.
// Zeros stay zero; larger values shrink more (in absolute terms).
function rebalanceEmotions(current, key, rawNext) {
  const next = Math.max(0, Math.min(100, Math.round(Number(rawNext) || 0)));
  const othersKeys = EMOTION_KEYS.filter((k) => k !== key);
  const othersSum = othersKeys.reduce((acc, k) => acc + (current[k] || 0), 0);
  const headroom = EMOTIONS_MAX_SUM - next;
  if (othersSum <= headroom) {
    return { ...current, [key]: next };
  }
  const scale = headroom / othersSum;
  const result = { ...current, [key]: next };
  for (const k of othersKeys) {
    result[k] = Math.max(0, Math.floor((current[k] || 0) * scale));
  }
  return result;
}

function EmotionSliders({ emotions, onChange, t }) {
  const total = EMOTION_KEYS.reduce((acc, k) => acc + (emotions[k] || 0), 0);
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
          {t('charCreator.emotionsTitle')}
        </span>
        <span className={`text-[10px] font-label tabular-nums ${total >= EMOTIONS_MAX_SUM ? 'text-primary' : 'text-outline'}`}>
          {t('charCreator.emotionsTotal')} {total}/{EMOTIONS_MAX_SUM}
        </span>
      </div>
      <div className="space-y-1.5">
        {EMOTION_KEYS.map((k) => (
          <div key={k}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-label text-on-surface-variant">
                {t(EMOTION_LABEL_KEYS[k])}
              </span>
              <span className="text-[10px] font-bold text-primary tabular-nums">
                {emotions[k] || 0}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={emotions[k] || 0}
              onChange={(e) => onChange(k, Number(e.target.value))}
              className="w-full appearance-none mana-slider bg-transparent cursor-pointer"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortraitGenerator({ species, age, gender, careerName, genre, onPortraitReady, initialPortrait }) {
  const { t } = useTranslation();
  const { settings, hasApiKey } = useSettings();

  const provider = settings.imageProvider || 'dalle';
  const isDalle = provider === 'dalle';
  const isGptImage = provider === 'gpt-image';
  const isGemini = provider === 'gemini';
  const isSdWebui = provider === 'sd-webui';
  const canUseReferenceImage = isGemini || isGptImage || isSdWebui || provider === 'stability';
  const requiresReferenceImage = provider === 'stability';
  const apiKey = null;
  const keyProvider = (isDalle || isGptImage)
    ? 'openai'
    : isGemini
      ? 'gemini'
      : isSdWebui
        ? 'sd-webui'
        : 'stability';
  const hasKey = settings.useBackend && hasApiKey(keyProvider);

  const [photoBlob, setPhotoBlob] = useState(null);
  const [strength, setStrength] = useState(0.7);
  const [likeness, setLikeness] = useState(LIKENESS_DEFAULT);
  const [emotions, setEmotions] = useState({ ...EMOTIONS_DEFAULT });
  const [generating, setGenerating] = useState(false);
  // Canonical `/v1/media/file/...` path — this is what we persist via
  // `onPortraitReady`. `resolveMediaUrl` is only applied at render time
  // for the <img> src below.
  const [generatedUrl, setGeneratedUrl] = useState(() => toCanonicalStoragePath(initialPortrait) || null);
  const [error, setError] = useState(null);
  const [showCapture, setShowCapture] = useState(!initialPortrait);
  const [captureSession, setCaptureSession] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setLightboxOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  const handleEmotionChange = useCallback((key, value) => {
    setEmotions((current) => rebalanceEmotions(current, key, value));
  }, []);

  const abortRef = useRef(false);

  const handleCapture = useCallback((blob) => {
    setPhotoBlob(blob);
    setGeneratedUrl(null);
    setError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (requiresReferenceImage && !photoBlob) return;
    setGenerating(true);
    setError(null);
    abortRef.current = false;

    try {
      const url = await imageService.generatePortrait(
        canUseReferenceImage ? photoBlob : null,
        { species, age, gender, careerName, genre },
        apiKey,
        strength,
        provider,
        settings.dmSettings?.imageStyle || 'painting',
        settings.dmSettings?.darkPalette || false,
        settings.dmSettings?.narratorSeriousness ?? null,
        settings.sdWebuiModel || null,
        { likeness, emotions },
        Number.isInteger(settings.sdWebuiSeed) ? settings.sdWebuiSeed : null,
      );
      if (!abortRef.current) {
        setGeneratedUrl(url);
        setShowCapture(false);
      }
    } catch (err) {
      if (!abortRef.current) {
        if (err.message === 'CONTENT_FILTERED') {
          setError(t('charCreator.portraitFiltered'));
        } else {
          setError(err.message);
        }
      }
    } finally {
      if (!abortRef.current) setGenerating(false);
    }
  }, [photoBlob, species, age, gender, careerName, genre, apiKey, strength, provider, requiresReferenceImage, canUseReferenceImage, t, settings.dmSettings?.imageStyle, settings.dmSettings?.darkPalette, settings.dmSettings?.narratorSeriousness, settings.sdWebuiModel, settings.sdWebuiSeed, likeness, emotions]);

  const handleAccept = useCallback(() => {
    onPortraitReady(generatedUrl);
  }, [generatedUrl, onPortraitReady]);

  // Pon\u00f3w: re-run generation with the current form state (keep photo +
  // sliders). Clearing the form is the trash button's job.
  const handleRetry = useCallback(() => {
    handleGenerate();
  }, [handleGenerate]);

  const handleRemove = useCallback(() => {
    setGeneratedUrl(null);
    setPhotoBlob(null);
    setShowCapture(canUseReferenceImage);
    setCaptureSession((value) => value + 1);
    setError(null);
    setStrength(0.45);
    setLikeness(LIKENESS_DEFAULT);
    setEmotions({ ...EMOTIONS_DEFAULT });
    onPortraitReady(null);
  }, [onPortraitReady, canUseReferenceImage]);

  if (!hasKey) {
    return (
      <div className="flex items-center gap-2 p-3 bg-surface-container-high/20 border border-outline-variant/10 rounded-sm">
        <span className="material-symbols-outlined text-sm text-outline">info</span>
        <p className="text-xs text-on-surface-variant">
          {t('charCreator.portraitNeedsKey', 'Backend image generation is unavailable. Connect backend and configure server API keys.')}
        </p>
      </div>
    );
  }

  if (generatedUrl && !showCapture) {
    const resolvedSrc = apiClient.resolveMediaUrl(generatedUrl);
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={t('charCreator.zoomInPortrait', 'Powiększ portret')}
          className="group relative w-full max-w-[220px] aspect-[3/4] rounded-sm overflow-hidden border border-primary/30 shadow-[0_0_20px_rgba(197,154,255,0.15)] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <img
            src={resolvedSrc}
            alt="Fantasy portrait"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={() => { setGeneratedUrl(null); setShowCapture(canUseReferenceImage); }}
          />
          <div className="absolute top-1.5 right-1.5">
            <span className="material-symbols-outlined text-sm text-primary drop-shadow-lg">auto_awesome</span>
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <span className="material-symbols-outlined text-3xl text-white drop-shadow-lg">zoom_in</span>
          </div>
        </button>
        {lightboxOpen && createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('charCreator.zoomInPortrait', 'Powiększ portret')}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in cursor-zoom-out p-6"
          >
            <img
              src={resolvedSrc}
              alt="Fantasy portrait"
              onClick={(e) => e.stopPropagation()}
              className="max-w-[min(92vw,900px)] max-h-[92vh] object-contain rounded-sm border border-primary/30 shadow-[0_0_40px_rgba(197,154,255,0.25)] animate-scale-in cursor-default"
            />
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label={t('common.close', 'Zamknij')}
              className="absolute top-4 right-4 flex items-center justify-center w-10 h-10 rounded-sm bg-surface-container/80 border border-outline-variant/30 text-on-surface hover:text-primary hover:border-primary/40 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>,
          document.body,
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            className="flex items-center gap-1.5 px-4 py-2 bg-surface-tint text-on-primary text-xs font-label font-bold rounded-sm border border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] transition-all"
          >
            <span className="material-symbols-outlined text-sm">check</span>
            {t('charCreator.acceptPortrait')}
          </button>
          <button
            type="button"
            onClick={handleRetry}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className={`material-symbols-outlined text-sm ${generating ? 'animate-spin' : ''}`}>
              {generating ? 'progress_activity' : 'restart_alt'}
            </span>
            {t('charCreator.retryPortrait')}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={generating}
            className="px-3 py-2 text-xs font-label text-on-surface-variant hover:text-error transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>
    );
  }

  if (isDalle) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-[11px] text-on-surface-variant text-center max-w-[280px]">
          {t('charCreator.portraitDescDalle')}
        </p>

        <div className="w-full max-w-[280px]">
          <EmotionSliders emotions={emotions} onChange={handleEmotionChange} t={t} />
        </div>

        {error && (
          <p className="text-xs text-error text-center">{error}</p>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-surface-tint text-on-primary text-xs font-label font-bold rounded-sm border border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              {t('charCreator.portraitGenerating')}
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              {t('charCreator.generatePortrait')}
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-[11px] text-on-surface-variant text-center max-w-[280px]">
        {isGemini ? t('charCreator.portraitDescGemini') : isGptImage ? t('charCreator.portraitDescGptImage') : t('charCreator.portraitDesc')}
      </p>

      {canUseReferenceImage && (
        <div className="w-full max-w-[280px] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
              {t(
                requiresReferenceImage
                  ? 'charCreator.referencePhotoRequired'
                  : 'charCreator.referencePhotoOptional',
              )}
            </span>
            {!requiresReferenceImage && photoBlob && (
              <button
                type="button"
                onClick={() => {
                  setPhotoBlob(null);
                  setShowCapture(true);
                  setCaptureSession((value) => value + 1);
                }}
                className="text-[10px] font-label text-tertiary hover:text-primary transition-colors"
              >
                {t('charCreator.clearReferencePhoto')}
              </button>
            )}
          </div>
          {showCapture && (
            <WebcamCapture key={captureSession} onCapture={handleCapture} />
          )}
        </div>
      )}

      {(photoBlob || !requiresReferenceImage) && (
        <div className="w-full max-w-[280px] space-y-3">
          {requiresReferenceImage && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
                  {t('charCreator.fantasyIntensity')}
                </span>
                <span className="text-xs font-bold text-primary tabular-nums">
                  {Math.round(strength * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={40}
                max={95}
                value={Math.round(strength * 100)}
                onChange={(e) => setStrength(Number(e.target.value) / 100)}
                className="w-full appearance-none mana-slider bg-transparent cursor-pointer"
              />
              <div className="flex justify-between mt-1">
                {STRENGTH_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setStrength(p.value)}
                    className={`text-[10px] font-label transition-colors ${
                      Math.abs(strength - p.value) < 0.05
                        ? 'text-primary'
                        : 'text-outline hover:text-on-surface-variant'
                    }`}
                  >
                    {t(p.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {canUseReferenceImage && photoBlob && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
                  {t('charCreator.likenessToReference')}
                </span>
                <span className="text-xs font-bold text-primary tabular-nums">
                  {likeness}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={likeness}
                onChange={(e) => setLikeness(Number(e.target.value))}
                className="w-full appearance-none mana-slider bg-transparent cursor-pointer"
              />
            </div>
          )}

          <EmotionSliders emotions={emotions} onChange={handleEmotionChange} t={t} />

          {(isGemini || isGptImage) && !photoBlob && (
            <p className="text-[11px] text-on-surface-variant text-center">
              {t(isGptImage ? 'charCreator.referencePhotoHintGptImage' : 'charCreator.referencePhotoHintGemini')}
            </p>
          )}

          {error && (
            <p className="text-xs text-error text-center">{error}</p>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-tint text-on-primary text-xs font-label font-bold rounded-sm border border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                {t('charCreator.portraitGenerating')}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {t('charCreator.generatePortrait')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
