import { useRef, useEffect, useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGameCampaign, useGameSlice, useGameDispatch } from '../../stores/gameSelectors';
import { apiClient } from '../../services/apiClient';
import { countHighlightWords } from '../../services/elevenlabs';
import EffectEngine from '../../effects/EffectEngine';
import resolveEffects from '../../effects/resolveEffects';
import LoadingSpinner from '../ui/LoadingSpinner';
import SceneCanvas from './SceneCanvas';
import FieldMapCanvas from './FieldMapCanvas';
import OverlayDiceCard from './scene/OverlayDiceCard';
import HighlightedNarrative, { splitIntoSentences } from './scene/HighlightedNarrative';

const Scene3DPanel = lazy(() => import('./Scene3D/Scene3DPanel'));

const INTENSITY_MAP = { low: 0.35, medium: 0.65, high: 1 };


export default function ScenePanel({
  scene,
  combat = null,
  isGeneratingImage,
  highlightInfo,
  currentChunk,
  diceRoll,
  diceRolls,
  onImageError,
  onRegenerateImage,
  world,
  characterName,
  multiplayerPlayers = [],
  interactiveMap = false,
  onSceneGridChange,
  onFieldTurnReady,
}) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const campaign = useGameCampaign();
  const fieldMap = useGameSlice((s) => s.world?.fieldMap);
  const dispatch = useGameDispatch();

  const lastSentenceRef = useRef(null);

  const { displayedSentence, sentenceWordOffset } = useMemo(() => {
    if (!currentChunk) {
      lastSentenceRef.current = null;
      return { displayedSentence: null, sentenceWordOffset: 0 };
    }

    const sentences = splitIntoSentences(currentChunk);
    if (sentences.length <= 1) {
      lastSentenceRef.current = currentChunk;
      return { displayedSentence: currentChunk, sentenceWordOffset: 0 };
    }

    const wordIdx = highlightInfo?.sentenceWordIndex ?? -1;
    if (wordIdx < 0) {
      return { displayedSentence: lastSentenceRef.current || sentences[0], sentenceWordOffset: 0 };
    }

    let total = 0;
    for (const s of sentences) {
      const wc = countHighlightWords(s);
      if (wordIdx < total + wc) {
        lastSentenceRef.current = s;
        return { displayedSentence: s, sentenceWordOffset: total };
      }
      total += wc;
    }

    const last = sentences[sentences.length - 1];
    lastSentenceRef.current = last;
    return { displayedSentence: last, sentenceWordOffset: total - countHighlightWords(last) };
  }, [currentChunk, highlightInfo]);
  const currentOverlayRolls = useMemo(() => {
    if (diceRolls && diceRolls.length > 0) return diceRolls;
    return diceRoll ? [diceRoll] : [];
  }, [diceRoll, diceRolls]);

  const imageSrc = useMemo(
    () => apiClient.resolveMediaUrl(scene?.image),
    [scene?.image]
  );

  const [displayedSrc, setDisplayedSrc] = useState(imageSrc);
  const [regenerateState, setRegenerateState] = useState('idle');
  const [promptCopied, setPromptCopied] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [overlaySlotCount, setOverlaySlotCount] = useState(() => Math.max(1, currentOverlayRolls.length));
  const regenerateResetTimeoutRef = useRef(null);
  const promptCopyResetRef = useRef(null);
  const overlaySlots = useMemo(
    () => Array.from({ length: overlaySlotCount }, (_, idx) => currentOverlayRolls[idx] ?? null),
    [overlaySlotCount, currentOverlayRolls]
  );

  useEffect(() => {
    if (regenerateResetTimeoutRef.current) {
      window.clearTimeout(regenerateResetTimeoutRef.current);
      regenerateResetTimeoutRef.current = null;
    }
    setRegenerateState('idle');
    if (promptCopyResetRef.current) {
      window.clearTimeout(promptCopyResetRef.current);
      promptCopyResetRef.current = null;
    }
    setPromptCopied(false);
    setIsPromptExpanded(false);
  }, [scene?.id]);

  useEffect(() => {
    return () => {
      if (regenerateResetTimeoutRef.current) {
        window.clearTimeout(regenerateResetTimeoutRef.current);
      }
      if (promptCopyResetRef.current) {
        window.clearTimeout(promptCopyResetRef.current);
      }
    };
  }, []);

  const displayedImagePrompt = scene?.fullImagePrompt || scene?.imagePrompt || null;

  const handleCopyImagePrompt = useCallback(async () => {
    if (!displayedImagePrompt) return;
    try {
      await navigator.clipboard.writeText(displayedImagePrompt);
      setPromptCopied(true);
      if (promptCopyResetRef.current) {
        window.clearTimeout(promptCopyResetRef.current);
      }
      promptCopyResetRef.current = window.setTimeout(() => {
        setPromptCopied(false);
        promptCopyResetRef.current = null;
      }, 1800);
    } catch {
      // clipboard API unavailable / denied — silently ignore
    }
  }, [displayedImagePrompt]);

  const handleTogglePromptOverlay = useCallback(() => {
    setIsPromptExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isPromptExpanded) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') setIsPromptExpanded(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPromptExpanded]);

  const handleRegenerateImage = useCallback(async () => {
    if (!onRegenerateImage || !scene?.id || isGeneratingImage) return;
    if (regenerateResetTimeoutRef.current) {
      window.clearTimeout(regenerateResetTimeoutRef.current);
      regenerateResetTimeoutRef.current = null;
    }
    setRegenerateState('pending');
    try {
      const repaired = await onRegenerateImage(scene.id);
      setRegenerateState(repaired ? 'success' : 'error');
      regenerateResetTimeoutRef.current = window.setTimeout(() => {
        setRegenerateState('idle');
        regenerateResetTimeoutRef.current = null;
      }, repaired ? 1500 : 3000);
    } catch {
      setRegenerateState('error');
      regenerateResetTimeoutRef.current = window.setTimeout(() => {
        setRegenerateState('idle');
        regenerateResetTimeoutRef.current = null;
      }, 3000);
    }
  }, [onRegenerateImage, scene?.id, isGeneratingImage]);

  useEffect(() => {
    setOverlaySlotCount(1);
  }, [scene?.id]);

  useEffect(() => {
    if (currentOverlayRolls.length > 0) {
      setOverlaySlotCount((prev) => Math.max(prev, currentOverlayRolls.length));
    }
  }, [currentOverlayRolls.length]);

  // Image swap policy: the old image disappears immediately when `imageSrc`
  // goes away (scene transition, regenerate, img onError → null), leaving
  // the placeholder/spinner visible. The new image preloads in the
  // background and fades in once it's ready — no crossfade from the stale
  // frame, no lingering preview from the previous scene.
  useEffect(() => {
    if (!imageSrc) {
      setDisplayedSrc(null);
      return;
    }

    if (imageSrc === displayedSrc) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setDisplayedSrc(imageSrc);
    };
    img.onerror = () => {};
    img.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [imageSrc, displayedSrc]);

  const handleImageError = useCallback(() => {
    if (!scene?.id || !scene?.image) return;
    dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId: scene.id, image: null } });
    onImageError?.(scene.id);
  }, [scene?.id, scene?.image, dispatch, onImageError]);

  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const prevSceneIdRef = useRef(null);

  const effectsEnabled = settings.canvasEffectsEnabled ?? true;
  const intensity = INTENSITY_MAP[settings.effectIntensity] ?? INTENSITY_MAP.medium;

  useEffect(() => {
    if (!effectsEnabled || !canvasRef.current) return;

    const engine = new EffectEngine(canvasRef.current);
    engine.setIntensity(intensity);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [effectsEnabled]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setIntensity(intensity);
    }
  }, [intensity]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !effectsEnabled) return;

    const isNewScene = scene?.id !== prevSceneIdRef.current;
    prevSceneIdRef.current = scene?.id ?? null;

    if (!scene) {
      engine.setEffects([]);
      return;
    }

    const atmosphere = scene.atmosphere ?? null;

    if (isNewScene && atmosphere?.transition) {
      const transitionAtm = { ...atmosphere };
      const layers = resolveEffects(transitionAtm, campaign);
      engine.setEffects(layers);
    } else {
      const noTransitionAtm = atmosphere ? { ...atmosphere, transition: null } : null;
      const layers = resolveEffects(noTransitionAtm, campaign);
      engine.setEffects(layers);
    }
  }, [scene, scene?.id, scene?.atmosphere, effectsEnabled, campaign]);

  if (!scene) {
    return (
      <div className="relative w-full h-[clamp(280px,66vh,740px)] rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-lowest flex items-center justify-center">
        <div className="absolute inset-0 bg-primary/[0.02]" style={{ animation: 'glowPulse 4s ease-in-out infinite' }} />
        <div className="text-center relative z-10">
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-3 block animate-float-slow">auto_stories</span>
          <p className="text-on-surface-variant text-xs">{t('gameplay.adventureBegins')}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="scene-panel" className="relative w-full h-[clamp(280px,66vh,740px)] rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-fade-in">
      {/* Dream overlay */}
      {scene.scenePacing === 'dream' && (
        <>
          <div className="absolute inset-0 z-30 pointer-events-none bg-purple-900/20 mix-blend-overlay" />
          <div className="absolute inset-0 z-30 pointer-events-none backdrop-blur-[1px]" />
          <div className="absolute top-3 left-3 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-purple-500/20 border border-purple-400/30 backdrop-blur-sm">
            <span className="material-symbols-outlined text-purple-300 text-sm">bedtime</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-purple-300">
              {t('gameplay.dreamSequence', 'Dream Sequence')}
            </span>
          </div>
        </>
      )}
      {/* Scene background: 3D, AI image, field map, canvas 2D, or placeholder */}
      {(settings.sceneVisualization || 'image') === '3d' ? (
        <Suspense fallback={
          <div className="w-full h-full bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
            <LoadingSpinner size="md" text="Loading 3D..." />
          </div>
        }>
          <Scene3DPanel
            scene={scene}
            combat={combat}
            onError={() => updateSettings({ sceneVisualization: 'image' })}
          />
        </Suspense>
      ) : (settings.sceneVisualization || 'image') === 'canvas' ? (
        <SceneCanvas scene={scene} />
      ) : (settings.sceneVisualization || 'image') === 'map' ? (
        <div className="w-full h-full bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-lowest">
          {fieldMap ? (
            <FieldMapCanvas
              onFieldTurnReady={onFieldTurnReady}
              scene={scene}
              world={world}
              characterName={characterName}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <LoadingSpinner size="md" text={t('common.loading')} />
            </div>
          )}
        </div>
      ) : (settings.sceneVisualization || 'image') === 'image' && displayedSrc ? (
        <img
          key={displayedSrc}
          src={displayedSrc}
          alt="Scene"
          className="absolute inset-0 w-full h-full object-cover animate-fade-in"
          onError={handleImageError}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
          {isGeneratingImage && (settings.sceneVisualization || 'image') === 'image' ? (
            <LoadingSpinner size="md" text={t('gameplay.conjuringVision')} />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-6xl text-outline/20">landscape</span>
              {onRegenerateImage && scene?.id && (settings.sceneVisualization || 'image') === 'image' && (
                <button
                  onClick={handleRegenerateImage}
                  disabled={isGeneratingImage || regenerateState === 'pending'}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/25 rounded-sm text-[10px] font-label uppercase tracking-widest text-primary/80 hover:bg-primary/20 hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={`material-symbols-outlined text-sm ${regenerateState === 'pending' ? 'animate-spin' : ''}`}>
                    {regenerateState === 'pending' ? 'progress_activity' : 'refresh'}
                  </span>
                  {regenerateState === 'pending'
                    ? t('gameplay.generatingImage')
                    : t('gameplay.regenerateImage', 'Regenerate image')}
                </button>
              )}
              {regenerateState === 'success' && (
                <p className="text-[10px] text-success/80 font-label uppercase tracking-wider">
                  {t('common.success')}
                </p>
              )}
              {regenerateState === 'error' && (
                <p className="text-[10px] text-error/80 font-label uppercase tracking-wider">
                  {t('common.unexpectedError')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Canvas effects overlay */}
      {effectsEnabled && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-surface-dim via-surface-dim/30 via-[40%] to-transparent" style={{ zIndex: 2 }} />

      {/* Live indicator — shifts below the feather button when it's visible */}
      {isGeneratingImage && (
        <div
          className={`absolute left-4 bg-surface-container-highest/60 backdrop-blur-md px-3 py-1.5 rounded-sm border border-primary/20 flex items-center gap-2 ${
            displayedImagePrompt && (settings.sceneVisualization || 'image') === 'image' && displayedSrc
              ? 'top-14'
              : 'top-4'
          }`}
          style={{ zIndex: 3 }}
        >
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(197,154,255,1)]" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-on-surface uppercase">
            {t('gameplay.generatingImage')}
          </span>
        </div>
      )}

      {/* Subtitle overlay – only the current sentence while narrator is reading */}
      {displayedSentence && (
        <div className="absolute bottom-0 left-0 right-0 pb-6 px-8 flex justify-center" style={{ zIndex: 3 }}>
          <p className="text-xl md:text-2xl text-on-surface font-body leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] text-center max-w-[85%] bg-black/60 backdrop-blur-sm rounded-lg px-6 py-3 border border-white/[0.05]">
            <HighlightedNarrative
              text={displayedSentence}
              highlightInfo={highlightInfo ? {
                ...highlightInfo,
                fullText: displayedSentence,
                wordIndex: (highlightInfo.sentenceWordIndex ?? -1) >= 0
                  ? highlightInfo.sentenceWordIndex - sentenceWordOffset
                  : -1,
              } : null}
            />
          </p>
        </div>
      )}

      {/* Image prompt — feather button expands into a semi-transparent overlay */}
      {displayedImagePrompt
        && (settings.sceneVisualization || 'image') === 'image'
        && displayedSrc && (
        <>
          {!isPromptExpanded && (
            <div className="absolute top-3 left-3" style={{ zIndex: 5 }}>
              <button
                type="button"
                onClick={handleTogglePromptOverlay}
                aria-label={t('gameplay.imagePromptTooltip', 'Prompt obrazka — kliknij, aby skopiować')}
                aria-expanded={false}
                className="flex items-center justify-center w-8 h-8 rounded-sm bg-surface-container-highest/60 backdrop-blur-md border border-outline-variant/25 text-on-surface-variant hover:text-primary hover:bg-surface-container-highest/80 hover:border-primary/40 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">history_edu</span>
              </button>
            </div>
          )}

          {isPromptExpanded && (
            <div
              className="absolute top-3 left-3 right-3 bottom-3 flex animate-fade-in"
              style={{ zIndex: 6 }}
            >
              <div
                className="pointer-events-auto flex flex-col w-full max-w-[min(34rem,calc(100%-0.5rem))] rounded-sm bg-surface-container-highest/70 backdrop-blur-md border border-outline-variant/25 shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/15">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history_edu</span>
                    <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant truncate">
                      {t('gameplay.imagePromptTooltip', 'Prompt obrazka — kliknij, aby skopiować')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyImagePrompt}
                      aria-label={t('gameplay.copyImagePrompt', 'Skopiuj prompt obrazka')}
                      className={`flex items-center gap-1 px-2 h-7 rounded-sm border transition-all ${
                        promptCopied
                          ? 'bg-success/15 border-success/40 text-success'
                          : 'bg-surface-container-highest/60 border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {promptCopied ? 'check' : 'content_copy'}
                      </span>
                      <span className="text-[10px] font-label uppercase tracking-widest">
                        {promptCopied
                          ? t('gameplay.imagePromptCopied', 'Skopiowano!')
                          : t('gameplay.copyImagePrompt', 'Skopiuj prompt obrazka')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTogglePromptOverlay}
                      aria-label={t('common.close', 'Zamknij')}
                      aria-expanded={true}
                      className="flex items-center justify-center w-7 h-7 rounded-sm bg-surface-container-highest/60 border border-outline-variant/25 text-on-surface-variant hover:text-primary hover:border-primary/40 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
                  <p className="text-xs text-on-surface leading-relaxed whitespace-pre-wrap break-words">
                    {displayedImagePrompt}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dice Roll Overlay — top-right */}
      <div
        className={`absolute top-3 right-3 flex flex-col items-end gap-2 overflow-visible transition-opacity duration-300 ${
          currentOverlayRolls.length > 0 ? 'opacity-100 animate-scale-in' : 'pointer-events-none opacity-0'
        }`}
        style={{ zIndex: 4 }}
      >
        {overlaySlots.map((dr, idx) => (
          <OverlayDiceCard
            key={idx}
            dr={dr}
            t={t}
            showCharacter={currentOverlayRolls.length > 1}
            isVisible={Boolean(dr)}
          />
        ))}
      </div>
    </div>
  );
}
