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
const NEW_IMAGE_DELAY_MS = 1000;

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
  const lastOffsetRef = useRef(0);

  const displayedSentence = useMemo(() => {
    if (!currentChunk) {
      lastSentenceRef.current = null;
      lastOffsetRef.current = 0;
      return null;
    }

    const sentences = splitIntoSentences(currentChunk);
    if (sentences.length <= 1) {
      lastSentenceRef.current = currentChunk;
      lastOffsetRef.current = 0;
      return currentChunk;
    }

    const wordIdx = highlightInfo?.sentenceWordIndex ?? -1;
    if (wordIdx < 0) {
      return lastSentenceRef.current || sentences[0];
    }

    let total = 0;
    for (const s of sentences) {
      const wc = countHighlightWords(s);
      if (wordIdx < total + wc) {
        lastSentenceRef.current = s;
        lastOffsetRef.current = total;
        return s;
      }
      total += wc;
    }

    const last = sentences[sentences.length - 1];
    lastSentenceRef.current = last;
    lastOffsetRef.current = total - countHighlightWords(last);
    return last;
  }, [currentChunk, highlightInfo]);

  const sentenceWordOffset = lastOffsetRef.current;
  const currentOverlayRolls = useMemo(() => {
    if (diceRolls && diceRolls.length > 0) return diceRolls;
    return diceRoll ? [diceRoll] : [];
  }, [diceRoll, diceRolls]);

  const imageSrc = useMemo(
    () => apiClient.resolveMediaUrl(scene?.image),
    [scene?.image]
  );

  const [displayedSrc, setDisplayedSrc] = useState(imageSrc);
  const [incomingSrc, setIncomingSrc] = useState(null);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [regenerateState, setRegenerateState] = useState('idle');
  const [overlaySlotCount, setOverlaySlotCount] = useState(() => Math.max(1, currentOverlayRolls.length));
  const revealTimeoutRef = useRef(null);
  const regenerateResetTimeoutRef = useRef(null);
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
  }, [scene?.id]);

  useEffect(() => {
    return () => {
      if (regenerateResetTimeoutRef.current) {
        window.clearTimeout(regenerateResetTimeoutRef.current);
      }
    };
  }, []);

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
    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    setDisplayedSrc(null);
    setIncomingSrc(null);
    setIsCrossfading(false);
  }, [scene?.id]);

  useEffect(() => {
    setOverlaySlotCount(1);
  }, [scene?.id]);

  useEffect(() => {
    if (currentOverlayRolls.length > 0) {
      setOverlaySlotCount((prev) => Math.max(prev, currentOverlayRolls.length));
    }
  }, [currentOverlayRolls.length]);

  useEffect(() => {
    if (!imageSrc) {
      if (!isGeneratingImage) {
        if (revealTimeoutRef.current) {
          window.clearTimeout(revealTimeoutRef.current);
          revealTimeoutRef.current = null;
        }
        setDisplayedSrc(null);
        setIncomingSrc(null);
        setIsCrossfading(false);
      }
      return;
    }

    if (imageSrc === displayedSrc || imageSrc === incomingSrc) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (revealTimeoutRef.current) {
        window.clearTimeout(revealTimeoutRef.current);
      }
      revealTimeoutRef.current = window.setTimeout(() => {
        if (cancelled) return;

        if (!displayedSrc) {
          setDisplayedSrc(imageSrc);
          setIncomingSrc(null);
          setIsCrossfading(false);
          return;
        }

        setIncomingSrc(imageSrc);
        requestAnimationFrame(() => {
          if (!cancelled) {
            setIsCrossfading(true);
          }
        });
      }, NEW_IMAGE_DELAY_MS);
    };
    img.onerror = () => {};
    img.src = imageSrc;

    return () => {
      cancelled = true;
      if (revealTimeoutRef.current) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    };
  }, [imageSrc, displayedSrc, incomingSrc, isGeneratingImage]);

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
      ) : (settings.sceneVisualization || 'image') === 'image' && (displayedSrc || incomingSrc) ? (
        <>
          {displayedSrc && (
            <img
              src={displayedSrc}
              alt="Scene"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-out ${
                isCrossfading ? 'opacity-0' : 'opacity-100'
              }`}
              onError={handleImageError}
            />
          )}
          {incomingSrc && (
            <img
              src={incomingSrc}
              alt="Scene"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-out ${
                isCrossfading ? 'opacity-100' : 'opacity-0'
              }`}
              onError={handleImageError}
            />
          )}
        </>
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

      {/* Live indicator */}
      {isGeneratingImage && (
        <div className="absolute top-4 left-4 bg-surface-container-highest/60 backdrop-blur-md px-3 py-1.5 rounded-sm border border-primary/20 flex items-center gap-2" style={{ zIndex: 3 }}>
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
