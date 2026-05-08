import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { apiClient, toCanonicalStoragePath } from '../../services/apiClient';
import { imageService } from '../../services/imageGen';
import WebcamCapture from '../ui/WebcamCapture';

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
const LIKENESS_DEFAULT = 60;

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

  const provider = ['dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'].includes(settings.sceneImageTier)
    ? settings.sceneImageTier
    : (settings.imageProvider || 'dalle');
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
  const [portraitPrompt, setPortraitPrompt] = useState(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const promptCopyResetRef = useRef(null);
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

  const handleCopyPrompt = useCallback(async () => {
    if (!portraitPrompt) return;
    try {
      await navigator.clipboard.writeText(portraitPrompt);
      setPromptCopied(true);
      clearTimeout(promptCopyResetRef.current);
      promptCopyResetRef.current = setTimeout(() => setPromptCopied(false), 2000);
    } catch { /* clipboard may be unavailable */ }
  }, [portraitPrompt]);

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
      const ipaWeight = isSdWebui && photoBlob ? (likeness / 100) * 1.2 : undefined;
      const result = await imageService.generatePortrait(
        canUseReferenceImage ? photoBlob : null,
        { species, age, gender, careerName, genre },
        apiKey,
        strength,
        provider,
        settings.dmSettings?.imageStyle || 'painting',
        settings.dmSettings?.darkPalette || false,
        settings.dmSettings?.narratorSeriousness ?? null,
        settings.sdWebuiModel || null,
        { likeness, emotions, ipaWeight },
        Number.isInteger(settings.sdWebuiSeed) ? settings.sdWebuiSeed : null,
      );
      if (!abortRef.current) {
        setGeneratedUrl(result.url);
        setPortraitPrompt(result.prompt);
        setPromptExpanded(false);
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
    setPortraitPrompt(null);
    setPromptExpanded(false);
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
        <div className="relative w-full max-w-[220px]">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={t('charCreator.zoomInPortrait', 'Powiększ portret')}
            className="group relative block w-full aspect-[3/4] rounded-sm overflow-hidden border border-primary/30 shadow-[0_0_20px_rgba(197,154,255,0.15)] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary/50"
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
          {portraitPrompt && (
            !promptExpanded ? (
              <button
                type="button"
                onClick={() => setPromptExpanded(true)}
                aria-label={t('charCreator.portraitPromptTooltip', 'Prompt portretu')}
                className="absolute left-2 bottom-2 z-10 flex items-center gap-1 px-2 h-7 rounded-sm bg-surface-container-highest/80 backdrop-blur-md border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all text-[10px] font-label shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
              >
                <span className="material-symbols-outlined text-[15px]">history_edu</span>
                <span className="uppercase tracking-widest">Prompt</span>
              </button>
            ) : (
              <div className="absolute left-2 right-2 bottom-2 z-10 rounded-sm bg-surface-container-highest/85 backdrop-blur-md border border-outline-variant/30 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-outline-variant/15">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[15px] text-on-surface-variant">history_edu</span>
                    <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant truncate">
                      Prompt
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      aria-label={t('charCreator.copyPortraitPrompt', 'Skopiuj prompt')}
                      className={`flex items-center justify-center w-7 h-7 rounded-sm border transition-all ${
                        promptCopied
                          ? 'bg-success/15 border-success/40 text-success'
                          : 'bg-surface-container-highest/60 border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {promptCopied ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptExpanded(false)}
                      aria-label={t('common.close', 'Zamknij')}
                      className="flex items-center justify-center w-7 h-7 rounded-sm bg-surface-container-highest/60 border border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </div>
                <div className="px-2 py-1.5 max-h-28 overflow-y-auto">
                  <p className="text-[10px] leading-relaxed text-on-surface-variant whitespace-pre-wrap break-words">
                    {portraitPrompt}
                  </p>
                </div>
              </div>
            )
          )}
        </div>
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
        <div className="grid w-full max-w-[220px] grid-cols-[1fr_40px_40px] gap-2">
          <button
            type="button"
            onClick={handleAccept}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-tint text-on-primary text-xs font-label font-bold rounded-sm border border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)] hover:shadow-[0_0_25px_rgba(197,154,255,0.5)] transition-all"
          >
            <span className="material-symbols-outlined text-sm">check</span>
            {t('charCreator.acceptPortrait')}
          </button>
          <button
            type="button"
            onClick={handleRetry}
            disabled={generating}
            aria-label={t('charCreator.retryPortrait')}
            className="flex items-center justify-center h-full min-h-9 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className={`material-symbols-outlined text-sm ${generating ? 'animate-spin' : ''}`}>
              {generating ? 'progress_activity' : 'restart_alt'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={generating}
            aria-label={t('common.delete', 'Usuń')}
            className="flex items-center justify-center h-full min-h-9 rounded-sm border border-outline-variant/15 text-on-surface-variant hover:text-error hover:border-error/35 hover:bg-error/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          {requiresReferenceImage && !isSdWebui && (
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
