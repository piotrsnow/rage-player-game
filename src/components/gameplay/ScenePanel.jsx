import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import EffectEngine from '../../effects/EffectEngine';
import resolveEffects from '../../effects/resolveEffects';
import LoadingSpinner from '../ui/LoadingSpinner';

const INTENSITY_MAP = { low: 0.35, medium: 0.65, high: 1 };

export default function ScenePanel({ scene, isGeneratingImage }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { state } = useGame();
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

      {/* Scene text overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-6 max-h-[70%] overflow-y-auto custom-scrollbar" style={{ zIndex: 3 }}>
        <p className="text-sm text-on-surface/90 font-body leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {scene.narrative}
        </p>
      </div>
    </div>
  );
}
