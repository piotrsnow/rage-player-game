import { useRef, useEffect, useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { apiClient } from '../../services/apiClient';
import EffectEngine from '../../effects/EffectEngine';
import resolveEffects from '../../effects/resolveEffects';
import LoadingSpinner from '../ui/LoadingSpinner';
import DiceRoller from '../../effects/DiceRoller';
import SceneCanvas from './SceneCanvas';
import { translateSkill } from '../../utils/wfrpTranslate';

const Scene3DPanel = lazy(() => import('./Scene3D/Scene3DPanel'));

function CompactBonusTags({ dr, t }) {
  const hasTags = (dr.characteristic && dr.characteristicValue != null)
    || dr.skillAdvances > 0
    || dr.creativityBonus > 0
    || (dr.momentumBonus != null && dr.momentumBonus !== 0)
    || (dr.dispositionBonus != null && dr.dispositionBonus !== 0);
  if (!hasTags) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap mt-0.5">
      {dr.characteristic && dr.characteristicValue != null && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-400/15 text-purple-300 border border-purple-400/30">
          {t(`stats.${dr.characteristic}Long`)} {dr.characteristicValue}
        </span>
      )}
      {dr.skillAdvances > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
          {translateSkill(dr.skill, t)} +{dr.skillAdvances}
        </span>
      )}
      {dr.creativityBonus > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
          {t('gameplay.creativityBonus', { bonus: dr.creativityBonus })}
        </span>
      )}
      {dr.momentumBonus != null && dr.momentumBonus !== 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
          dr.momentumBonus > 0
            ? 'bg-blue-400/15 text-blue-300 border-blue-400/30'
            : 'bg-red-400/15 text-red-300 border-red-400/30'
        }`}>
          {t('gameplay.momentumBonus', { bonus: (dr.momentumBonus > 0 ? '+' : '') + dr.momentumBonus })}
        </span>
      )}
      {dr.dispositionBonus != null && dr.dispositionBonus !== 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
          dr.dispositionBonus > 0
            ? 'bg-pink-400/15 text-pink-300 border-pink-400/30'
            : 'bg-orange-400/15 text-orange-300 border-orange-400/30'
        }`}>
          {t('gameplay.dispositionBonus', { bonus: (dr.dispositionBonus > 0 ? '+' : '') + dr.dispositionBonus })}
        </span>
      )}
    </div>
  );
}

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

export default function ScenePanel({
  scene,
  combat = null,
  isGeneratingImage,
  highlightInfo,
  currentChunk,
  diceRoll,
  diceRolls,
  onImageError,
}) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
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

  const [displayedSrc, setDisplayedSrc] = useState(imageSrc);
  const [incomingSrc, setIncomingSrc] = useState(null);
  const [isCrossfading, setIsCrossfading] = useState(false);

  useEffect(() => {
    if (!imageSrc) {
      if (!isGeneratingImage) {
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
    };
    img.onerror = () => {};
    img.src = imageSrc;

    return () => { cancelled = true; };
  }, [imageSrc, displayedSrc, incomingSrc, isGeneratingImage]);

  useEffect(() => {
    if (!incomingSrc || !isCrossfading) return;

    const timeoutId = window.setTimeout(() => {
      setDisplayedSrc(incomingSrc);
      setIncomingSrc(null);
      setIsCrossfading(false);
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [incomingSrc, isCrossfading]);

  const handleImageError = useCallback(() => {
    if (scene?.id && scene?.image) {
      setDisplayedSrc(null);
      setIncomingSrc(null);
      setIsCrossfading(false);
      dispatch({ type: 'UPDATE_SCENE_IMAGE', payload: { sceneId: scene.id, image: null } });
      onImageError?.(scene.id);
    }
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
      {/* Scene background: 3D, AI image, canvas 2D, or placeholder */}
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
              <div key={idx} className="glass-panel-elevated rounded-xl px-4 py-3 flex items-center gap-3 max-w-[340px]">
                <div className="w-14 h-14 shrink-0">
                  <DiceRoller diceRoll={dr} />
                </div>
                <div className="flex flex-col min-w-0 gap-0.5">
                  <p className="text-xs font-bold text-on-surface uppercase tracking-widest truncate">
                    {dr.character}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {translateSkill(dr.skill, t)}: <span className="font-mono font-bold text-on-surface">{dr.roll}</span> {t('common.vs')} <span className="font-mono font-bold text-on-surface">{dr.target || dr.dc}</span>
                  </p>
                  <CompactBonusTags dr={dr} t={t} />
                  <p className={`text-xs font-bold ${
                    dr.criticalSuccess ? 'text-amber-400' : dr.criticalFailure ? 'text-red-700' : dr.success ? 'text-primary' : 'text-error'
                  }`}>
                    SL {dr.sl ?? 0} — {dr.criticalSuccess ? t('common.criticalSuccess') : dr.criticalFailure ? t('common.criticalFailure') : dr.success ? t('common.success') : t('common.failure')}
                  </p>
                </div>
              </div>
            ))
          ) : diceRoll ? (
            <div className="glass-panel-elevated rounded-xl px-4 py-3 flex items-center gap-3 max-w-[340px]">
              <div className="w-14 h-14 shrink-0">
                <DiceRoller diceRoll={diceRoll} />
              </div>
              <div className="flex flex-col min-w-0 gap-0.5">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest truncate">
                  {t('gameplay.diceCheck', { skill: translateSkill(diceRoll.skill, t) })}
                </p>
                <p className="text-xs text-on-surface-variant">
                  <span className="font-mono font-bold text-on-surface">{diceRoll.roll}</span> {t('common.vs')} <span className="font-mono font-bold text-on-surface">{diceRoll.target || diceRoll.dc}</span> · SL {diceRoll.sl ?? 0}
                </p>
                <CompactBonusTags dr={diceRoll} t={t} />
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
