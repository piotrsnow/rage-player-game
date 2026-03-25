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
const NEW_IMAGE_DELAY_MS = 1000;

function CompactBonusTags({ dr, t, className = '' }) {
  const hasTags = (dr.characteristic && dr.characteristicValue != null)
    || dr.skillAdvances > 0
    || (dr.talentBonus > 0 && dr.applicableTalent)
    || dr.creativityBonus > 0
    || (dr.difficultyModifier != null && dr.difficultyModifier !== 0)
    || (dr.momentumBonus != null && dr.momentumBonus !== 0)
    || (dr.dispositionBonus != null && dr.dispositionBonus !== 0);
  if (!hasTags) return null;
  return (
    <div className={`flex items-center gap-1 flex-wrap mt-0.5 ${className}`.trim()}>
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
      {dr.talentBonus > 0 && dr.applicableTalent && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300 border border-yellow-400/30">
          {t('gameplay.talentBonus', { talent: dr.applicableTalent, bonus: '+' + dr.talentBonus })}
        </span>
      )}
      {dr.creativityBonus > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
          {t('gameplay.creativityBonus', { bonus: dr.creativityBonus })}
        </span>
      )}
      {dr.difficultyModifier != null && dr.difficultyModifier !== 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
          dr.difficultyModifier > 0
            ? 'bg-teal-400/15 text-teal-300 border-teal-400/30'
            : 'bg-rose-400/15 text-rose-300 border-rose-400/30'
        }`}>
          {t('gameplay.difficultyModifier', { bonus: (dr.difficultyModifier > 0 ? '+' : '') + dr.difficultyModifier })}
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

function OverlayModifierList({ dr, t }) {
  const RESERVED_MODIFIER_SLOTS = 4;
  const modifiers = [];

  if (dr.characteristic && dr.characteristicValue != null) {
    modifiers.push({
      key: 'characteristic',
      label: `${t(`stats.${dr.characteristic}Long`)} ${dr.characteristicValue}`,
      className: 'bg-purple-400/15 text-purple-300 border-purple-400/30',
    });
  }
  if (dr.skillAdvances > 0) {
    modifiers.push({
      key: 'skill',
      label: `${translateSkill(dr.skill, t)} +${dr.skillAdvances}`,
      className: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    });
  }
  if (dr.talentBonus > 0 && dr.applicableTalent) {
    modifiers.push({
      key: 'talent',
      label: t('gameplay.talentBonus', { talent: dr.applicableTalent, bonus: '+' + dr.talentBonus }),
      className: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
    });
  }
  if (dr.creativityBonus > 0) {
    modifiers.push({
      key: 'creativity',
      label: t('gameplay.creativityBonus', { bonus: dr.creativityBonus }),
      className: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    });
  }
  if (dr.difficultyModifier != null && dr.difficultyModifier !== 0) {
    modifiers.push({
      key: 'difficulty',
      label: t('gameplay.difficultyModifier', { bonus: (dr.difficultyModifier > 0 ? '+' : '') + dr.difficultyModifier }),
      className: dr.difficultyModifier > 0
        ? 'bg-teal-400/15 text-teal-300 border-teal-400/30'
        : 'bg-rose-400/15 text-rose-300 border-rose-400/30',
    });
  }
  if (dr.momentumBonus != null && dr.momentumBonus !== 0) {
    modifiers.push({
      key: 'momentum',
      label: t('gameplay.momentumBonus', { bonus: (dr.momentumBonus > 0 ? '+' : '') + dr.momentumBonus }),
      className: dr.momentumBonus > 0
        ? 'bg-blue-400/15 text-blue-300 border-blue-400/30'
        : 'bg-red-400/15 text-red-300 border-red-400/30',
    });
  }
  if (dr.dispositionBonus != null && dr.dispositionBonus !== 0) {
    modifiers.push({
      key: 'disposition',
      label: t('gameplay.dispositionBonus', { bonus: (dr.dispositionBonus > 0 ? '+' : '') + dr.dispositionBonus }),
      className: dr.dispositionBonus > 0
        ? 'bg-pink-400/15 text-pink-300 border-pink-400/30'
        : 'bg-orange-400/15 text-orange-300 border-orange-400/30',
    });
  }

  const reservedModifiers = [
    ...modifiers,
    ...Array.from(
      { length: Math.max(0, RESERVED_MODIFIER_SLOTS - modifiers.length) },
      (_, idx) => ({
        key: `placeholder-${idx}`,
        label: '\u00A0',
        className: 'border-transparent bg-transparent text-transparent',
        isPlaceholder: true,
      })
    ),
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      {reservedModifiers.map((modifier) => (
        <span
          key={modifier.key}
          aria-hidden={modifier.isPlaceholder ? 'true' : undefined}
          className={`w-[158px] text-right text-[10px] font-bold px-2 py-1 rounded-full border ${modifier.className}`}
        >
          {modifier.label}
        </span>
      ))}
    </div>
  );
}

function OverlayOutcomeTarget({ dr, t }) {
  const target = dr.target || dr.dc;
  const isSuccess = Boolean(dr.success || dr.criticalSuccess);
  const indicatorTone = dr.criticalSuccess
    ? 'text-amber-300 border-amber-400/35 bg-amber-400/12'
    : dr.criticalFailure
      ? 'text-red-300 border-red-500/35 bg-red-500/10'
      : isSuccess
        ? 'text-primary border-primary/35 bg-primary/10'
        : 'text-error border-error/35 bg-error/10';

  return (
    <div className="relative w-28 h-20 flex items-end justify-center">
      <div className={`absolute left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border bg-surface-container-high/55 flex flex-col items-center justify-center ${
        isSuccess ? 'border-primary/35 shadow-[0_0_18px_rgba(197,154,255,0.12)]' : 'border-outline-variant/25'
      }`}>
        <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
          {dr.skill ? translateSkill(dr.skill, t) : dr.characteristic ? t(`stats.${dr.characteristic}Long`) : t('common.target', 'Cel')}
        </span>
        <span className="font-mono text-lg font-black text-on-surface leading-none">
          {target}
        </span>
      </div>

      <div className={`absolute left-1/2 -translate-x-1/2 transition-all duration-500 ease-out ${
        isSuccess ? 'bottom-5' : '-top-1'
      }`}>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${indicatorTone}`}>
          <span className="font-mono text-[11px] font-black leading-none text-on-surface">
            {dr.roll}
          </span>
        </div>
      </div>
    </div>
  );
}

