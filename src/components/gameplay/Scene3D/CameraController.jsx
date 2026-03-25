import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import { scene3dDebug } from '../../../services/scene3dDebug';

const CAMERA_PRESETS = {
  exploration: {
    distance: 10,
    height: 6,
    fov: 55,
    lerpSpeed: 1.5,
    lookAtHeight: 0.5,
    orbitEnabled: true,
    autoRotate: true,
    autoRotateSpeed: 0.45,
  },
  dialogue: {
    distance: 5,
    height: 2.2,
    fov: 45,
    lerpSpeed: 2.0,
    lookAtHeight: 1.2,
    orbitEnabled: false,
    autoRotate: false,
    autoRotateSpeed: 0,
  },
  action_focus: {
    distance: 7,
    height: 4,
    fov: 60,
    lerpSpeed: 3.0,
    lookAtHeight: 0.8,
    orbitEnabled: false,
    autoRotate: false,
    autoRotateSpeed: 0,
  },
};

/**
 * @param {Object} props
 * @param {import('../../../services/sceneCommandSchema').CameraCommand} props.camera
 * @param {string} props.environmentType
 * @param {Object} props.characterPositions - Map of character id -> [x, y, z]
 */
export default function CameraController({ camera, environmentType, characterPositions = {} }) {
  const { mode = 'exploration', focusTargets = [] } = camera || {};
  const preset = CAMERA_PRESETS[mode] || CAMERA_PRESETS.exploration;
  const orbitRef = useRef();
  const { camera: threeCamera } = useThree();
  const targetPosRef = useRef(new THREE.Vector3(0, preset.height, preset.distance));
  const targetLookRef = useRef(new THREE.Vector3(0, preset.lookAtHeight, 0));
  const prevModeRef = useRef(mode);

  const effectiveFocusTargets = useMemo(() => {
    if (focusTargets.length > 0) return focusTargets;
    if (characterPositions.player) return ['player'];
    const [firstTarget] = Object.keys(characterPositions);
    return firstTarget ? [firstTarget] : [];
  }, [focusTargets, characterPositions]);

  const focusCenter = useMemo(() => {
    if (effectiveFocusTargets.length === 0) return [0, 0, 0];

    let sumX = 0, sumZ = 0, count = 0;
    for (const targetId of effectiveFocusTargets) {
      const pos = characterPositions[targetId];
      if (pos) {
        sumX += pos[0];
        sumZ += pos[2];
        count++;
      }
    }

    if (count === 0) return [0, 0, 0];
    return [sumX / count, 0, sumZ / count];
  }, [effectiveFocusTargets, characterPositions]);

  useEffect(() => {
    if (mode !== prevModeRef.current) {
      scene3dDebug.cameraChange(mode, effectiveFocusTargets);
      prevModeRef.current = mode;
    }
  }, [mode, effectiveFocusTargets]);

  useEffect(() => {
    const [cx, , cz] = focusCenter;

    if (mode === 'dialogue') {
      const offsetAngle = Math.PI / 6;
      targetPosRef.current.set(
        cx + Math.sin(offsetAngle) * preset.distance,
        preset.height,
        cz + Math.cos(offsetAngle) * preset.distance
      );
      targetLookRef.current.set(cx, preset.lookAtHeight, cz);
    } else if (mode === 'action_focus') {
      targetPosRef.current.set(
        cx + preset.distance * 0.7,
        preset.height,
        cz + preset.distance * 0.7
      );
      targetLookRef.current.set(cx, preset.lookAtHeight, cz);
    } else {
      targetPosRef.current.set(
        cx,
        preset.height,
        cz + preset.distance
      );
      targetLookRef.current.set(cx, preset.lookAtHeight, cz);
    }
  }, [mode, focusCenter, preset]);

  useEffect(() => {
    if (!preset.orbitEnabled || !orbitRef.current) return;

    orbitRef.current.target.copy(targetLookRef.current);
    threeCamera.position.copy(targetPosRef.current);
    orbitRef.current.update();
  }, [preset.orbitEnabled, focusCenter, preset, threeCamera]);

  useFrame((_, delta) => {
    if (preset.orbitEnabled && orbitRef.current) {
      const speed = preset.lerpSpeed * delta;
      orbitRef.current.target.lerp(targetLookRef.current, speed);
      threeCamera.fov = THREE.MathUtils.lerp(threeCamera.fov, preset.fov, speed);
      threeCamera.updateProjectionMatrix();
      orbitRef.current.update();
      return;
    }

    const speed = preset.lerpSpeed * delta;
    threeCamera.position.lerp(targetPosRef.current, speed);

    const currentLook = new THREE.Vector3();
    threeCamera.getWorldDirection(currentLook);
    currentLook.multiplyScalar(5).add(threeCamera.position);
    currentLook.lerp(targetLookRef.current, speed);
    threeCamera.lookAt(targetLookRef.current);

    threeCamera.fov = THREE.MathUtils.lerp(threeCamera.fov, preset.fov, speed);
    threeCamera.updateProjectionMatrix();
  });

  if (preset.orbitEnabled) {
    return (
      <OrbitControls
        ref={orbitRef}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={Math.PI / 4}
        minDistance={3}
        maxDistance={20}
        enablePan={false}
        enableDamping
        dampingFactor={0.05}
        autoRotate={preset.autoRotate}
        autoRotateSpeed={preset.autoRotateSpeed}
      />
    );
  }

  return null;
}
