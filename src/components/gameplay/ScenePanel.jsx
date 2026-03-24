import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { apiClient } from '../../services/apiClient';
import EffectEngine from '../../effects/EffectEngine';
import resolveEffects from '../../effects/resolveEffects';
import LoadingSpinner from '../ui/LoadingSpinner';
import DiceRoller from '../../effects/DiceRoller';
import { translateSkill } from '../../utils/wfrpTranslate';

const INTENSITY_MAP = { low: 0.35, medium: 0.65, high: 1 };

function splitIntoSentences(text) {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?…])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ"„«»—\-(])/);
  const result = parts.map((s) => s.trim()).filter(Boolean);
  return result.length > 0 ? result : [text];
}

function HighlightedNarrative({ text, highlightInfo }) {
  const isActive = highlightInfo && highlightInfo.wordIndex >= 0 && highlightInfo.fullText;

  if (!isActive) {
    return <>{text}</>;
  }

  const fullText = highlightInfo.fullText;
  const startIdx = text.indexOf(fullText);
  if (startIdx < 0) {
    return <>{text}</>;
  }

  const before = text.slice(0, startIdx);
  const after = text.slice(startIdx + fullText.length);
  const segmentWords = fullText.split(/(\s+)/);
  let wordIdx = -1;

  return (
    <>
      {before}
      {segmentWords.map((part, i) => {
        if (/^\s+$/.test(part)) {
          return <span key={i}>{part}</span>;
        }
        wordIdx++;
        const isCurrent = wordIdx === highlightInfo.wordIndex;
        return (
          <span
            key={i}
            className={`rounded-sm transition-colors duration-100 ${isCurrent ? 'text-primary bg-primary/20' : ''}`}
            style={isCurrent ? { boxShadow: '-2px 0 0 0 rgba(197,154,255,0.2), 2px 0 0 0 rgba(197,154,255,0.2)' } : undefined}
          >
            {part}
          </span>
        );
      })}
      {after}
    </>
  );
}

