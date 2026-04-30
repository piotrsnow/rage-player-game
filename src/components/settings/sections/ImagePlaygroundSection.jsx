import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../contexts/SettingsContext';
import { useGame } from '../../../contexts/GameContext';
import { aiService } from '../../../services/ai/service';
import { imageService } from '../../../services/imageGen';
import { buildImagePrompt } from '../../../services/imagePrompts';
import { apiClient } from '../../../services/apiClient';

const IMG2IMG_PROVIDERS = new Set(['stability', 'gemini', 'gpt-image', 'sd-webui']);

function imageKeyProvider(imageProvider) {
  if (imageProvider === 'stability') return 'stability';
  if (imageProvider === 'gemini') return 'gemini';
  if (imageProvider === 'sd-webui') return 'sd-webui';
  return 'openai';
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
  const language = settings.language || 'en';
  const genre = gameState?.campaign?.genre || 'Fantasy';
  const tone = gameState?.campaign?.tone || 'Epic';

  const aiProvider = settings.aiProvider === 'anthropic' ? 'anthropic' : 'openai';
  const hasAiKey = hasApiKey(aiProvider);
  const hasImageKey = hasApiKey(imageKeyProvider(imageProvider));
  const supportsImg2Img = IMG2IMG_PROVIDERS.has(imageProvider);

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

  const handleEnhance = async () => {
    const kw = keywords.trim();
    if (!kw || enhancing) return;
    setEnhancing(true);
    setError(null);
    try {
      const { description } = await aiService.enhanceImagePrompt({
        keywords: kw,
        imageStyle,
        darkPalette,
        seriousness,
        genre,
        tone,
        language,
        provider: aiProvider,
      });
      const wrapped = buildImagePrompt(
        description || kw,
        genre,
        tone,
        description || kw,
        imageProvider,
        imageStyle,
        darkPalette,
        null,
        null,
        seriousness,
        false,
      );
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

  const handleGenerate = async () => {
    const p = prompt.trim();
    if (!p || generating) return;
    setGenerating(true);
    setError(null);
    setPreviewUrl(null);
    try {
      const url = await imageService.generatePlaygroundImage({
        prompt: p,
        provider: imageProvider,
        sdModel,
        referenceBlob: supportsImg2Img ? referenceBlob : null,
      });
      setPreviewUrl(url);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setGenerating(false);
    }
  };

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
            disabled={!hasAiKey || !keywords.trim() || enhancing}
            title={!hasAiKey ? t('imageConfig.playground.noAiKey') : t('imageConfig.playground.enhance')}
            aria-label={t('imageConfig.playground.enhance')}
            className="px-3 py-2 rounded-sm border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <span className={`material-symbols-outlined text-[18px] ${enhancing ? 'animate-pulse' : ''}`}>
              {enhancing ? 'hourglass_top' : 'auto_fix_high'}
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
    </div>
  );
}
