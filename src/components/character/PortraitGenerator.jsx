import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { imageService } from '../../services/imageGen';
import WebcamCapture from '../ui/WebcamCapture';

const STRENGTH_PRESETS = [
  { value: 0.3, labelKey: 'charCreator.strengthSubtle' },
  { value: 0.45, labelKey: 'charCreator.strengthBalanced' },
  { value: 0.65, labelKey: 'charCreator.strengthIntense' },
];

export default function PortraitGenerator({ species, gender, careerName, genre, onPortraitReady, initialPortrait }) {
  const { t } = useTranslation();
  const { settings, hasApiKey } = useSettings();

  const provider = settings.imageProvider || 'dalle';
  const isDalle = provider === 'dalle';
  const apiKey = isDalle ? settings.openaiApiKey : settings.stabilityApiKey;
  const hasKey = isDalle
    ? !!(settings.openaiApiKey || (settings.useBackend && hasApiKey('openai')))
    : !!(settings.stabilityApiKey || (settings.useBackend && hasApiKey('stability')));

  const [photoBlob, setPhotoBlob] = useState(null);
  const [strength, setStrength] = useState(0.45);
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(initialPortrait || null);
  const [error, setError] = useState(null);
  const [showCapture, setShowCapture] = useState(!initialPortrait);

  const abortRef = useRef(false);

  const handleCapture = useCallback((blob) => {
    setPhotoBlob(blob);
    setGeneratedUrl(null);
    setError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!isDalle && !photoBlob) return;
    setGenerating(true);
    setError(null);
    abortRef.current = false;

    try {
      const url = await imageService.generatePortrait(
        isDalle ? null : photoBlob,
        { species, gender, careerName, genre },
        apiKey,
        strength,
        provider,
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
  }, [photoBlob, species, gender, careerName, genre, apiKey, strength, provider, isDalle, t]);

  const handleAccept = useCallback(() => {
    onPortraitReady(generatedUrl);
  }, [generatedUrl, onPortraitReady]);

  const handleRetry = useCallback(() => {
    setGeneratedUrl(null);
    setShowCapture(true);
    setPhotoBlob(null);
    setError(null);
  }, []);

  const handleRemove = useCallback(() => {
    setGeneratedUrl(null);
    setPhotoBlob(null);
    setShowCapture(true);
    setError(null);
    onPortraitReady(null);
  }, [onPortraitReady]);

  if (!hasKey) {
    return (
      <div className="flex items-center gap-2 p-3 bg-surface-container-high/20 border border-outline-variant/10 rounded-sm">
        <span className="material-symbols-outlined text-sm text-outline">info</span>
        <p className="text-xs text-on-surface-variant">
          {isDalle ? t('charCreator.portraitNeedsKeyDalle') : t('charCreator.portraitNeedsKey')}
        </p>
      </div>
    );
  }

  if (generatedUrl && !showCapture) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-[220px] aspect-[3/4] rounded-sm overflow-hidden border border-primary/30 shadow-[0_0_20px_rgba(197,154,255,0.15)]">
          <img src={generatedUrl} alt="Fantasy portrait" className="w-full h-full object-cover" />
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
        {t('charCreator.portraitDesc')}
      </p>
      <WebcamCapture onCapture={handleCapture} />

      {photoBlob && (
        <div className="w-full max-w-[280px] space-y-3">
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
