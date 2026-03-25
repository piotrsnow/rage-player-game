import { useMemo, useCallback, useState, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSettings } from '../../../contexts/SettingsContext';
import { useGame } from '../../../contexts/GameContext';
import { getAnchor } from '../../../data/sceneAnchors';
import { useSceneCommands } from './useSceneCommands';
import Environment3D from './Environment3D';
import Character3D from './Character3D';
import Object3D from './Object3D';
import CameraController from './CameraController';
import Lighting3D from './Lighting3D';

function Scene3DContent({ sceneCmd }) {
  const { settings } = useSettings();
  const { state } = useGame();
  const campaignId = state.campaign?.id || state.campaign?.backendId || null;

  const meshySettings = useMemo(() => ({
    meshyEnabled: settings.meshyEnabled || false,
    meshyApiKey: settings.meshyApiKey || '',
    campaignId,
  }), [settings.meshyEnabled, settings.meshyApiKey, campaignId]);

  const characterPositions = useMemo(() => {
    const positions = {};
    if (!sceneCmd) return positions;
    for (const char of sceneCmd.characters) {
      const anchor = getAnchor(sceneCmd.environment.type, char.anchor);
      const pos = char.position || anchor.position;
      positions[char.id] = pos;
    }
    return positions;
  }, [sceneCmd]);

  if (!sceneCmd) return null;

  return (
    <>
      <Lighting3D
        timeOfDay={sceneCmd.environment.timeOfDay}
        mood={sceneCmd.environment.mood}
        environmentType={sceneCmd.environment.type}
      />
      <Environment3D environment={sceneCmd.environment} />

      {sceneCmd.characters.map((charCmd) => (
        <Character3D
          key={charCmd.id}
          command={charCmd}
          environmentType={sceneCmd.environment.type}
          meshySettings={meshySettings}
          allCharacterPositions={characterPositions}
        />
      ))}

      {sceneCmd.objects.map((objCmd) => (
        <Object3D
          key={objCmd.id}
          command={objCmd}
          environmentType={sceneCmd.environment.type}
          meshySettings={meshySettings}
        />
      ))}

      <CameraController
        camera={sceneCmd.camera}
        environmentType={sceneCmd.environment.type}
        characterPositions={characterPositions}
      />
    </>
  );
}

function CanvasFallback() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
      <div className="text-center">
        <span className="material-symbols-outlined text-4xl text-outline/30 animate-pulse block mb-2">view_in_ar</span>
        <p className="text-on-surface-variant text-xs">Loading 3D scene...</p>
      </div>
    </div>
  );
}

function SceneTransition({ sceneCmd }) {
  const [opacity, setOpacity] = useState(1);
  const [visible, setVisible] = useState(true);
  const prevSceneIdRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const sceneId = sceneCmd?.sceneId;
    if (!sceneId) return;

    if (prevSceneIdRef.current && prevSceneIdRef.current !== sceneId) {
      const transition = sceneCmd?.transitions?.[0];
      const type = transition?.type || 'fade_in';
      const duration = transition?.duration || 800;

      if (timerRef.current) clearTimeout(timerRef.current);

      if (type === 'cut') {
        setOpacity(1);
        setVisible(true);
        timerRef.current = setTimeout(() => {
          setOpacity(0);
          timerRef.current = setTimeout(() => setVisible(false), 150);
        }, 50);
      } else {
        setOpacity(1);
        setVisible(true);
        const fadeInDelay = type === 'crossfade' ? duration * 0.4 : duration * 0.15;
        timerRef.current = setTimeout(() => {
          setOpacity(0);
          timerRef.current = setTimeout(() => setVisible(false), duration);
        }, fadeInDelay);
      }
    } else {
      setOpacity(1);
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setOpacity(0);
        timerRef.current = setTimeout(() => setVisible(false), 800);
      }, 100);
    }

    prevSceneIdRef.current = sceneId;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sceneCmd?.sceneId, sceneCmd?.transitions]);

  if (!visible) return null;

  const duration = sceneCmd?.transitions?.[0]?.duration || 800;

  return (
    <div
      className="absolute inset-0 z-20 pointer-events-none bg-black"
      style={{
        opacity,
        transition: `opacity ${duration}ms ease-in-out`,
      }}
    />
  );
}

function LoadingHUD({ sceneCmd }) {
  if (!sceneCmd) {
    return (
      <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-xs pointer-events-none">
        <div className="flex items-center gap-1.5 text-white/70">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          <span>Planning scene…</span>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Main 3D scene panel. Renders a React Three Fiber canvas
 * driven entirely by SceneCommand data from the scene planner.
 *
 * @param {Object} props
 * @param {object} props.scene - Current scene object from game state
 * @param {Function} [props.onError] - Called if 3D rendering fails
 */
function detectWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function Scene3DPanel({ scene, onError }) {
  const sceneCmd = useSceneCommands(scene);
  const [hasError, setHasError] = useState(false);
  const [webGLSupported] = useState(detectWebGL);

  useEffect(() => {
    if (!webGLSupported) {
      console.warn('[Scene3D] WebGL not available, falling back to image mode');
      onError?.(new Error('WebGL not supported'));
    }
  }, [webGLSupported, onError]);

  if (!webGLSupported) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-error/50 block mb-2">error</span>
          <p className="text-on-surface-variant text-xs">WebGL not supported</p>
          <p className="text-on-surface-variant/50 text-[10px] mt-1">Switching to image mode...</p>
        </div>
      </div>
    );
  }

  const handleCreated = useCallback((state) => {
    state.gl.shadowMap.enabled = true;
    state.gl.shadowMap.type = 2;
    state.gl.toneMapping = 3;
    state.gl.toneMappingExposure = 1.1;
  }, []);

  const handleError = useCallback((err) => {
    console.error('[Scene3D] Render error:', err);
    setHasError(true);
    onError?.(err);
  }, [onError]);

  useEffect(() => {
    setHasError(false);
  }, [scene?.id]);

  if (hasError) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-error/50 block mb-2">error</span>
          <p className="text-on-surface-variant text-xs">3D rendering failed</p>
          <p className="text-on-surface-variant/50 text-[10px] mt-1">Falling back to image mode</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <Suspense fallback={<CanvasFallback />}>
        <Canvas
          shadows
          camera={{ position: [0, 6, 10], fov: 55, near: 0.1, far: 100 }}
          onCreated={handleCreated}
          onError={handleError}
          style={{ width: '100%', height: '100%' }}
          gl={{ antialias: true, alpha: false }}
        >
          <Scene3DContent sceneCmd={sceneCmd} />
        </Canvas>
      </Suspense>
      <SceneTransition sceneCmd={sceneCmd} />
      <LoadingHUD sceneCmd={sceneCmd} />
    </div>
  );
}
