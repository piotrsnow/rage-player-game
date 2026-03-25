import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getAnchor } from '../../../data/sceneAnchors';
import { getObjectPrefab } from '../../../data/prefabs';
import { resolveSceneModelSync } from '../../../services/assetManager';
import { apiClient } from '../../../services/apiClient';
import { refreshModelCatalog, selectObjectModel } from '../../../services/modelResolver3d';
import { scene3dDebug } from '../../../services/scene3dDebug';
import PlaceholderMesh from './PlaceholderMesh';
import GLBModel from './GLBModel';

const FLICKER_TYPES = new Set(['campfire', 'torch']);
const SWAY_TYPES = new Set(['banner', 'tree', 'bush']);
const FLOAT_TYPES = new Set(['potion', 'gem', 'scroll', 'key', 'lantern']);
const ENTRANCE_DURATION = 0.5;
const OBJECT_LIGHTS = {
  campfire: {
    color: '#FF9A3C',
    intensity: 1.9,
    distance: 9,
    decay: 1.8,
    yOffset: 0.6,
    flickerAmplitude: 0.3,
    flickerSpeed: 9,
  },
  torch: {
    color: '#FFB347',
    intensity: 1.2,
    distance: 6,
    decay: 2,
    yOffset: 0.55,
    flickerAmplitude: 0.22,
    flickerSpeed: 10,
  },
  lantern: {
    color: '#FFD27A',
    intensity: 0.9,
    distance: 5,
    decay: 2,
    yOffset: 0.25,
    flickerAmplitude: 0.12,
    flickerSpeed: 6,
  },
  fireplace: {
    color: '#FF8A3D',
    intensity: 1.5,
    distance: 8,
    decay: 1.9,
    yOffset: 0.35,
    zOffset: 0.25,
    flickerAmplitude: 0.2,
    flickerSpeed: 7,
  },
};

/**
 * @param {Object} props
 * @param {import('../../../services/sceneCommandSchema').ObjectCommand} props.command
 * @param {string} props.environmentType
 * @param {Object} [props.meshySettings]
 */
