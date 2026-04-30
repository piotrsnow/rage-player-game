import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { apiClient, toCanonicalStoragePath } from '../../services/apiClient';
import { imageService } from '../../services/imageGen';
import WebcamCapture from '../ui/WebcamCapture';

const STRENGTH_PRESETS = [
  { value: 0.3, labelKey: 'charCreator.strengthSubtle' },
  { value: 0.45, labelKey: 'charCreator.strengthBalanced' },
  { value: 0.65, labelKey: 'charCreator.strengthIntense' },
];

export default function PortraitGenerator({ species, age, gender, careerName, genre, onPortraitReady, initialPortrait }) {
  const { t } = useTranslation();
  const { settings, hasApiKey } = useSettings();

  const provider = settings.imageProvider || 'dalle';
  const isDalle = provider === 'dalle';
  const isGptImage = provider === 'gpt-image';
  const isGemini = provider === 'gemini';
  const canUseReferenceImage = isGemini || isGptImage || provider === 'stability';
  const requiresReferenceImage = provider === 'stability';
  const apiKey = null;
  const keyProvider = (isDalle || isGptImage) ? 'openai' : isGemini ? 'gemini' : 'stability';
  const hasKey = settings.useBackend && hasApiKey(keyProvider);

  const [photoBlob, setPhotoBlob] = useState(null);
  const [strength, setStrength] = useState(0.45);
  const [generating, setGenerating] = useState(false);
  // Canonical `/v1/media/file/...` path — this is what we persist via
  // `onPortraitReady`. `resolveMediaUrl` is only applied at render time
  // for the <img> src below.
  const [generatedUrl, setGeneratedUrl] = useState(() => toCanonicalStoragePath(initialPortrait) || null);
  const [error, setError] = useState(null);
  const [showCapture, setShowCapture] = useState(!initialPortrait);
  const [captureSession, setCaptureSession] = useState(0);

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
  }, [photoBlob, species, age, gender, careerName, genre, apiKey, strength, provider, requiresReferenceImage, canUseReferenceImage, t, settings.dmSettings?.imageStyle, settings.dmSettings?.darkPalette]);

  const handleAccept = useCallback(() => {
    onPortraitReady(generatedUrl);
  }, [generatedUrl, onPortraitReady]);

  const handleRetry = useCallback(() => {
    setGeneratedUrl(null);
    setShowCapture(canUseReferenceImage);
    setPhotoBlob(null);
    setCaptureSession((value) => value + 1);
    setError(null);
  }, [canUseReferenceImage]);

  const handleRemove = useCallback(() => {
    setGeneratedUrl(null);
    setPhotoBlob(null);
    setShowCapture(canUseReferenceImage);
    setCaptureSession((value) => value + 1);
    setError(null);
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
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[220px] aspect-[3/4] rounded-sm overflow-hidden border border-primary/30 shadow-[0_0_20px_rgba(197,154,255,0.15)]">
          <img
            src={apiClient.resolveMediaUrl(generatedUrl)}
            alt="Fantasy portrait"
            className="w-full h-full object-cover"
            onError={() => { setGeneratedUrl(null); setShowCapture(canUseReferenceImage); }}
          />
          <div className="absolute top-1.5 right-1.5">
            <span className="material-symbols-outlined text-sm text-primary drop-shadow-lg">auto_awesome</span>
          </div>
        </div>
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
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-tertiary hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            {t('charCreator.retryPortrait')}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="px-3 py-2 text-xs font-label text-on-surface-variant hover:text-error transition-colors"
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
                min={20}
                max={70}
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
