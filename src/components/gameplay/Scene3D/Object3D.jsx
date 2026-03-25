import { useMemo, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { getAnchor } from '../../../data/sceneAnchors';
import { getObjectPrefab } from '../../../data/prefabs';
import { resolveSceneModelSync } from '../../../services/assetManager';
import { scene3dDebug } from '../../../services/scene3dDebug';
import PlaceholderMesh from './PlaceholderMesh';
import GLBModel from './GLBModel';

const FLICKER_TYPES = new Set(['campfire', 'torch']);
const SWAY_TYPES = new Set(['banner', 'tree', 'bush']);
const FLOAT_TYPES = new Set(['potion', 'gem', 'scroll', 'key', 'lantern']);
const ENTRANCE_DURATION = 0.5;

/**
 * @param {Object} props
 * @param {import('../../../services/sceneCommandSchema').ObjectCommand} props.command
 * @param {string} props.environmentType
 * @param {Object} [props.meshySettings]
 */
export default function Object3D({ command, environmentType, meshySettings = {} }) {
  const groupRef = useRef();
  const entranceRef = useRef({ elapsed: 0 });
  const [modelUrl, setModelUrl] = useState(command.modelUrl || null);

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

  useEffect(() => {
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
  });

  const scale = command.scale || 1;

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={[0, 0, 0]}>
      <GLBModel
        url={modelUrl}
        fallback={<PlaceholderMesh prefab={prefab} label={command.name} />}
      />
    </group>
  );
}