export default function ScenePanel({ scene, isGeneratingImage, highlightInfo, currentChunk, diceRoll, diceRolls }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { state, dispatch } = useGame();

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
      const wc = s.split(/\s+/).filter(Boolean).length;
      if (wordIdx < total + wc) {
        lastSentenceRef.current = s;
        lastOffsetRef.current = total;
        return s;
      }
      total += wc;
    }

    const last = sentences[sentences.length - 1];
    lastSentenceRef.current = last;
    lastOffsetRef.current = total - last.split(/\s+/).filter(Boolean).length;
    return last;
  }, [currentChunk, highlightInfo]);

  const sentenceWordOffset = lastOffsetRef.current;

  const imageSrc = useMemo(
    () => apiClient.resolveMediaUrl(scene?.image),
    [scene?.image]
  );

  const currentImageRef = useRef(imageSrc);
  const [currentImage, setCurrentImage] = useState(imageSrc);
  const [prevImage, setPrevImage] = useState(null);
  const [showCurrent, setShowCurrent] = useState(true);

  useEffect(() => {
    if (!imageSrc) {
      currentImageRef.current = null;
      setCurrentImage(null);
      setPrevImage(null);
      setShowCurrent(true);
      return;
    }
    if (imageSrc === currentImageRef.current) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setPrevImage(currentImageRef.current);
      currentImageRef.current = imageSrc;
      setCurrentImage(imageSrc);
      setShowCurrent(false);
    };
    img.onerror = () => {
      if (cancelled) return;
    };
    img.src = imageSrc;

    return () => { cancelled = true; };
  }, [imageSrc]);

  useEffect(() => {
    if (!showCurrent && currentImage) {
      let cancelled = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setShowCurrent(true);
        });
      });
      return () => { cancelled = true; };
    }
  }, [showCurrent, currentImage]);

  const handleTransitionEnd = useCallback((e) => {
    if (e.propertyName === 'opacity') {
      setPrevImage(null);
    }
  }, []);

  const handleImageError = useCallback(() => {
    if (scene?.id && scene?.image) {
      dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId: scene.id, image: null } });
    }
  }, [scene?.id, scene?.image, dispatch]);
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
    const campaign = state.campaign;

    if (isNewScene && atmosphere?.transition) {
      const transitionAtm = { ...atmosphere };
      const layers = resolveEffects(transitionAtm, campaign);
      engine.setEffects(layers);
    } else {
      const noTransitionAtm = atmosphere ? { ...atmosphere, transition: null } : null;
      const layers = resolveEffects(noTransitionAtm, campaign);
      engine.setEffects(layers);
    }
  }, [scene, scene?.id, scene?.atmosphere, effectsEnabled, state.campaign]);

  if (!scene) {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-lowest flex items-center justify-center">
        <div className="absolute inset-0 bg-primary/[0.02]" style={{ animation: 'glowPulse 4s ease-in-out infinite' }} />
        <div className="text-center relative z-10">
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-3 block animate-float-slow">auto_stories</span>
          <p className="text-on-surface-variant text-xs">{t('gameplay.adventureBegins')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-fade-in">
      {/* Scene Image */}
      {currentImage || prevImage ? (
        <>
          {prevImage && (
            <img
              src={prevImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {currentImage && (
            <img
              src={currentImage}
              alt="Scene"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${showCurrent ? 'opacity-100' : 'opacity-0'}`}
              onTransitionEnd={handleTransitionEnd}
              onError={handleImageError}
            />
          )}
        </>
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
          {isGeneratingImage ? (
            <LoadingSpinner size="md" text={t('gameplay.conjuringVision')} />
          ) : (
            <span className="material-symbols-outlined text-6xl text-outline/20">landscape</span>
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
      <div className="absolute inset-0 bg-gradient-to-t from-surface-dim via-surface-dim/30 via-[40%] to-transparent" style={{ zIndex: 2 }} />

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
      {(diceRoll || (diceRolls && diceRolls.length > 0)) && (
        <div className="absolute top-3 right-3 flex flex-col items-end gap-2 animate-scale-in" style={{ zIndex: 4 }}>
          {diceRolls && diceRolls.length > 0 ? (
            diceRolls.map((dr, idx) => (
              <div key={idx} className="glass-panel-elevated rounded-xl px-4 py-3 flex items-center gap-3 max-w-[280px]">
                <div className="w-14 h-14 shrink-0">
                  <DiceRoller diceRoll={dr} />
                </div>
                <div className="flex flex-col min-w-0 gap-0.5">
                  <p className="text-xs font-bold text-on-surface uppercase tracking-widest truncate">
                    {dr.character}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {translateSkill(dr.skill, t)}: {dr.roll} {t('common.vs')} {dr.target || dr.dc}
                  </p>
                  <p className={`text-xs font-bold ${
                    dr.criticalSuccess ? 'text-amber-400' : dr.criticalFailure ? 'text-red-700' : dr.success ? 'text-primary' : 'text-error'
                  }`}>
                    SL {dr.sl ?? 0} — {dr.criticalSuccess ? t('common.criticalSuccess') : dr.criticalFailure ? t('common.criticalFailure') : dr.success ? t('common.success') : t('common.failure')}
                  </p>
                </div>
              </div>
            ))
          ) : diceRoll ? (
            <div className="glass-panel-elevated rounded-xl px-4 py-3 flex items-center gap-3 max-w-[280px]">
              <div className="w-14 h-14 shrink-0">
                <DiceRoller diceRoll={diceRoll} />
              </div>
              <div className="flex flex-col min-w-0 gap-0.5">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest truncate">
                  {t('gameplay.diceCheck', { skill: translateSkill(diceRoll.skill, t) })}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {diceRoll.roll} {t('common.vs')} {diceRoll.target || diceRoll.dc} (SL {diceRoll.sl ?? 0})
                </p>
                <p className={`text-xs font-bold ${
                  diceRoll.criticalSuccess ? 'text-amber-400' : diceRoll.criticalFailure ? 'text-red-700' : diceRoll.success ? 'text-primary' : 'text-error'
                }`}>
                  {diceRoll.criticalSuccess ? t('common.criticalSuccess') : diceRoll.criticalFailure ? t('common.criticalFailure') : diceRoll.success ? t('common.success') : t('common.failure')}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
