import { useRef, useEffect, useMemo } from 'react';
import { useGameSlice } from '../../stores/gameSelectors';
import { getGameState } from '../../stores/gameStore';
import EffectEngine from '../../effects/EffectEngine';
import SceneRenderer from '../../effects/SceneRenderer';
import { resolveSceneConfig } from '../../effects/biomeResolver';

export default function SceneCanvas({ scene }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rendererRef = useRef(null);

  // Subscribe only to the fields that actually drive the scene config.
  // `resolveSceneConfig` itself reads from the full state snapshot, but we
  // don't need to re-run it on every reducer tick — only on these deps.
  const currentLocation = useGameSlice((s) => s.world?.currentLocation);
  const timeHour = useGameSlice((s) => s.world?.timeState?.hour);
  const timeOfDay = useGameSlice((s) => s.world?.timeState?.timeOfDay);
  const combatActive = useGameSlice((s) => s.combat?.active);
  const combatRound = useGameSlice((s) => s.combat?.round);
  const characterName = useGameSlice((s) => s.character?.name);
  const characterSpecies = useGameSlice((s) => s.character?.species);

  const sceneConfig = useMemo(
    () => (scene ? resolveSceneConfig(getGameState(), scene) : null),
    [
      scene?.id,
      scene?.atmosphere?.weather,
      scene?.atmosphere?.mood,
      scene?.atmosphere?.lighting,
      scene?.imagePrompt,
      currentLocation,
      timeHour,
      timeOfDay,
      combatActive,
      combatRound,
      characterName,
      characterSpecies,
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