function OverlayDiceCard({ dr, t, showCharacter = false, isVisible = true }) {
  const target = dr?.target || dr?.dc;
  return (
    <div className={`glass-panel-elevated relative w-max max-w-[min(92vw,22rem)] overflow-visible rounded-xl px-4 py-3 flex flex-col gap-2 transition-all duration-300 ${
      isVisible ? 'opacity-100 translate-y-0 scale-100' : 'pointer-events-none opacity-0 translate-y-1 scale-95'
    }`}>
      {dr ? (
        <div className="w-full text-center">
          {showCharacter && dr.character ? (
            <p className="text-[10px] font-bold text-on-surface uppercase tracking-[0.2em] truncate">
              {dr.character}
            </p>
          ) : null}
          <p className={`font-bold text-on-surface-variant uppercase tracking-[0.18em] truncate ${showCharacter && dr.character ? 'mt-1 text-[11px]' : 'text-xs'}`}>
            {t('gameplay.diceCheck', { skill: translateSkill(dr.skill, t) })}
          </p>
        </div>
      ) : null}

      {target != null && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl select-none font-mono text-[9rem] font-black leading-none text-on-surface/[0.07] blur-[2px] animate-target-shimmer">
          {target}
        </span>
      )}

      <div className="flex items-end gap-3">
        <div className="relative h-[68px] w-[84px] shrink-0 overflow-visible">
          <div className="absolute left-1/2 top-1/2 h-[168px] w-[186px] -translate-x-1/2 -translate-y-1/2 overflow-visible">
            <DiceRoller
              diceRoll={dr}
              showOverlayResult={false}
              sizeMultiplier={2.3}
              durationMultiplier={1.5}
              variant="overlay"
              isVisible={isVisible}
            />
          </div>
        </div>

        {dr ? (
          <div className="flex min-w-0 w-[200px] shrink-0 justify-end">
            <OverlayModifierList dr={dr} t={t} />
          </div>
        ) : null}
      </div>
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
  const [overlaySlotCount, setOverlaySlotCount] = useState(() => Math.max(1, currentOverlayRolls.length));
  const revealTimeoutRef = useRef(null);
  const overlaySlots = useMemo(
    () => Array.from({ length: overlaySlotCount }, (_, idx) => currentOverlayRolls[idx] ?? null),
    [overlaySlotCount, currentOverlayRolls]
  );

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
    <div className="relative w-full h-[clamp(280px,66vh,740px)] rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-fade-in">
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
