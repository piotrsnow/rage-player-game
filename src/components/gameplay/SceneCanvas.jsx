import { useRef, useEffect, useMemo } from 'react';
import { useGame } from '../../contexts/GameContext';
import EffectEngine from '../../effects/EffectEngine';
import SceneRenderer from '../../effects/SceneRenderer';
import { resolveSceneConfig } from '../../effects/biomeResolver';

export default function SceneCanvas({ scene }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rendererRef = useRef(null);
  const { state } = useGame();

  const sceneConfig = useMemo(
    () => (scene ? resolveSceneConfig(state, scene) : null),
    [
      scene?.id,
      scene?.atmosphere?.weather,
      scene?.atmosphere?.mood,
      scene?.atmosphere?.lighting,
      scene?.imagePrompt,
      state.world?.currentLocation,
      state.world?.timeState?.hour,
      state.world?.timeState?.timeOfDay,
      state.combat?.active,
      state.combat?.round,
      state.character?.name,
      state.character?.species,
    ]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new SceneRenderer();
    const engine = new EffectEngine(canvas);

    rendererRef.current = renderer;
    engineRef.current = engine;

    engine.setEffects([renderer]);

    return () => {
      engine.dispose();
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !sceneConfig) return;
    renderer.setScene(sceneConfig);

    if (engineRef.current && !engineRef.current.running) {
      engineRef.current.start();
    }
  }, [sceneConfig]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
