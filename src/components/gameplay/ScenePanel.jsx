import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import EffectEngine from '../../effects/EffectEngine';
import resolveEffects from '../../effects/resolveEffects';
import LoadingSpinner from '../ui/LoadingSpinner';
import DiceRoller from '../../effects/DiceRoller';

const INTENSITY_MAP = { low: 0.35, medium: 0.65, high: 1 };

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

export default function ScenePanel({ scene, isGeneratingImage, highlightInfo, currentSentence, diceRoll }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { state, dispatch } = useGame();

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
      <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-2 block">auto_stories</span>
          <p className="text-on-surface-variant text-xs">{t('gameplay.adventureBegins')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-fade-in">
      {/* Scene Image */}
      {scene.image ? (
        <img
          src={scene.image}
          alt="Scene"
          className="w-full h-full object-cover transition-opacity duration-700"
          onError={handleImageError}
        />
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
      <div className="absolute inset-0 bg-gradient-to-t from-surface-dim/90 via-surface-dim/20 to-transparent" style={{ zIndex: 2 }} />

      {/* Live indicator */}
      {isGeneratingImage && !scene.image && (
        <div className="absolute top-4 left-4 bg-surface-container-highest/60 backdrop-blur-md px-3 py-1.5 rounded-sm border border-primary/20 flex items-center gap-2" style={{ zIndex: 3 }}>
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(197,154,255,1)]" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-on-surface uppercase">
            {t('gameplay.generatingImage')}
          </span>
        </div>
      )}

      {/* Subtitle overlay – only while narrator is reading */}
      {currentSentence && (
        <div className="absolute bottom-0 left-0 right-0 pb-6 px-8 flex justify-center" style={{ zIndex: 3 }}>
          <p className="text-xl md:text-2xl text-on-surface font-body leading-relaxed drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] text-center max-w-[85%] bg-black/50 rounded-md px-5 py-2.5">
            <HighlightedNarrative
              text={currentSentence}
              highlightInfo={highlightInfo ? {
                ...highlightInfo,
                fullText: currentSentence,
                wordIndex: highlightInfo.sentenceWordIndex ?? -1,
              } : null}
            />
          </p>
        </div>
      )}

      {/* Dice Roll Overlay */}
      {diceRoll && (
        <div className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in" style={{ zIndex: 4 }}>
          <div className="bg-surface-dim/70 backdrop-blur-sm rounded-xl px-6 py-4 flex flex-col items-center gap-2 max-w-[260px]">
            <div className="w-24 h-24">
              <DiceRoller diceRoll={diceRoll} />
            </div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">
              {t('gameplay.diceCheck', { skill: diceRoll.skill })}
            </p>
            <p className="text-sm font-headline text-tertiary text-center">
              {t('gameplay.diceResult', {
                roll: diceRoll.roll,
                modifier: diceRoll.modifier,
                total: diceRoll.total,
              })}
              <span className="text-on-surface-variant"> {t('common.vs')} {t('common.dc')} {diceRoll.dc}</span>
            </p>
            <p className={`text-xs font-bold ${diceRoll.success ? 'text-primary' : 'text-error'}`}>
              {diceRoll.success ? t('common.success') : t('common.failure')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