export default function Object3D({ command, environmentType, meshySettings = {} }) {
  const groupRef = useRef();
  const lightRef = useRef();
  const entranceRef = useRef({ elapsed: 0 });
  const [modelUrl, setModelUrl] = useState(command.modelUrl || null);
  const [failedModelIds, setFailedModelIds] = useState([]);
  const activeModelIdRef = useRef(command.modelId || null);

  const prefab = useMemo(() => getObjectPrefab(command.type), [command.type]);

  const anchor = useMemo(
    () => getAnchor(environmentType, command.anchor),
    [environmentType, command.anchor]
  );

  const position = useMemo(() => {
    const pos = command.position || anchor.position;
    const yOff = prefab?.yOffset || 0;
    return [pos[0], pos[1] + yOff, pos[2]];
  }, [command.position, anchor, prefab]);

  const rotation = useMemo(() => {
    return command.rotation || [0, 0, 0];
  }, [command.rotation]);

  const animType = useMemo(() => {
    const t = command.type;
    if (FLICKER_TYPES.has(t)) return 'flicker';
    if (SWAY_TYPES.has(t)) return 'sway';
    if (FLOAT_TYPES.has(t)) return 'float';
    return 'breathe';
  }, [command.type]);

  const lightConfig = useMemo(() => {
    const baseConfig = OBJECT_LIGHTS[command.type];
    if (!baseConfig) return null;

    const scale = command.scale || 1;
    return {
      ...baseConfig,
      intensity: baseConfig.intensity * Math.max(0.75, Math.sqrt(scale)),
      distance: baseConfig.distance * Math.max(0.85, scale),
      position: [
        baseConfig.xOffset || 0,
        (baseConfig.yOffset || 0) * scale,
        (baseConfig.zOffset || 0) * scale,
      ],
    };
  }, [command.type, command.scale]);

  useEffect(() => {
    setFailedModelIds([]);
    activeModelIdRef.current = command.modelId || null;
    const resolved = resolveSceneModelSync({
      directUrl: command.modelUrl || null,
      assetKey: command.type ? `obj:${command.type}` : null,
      category: 'obj',
      type: command.type,
    }, {
      ...meshySettings,
      onReady: setModelUrl,
    });
    setModelUrl(resolved.url || null);
  }, [command.modelUrl, command.type, meshySettings]);

  const handleModelError = useCallback(async () => {
    const failedId = activeModelIdRef.current || command.modelId || null;
    const excludeModelIds = [...new Set([...failedModelIds, failedId].filter(Boolean))];

    setFailedModelIds(excludeModelIds);

    await refreshModelCatalog(true).catch(() => null);

    const nextSelection = selectObjectModel({
      name: `${command.name || ''} ${command.description || ''}`.trim(),
      type: command.type || '',
      environmentType,
      excludeModelIds,
    });

    if (!nextSelection?.modelUrl) {
      activeModelIdRef.current = null;
      setModelUrl(null);
      return;
    }

    activeModelIdRef.current = nextSelection.modelId || null;
    setModelUrl(apiClient.resolveMediaUrl(nextSelection.modelUrl));
  }, [command.description, command.modelId, command.name, command.type, environmentType, failedModelIds]);

  useEffect(() => {
    scene3dDebug.spawn('object', command.id, command.anchor);
  }, [command.id, command.anchor]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    entranceRef.current.elapsed += delta;
    const t = Math.min(entranceRef.current.elapsed / ENTRANCE_DURATION, 1);

    if (t < 1) {
      const ease = 1 - Math.pow(1 - t, 3);
      const s = ease * (command.scale || 1);
      group.scale.set(s, s, s);
      return;
    }

    const now = Date.now() * 0.001;
    const baseScale = command.scale || 1;

    if (animType === 'flicker') {
      const flicker = 1 + Math.sin(now * 8) * 0.06 + Math.sin(now * 13) * 0.03;
      group.scale.set(baseScale * flicker, baseScale * (flicker + Math.sin(now * 11) * 0.04), baseScale * flicker);
      group.position.y = position[1] + Math.sin(now * 6) * 0.02;
    } else if (animType === 'sway') {
      group.rotation.z = rotation[2] + Math.sin(now * 1.2) * 0.03;
      group.rotation.x = rotation[0] + Math.sin(now * 0.8 + 1) * 0.015;
    } else if (animType === 'float') {
      group.position.y = position[1] + Math.sin(now * 1.5) * 0.08;
      group.rotation.y = rotation[1] + now * 0.4;
    } else {
      const breath = 1 + Math.sin(now * 1.2) * 0.012;
      group.scale.set(baseScale * breath, baseScale * breath, baseScale * breath);
    }

    if (lightRef.current && lightConfig) {
      const flicker = lightConfig.flickerAmplitude
        ? 1 + Math.sin(now * lightConfig.flickerSpeed) * lightConfig.flickerAmplitude
          + Math.sin(now * (lightConfig.flickerSpeed * 1.73)) * (lightConfig.flickerAmplitude * 0.45)
        : 1;
      lightRef.current.intensity = THREE.MathUtils.clamp(
        lightConfig.intensity * flicker,
        lightConfig.intensity * 0.5,
        lightConfig.intensity * 1.6
      );
    }
  });

  const scale = command.scale || 1;

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={[0, 0, 0]}>
      <GLBModel
        url={modelUrl}
        fallback={<PlaceholderMesh prefab={prefab} label={command.name} />}
        onError={handleModelError}
      />
      {lightConfig && (
        <pointLight
          ref={lightRef}
          color={lightConfig.color}
          intensity={lightConfig.intensity}
          position={lightConfig.position}
          distance={lightConfig.distance}
          decay={lightConfig.decay}
        />
      )}
    </group>
  );
}
