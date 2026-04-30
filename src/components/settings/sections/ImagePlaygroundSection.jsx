import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../contexts/SettingsContext';
import { useGame } from '../../../contexts/GameContext';
import { aiService } from '../../../services/ai/service';
import { imageService } from '../../../services/imageGen';
import { buildImagePrompt } from '../../../services/imagePrompts';
import { ensureEnglish } from '../../../services/translateImagePrompt';
import { apiClient, toCanonicalStoragePath } from '../../../services/apiClient';
import usePlaygroundHistory from '../../../hooks/playground/usePlaygroundHistory';
import PlaygroundHistoryGrid from './playground/PlaygroundHistoryGrid';

const IMG2IMG_PROVIDERS = new Set(['stability', 'gemini', 'gpt-image', 'sd-webui']);

function imageKeyProvider(imageProvider) {
  if (imageProvider === 'stability') return 'stability';
  if (imageProvider === 'gemini') return 'gemini';
  if (imageProvider === 'sd-webui') return 'sd-webui';
  return 'openai';
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function uploadReferenceBlob(blob) {
  const contentType = blob.type || 'image/png';
  const extFromType = contentType.split('/')[1] || 'png';
  const ext = extFromType.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'png';
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  const key = `playground-ref-${Date.now()}-${rand}.${ext}`;
  const data = await blobToBase64(blob);

  const json = await apiClient.post('/media/store', {
    key,
    type: 'playground-ref',
    contentType,
    data,
    metadata: { source: 'playground-reference' },
  });
  return toCanonicalStoragePath(json?.url || '');
}

async function fetchBlobFromCanonical(canonicalUrl) {
  if (!canonicalUrl) return null;
  const resolved = apiClient.resolveMediaUrl(canonicalUrl);
  const res = await fetch(resolved, { credentials: 'include' });
  if (!res.ok) return null;
  return res.blob();
}

export default function ImagePlaygroundSection() {
  const { t } = useTranslation();
  const { settings, hasApiKey } = useSettings();
  const { state: gameState } = useGame();

  const imageProvider = settings.imageProvider || 'dalle';
  const imageStyle = settings.dmSettings?.imageStyle || 'painting';
  const darkPalette = !!settings.dmSettings?.darkPalette;
  const seriousness = settings.dmSettings?.narratorSeriousness ?? null;
  const sdModel = settings.sdWebuiModel || null;
  const sdSeed = Number.isInteger(settings.sdWebuiSeed) ? settings.sdWebuiSeed : null;
  const language = settings.language || 'en';
  const genre = gameState?.campaign?.genre || 'Fantasy';
  const tone = gameState?.campaign?.tone || 'Epic';

  const aiProvider = settings.aiProvider === 'anthropic' ? 'anthropic' : 'openai';
  const hasAiKey = hasApiKey(aiProvider);
  const hasImageKey = hasApiKey(imageKeyProvider(imageProvider));
  const supportsImg2Img = IMG2IMG_PROVIDERS.has(imageProvider);
  const backendConnected = apiClient.isConnected();

  const [keywords, setKeywords] = useState('');
  const [prompt, setPrompt] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [referenceBlob, setReferenceBlob] = useState(null);
  const referencePreview = useMemo(
    () => (referenceBlob ? URL.createObjectURL(referenceBlob) : null),
    [referenceBlob],
  );
  const fileInputRef = useRef(null);

  const history = usePlaygroundHistory({ pageSize: 5, enabled: backendConnected });

  const buildPromptFromKeywords = useCallback(async (kw) => {
    // `enhanceImagePrompt` already coerces its output to English, but its
    // fallback in buildImagePrompt is `kw` — translate that upfront so we
    // don't leak the raw Polish keywords when enhance degrades.
    const enKw = await ensureEnglish(kw);
    const { description } = await aiService.enhanceImagePrompt({
      keywords: enKw,
      imageStyle,
      darkPalette,
      seriousness,
      genre,
      tone,
      language,
      provider: aiProvider,
    });
    return buildImagePrompt(
      description || enKw,
      genre,
      tone,
      description || enKw,
      imageProvider,
      imageStyle,
      darkPalette,
      null,
      null,
      seriousness,
      false,
      imageProvider === 'sd-webui' ? sdModel : null,
    );
  }, [aiProvider, darkPalette, genre, imageProvider, imageStyle, language, sdModel, seriousness, tone]);

  const handleEnhance = async () => {
    const kw = keywords.trim();
    if (!kw || enhancing) return;
    setEnhancing(true);
    setError(null);
    try {
      const wrapped = await buildPromptFromKeywords(kw);
      setPrompt(wrapped);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setEnhancing(false);
    }
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (file) setReferenceBlob(file);
    e.target.value = '';
  };

  const handleRemoveReference = () => {
    setReferenceBlob(null);
  };

  const runGenerate = useCallback(async (promptText, keywordsText) => {
    const p = promptText.trim();
    if (!p) return;
    setGenerating(true);
    setError(null);
    setPreviewUrl(null);
    try {
      let referenceImageUrl = null;
      const refBlobForRun = supportsImg2Img ? referenceBlob : null;
      if (refBlobForRun) {
        try {
          referenceImageUrl = await uploadReferenceBlob(refBlobForRun);
        } catch (refErr) {
          console.warn('Failed to upload reference image to GCP', refErr);
        }
      }

      const url = await imageService.generatePlaygroundImage({
        prompt: p,
        provider: imageProvider,
        sdModel,
        sdSeed,
        referenceBlob: refBlobForRun,
      });
      setPreviewUrl(url);

      const canonical = toCanonicalStoragePath(url);
      if (canonical && canonical.startsWith('/v1/media/file/')) {
        await history.append({
          imageUrl: canonical,
          referenceImageUrl: referenceImageUrl || null,
          prompt: p,
          keywords: (keywordsText || '').trim(),
          provider: imageProvider,
          sdModel: sdModel || null,
          sdSeed: Number.isInteger(sdSeed) ? sdSeed : null,
          imageStyle: imageStyle || null,
          seriousness: Number.isInteger(seriousness) ? seriousness : null,
        });
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setGenerating(false);
    }
  }, [history, imageProvider, imageStyle, referenceBlob, sdModel, sdSeed, seriousness, supportsImg2Img]);

  const handleGenerate = () => runGenerate(prompt, keywords);

  const handleEnhanceAndGenerate = async () => {
    const kw = keywords.trim();
    if (!kw || enhancing || generating) return;
    setEnhancing(true);
    setError(null);
    try {
      const wrapped = await buildPromptFromKeywords(kw);
      setPrompt(wrapped);
      setEnhancing(false);
      await runGenerate(wrapped, kw);
    } catch (err) {
      setError(err?.message || String(err));
      setEnhancing(false);
    }
  };

  const handleSelectHistory = useCallback(async (entry) => {
    setError(null);
    setKeywords(entry.keywords || '');
    setPrompt(entry.prompt || '');
    setPreviewUrl(entry.imageUrl || null);
    if (entry.referenceImageUrl) {
      const blob = await fetchBlobFromCanonical(entry.referenceImageUrl);
      setReferenceBlob(blob);
    } else {
      setReferenceBlob(null);
    }
  }, []);

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-t border-tertiary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">science</span>
        {t('imageConfig.playground.title')}
      </h2>
      <p className="text-xs text-on-surface-variant mb-6 leading-relaxed">
        {t('imageConfig.playground.subtitle')}
      </p>

      {!hasImageKey && (
        <p className="text-[11px] text-error/80 mb-4 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">cloud_off</span>
          {t('imageConfig.playground.noProviderKey')}
        </p>
      )}

      <div className="mb-4">
        <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
          {t('imageConfig.playground.keywordsLabel')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={t('imageConfig.playground.keywordsPlaceholder')}
            className="flex-1 bg-surface-container-high/40 border border-outline-variant/20 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40"
          />
          <button
            type="button"
            onClick={handleEnhance}
            disabled={!hasAiKey || !keywords.trim() || enhancing || generating}
            title={!hasAiKey ? t('imageConfig.playground.noAiKey') : t('imageConfig.playground.enhance')}
            aria-label={t('imageConfig.playground.enhance')}
            className="px-3 py-2 rounded-sm border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <span className={`material-symbols-outlined text-[18px] ${enhancing ? 'animate-pulse' : ''}`}>
              {enhancing ? 'hourglass_top' : 'auto_fix_high'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleEnhanceAndGenerate}
            disabled={!hasAiKey || !hasImageKey || !keywords.trim() || enhancing || generating}
            title={
              !hasAiKey
                ? t('imageConfig.playground.noAiKey')
                : !hasImageKey
                  ? t('imageConfig.playground.noProviderKey')
                  : t('imageConfig.playground.enhanceAndGenerate')
            }
            aria-label={t('imageConfig.playground.enhanceAndGenerate')}
            className="px-3 py-2 rounded-sm border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <span className={`material-symbols-outlined text-[18px] ${(enhancing || generating) ? 'animate-spin' : ''}`}>
              {enhancing || generating ? 'progress_activity' : 'bolt'}
            </span>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
          {t('imageConfig.playground.promptLabel')}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('imageConfig.playground.promptPlaceholder')}
          rows={7}
          className="w-full bg-surface-container-high/40 border border-outline-variant/20 rounded-sm px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40 font-mono leading-relaxed resize-y"
        />
      </div>

      <div className="mb-4">
        <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
          {t('imageConfig.playground.referenceLabel')}
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFilePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!supportsImg2Img}
            title={!supportsImg2Img ? t('imageConfig.playground.imageUnsupported') : t('imageConfig.playground.upload')}
            className="px-3 py-2 rounded-sm border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-xs"
          >
            <span className="material-symbols-outlined text-[16px]">upload</span>
            {t('imageConfig.playground.upload')}
          </button>
          {!supportsImg2Img && (
            <span className="text-[10px] text-on-surface-variant/70">
              {t('imageConfig.playground.imageUnsupported')}
            </span>
          )}
          {referencePreview && (
            <div className="relative">
              <img
                src={referencePreview}
                alt="reference"
                className="w-16 h-16 object-cover rounded-sm border border-outline-variant/20"
              />
              <button
                type="button"
                onClick={handleRemoveReference}
                aria-label={t('imageConfig.playground.removeImage')}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-error/80 text-on-error flex items-center justify-center hover:bg-error transition-colors"
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!hasImageKey || !prompt.trim() || generating}
        className="w-full px-4 py-3 rounded-sm border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-headline text-sm flex items-center justify-center gap-2"
      >
        <span className={`material-symbols-outlined text-[18px] ${generating ? 'animate-spin' : ''}`}>
          {generating ? 'progress_activity' : 'auto_awesome'}
        </span>
        {generating ? t('imageConfig.playground.generating') : t('imageConfig.playground.generate')}
      </button>

      {error && (
        <p className="mt-4 text-[11px] text-error/80 font-mono break-words">
          {t('imageConfig.playground.error')}: {error}
        </p>
      )}

      {previewUrl && (
        <div className="mt-6">
          <img
            src={apiClient.resolveMediaUrl(previewUrl)}
            alt="preview"
            className="w-full rounded-sm border border-outline-variant/20"
          />
        </div>
      )}

      {backendConnected && (
        <PlaygroundHistoryGrid
          items={history.items}
          page={history.page}
          totalPages={history.totalPages}
          loading={history.loading}
          onSelect={handleSelectHistory}
          onDelete={(entry) => history.remove(entry.id)}
          onPrev={history.goPrev}
          onNext={history.goNext}
        />
      )}
    </div>
  );
}
