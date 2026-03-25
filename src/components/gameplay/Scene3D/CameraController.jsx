import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { scene3dDebug } from '../../../services/scene3dDebug';

const CAMERA_PRESETS = {
  exploration: {
    distance: 5,
    height: 6,
    fov: 55,
    lerpSpeed: 1.5,
    lookAtHeight: 0.5,
    orbitEnabled: true,
    orbitAngularSpeed: 0.14,
    orbitRadiusAmplitude: 1.4,
    orbitRadiusSpeed: 0.18,
  },
  dialogue: {
    distance: 5,
    height: 2.2,
    fov: 45,
    lerpSpeed: 2.0,
    lookAtHeight: 1.2,
    orbitEnabled: false,
  },
  action_focus: {
    distance: 7,
    height: 4,
    fov: 60,
    lerpSpeed: 3.0,
    lookAtHeight: 0.8,
    orbitEnabled: false,
  },
};

const MIN_PITCH = THREE.MathUtils.degToRad(-65);
const MAX_PITCH = THREE.MathUtils.degToRad(75);
const MIN_DISTANCE_FACTOR = 1.15;
const MAX_DISTANCE_FACTOR = 3.8;
const AUTO_ROTATE_MULTIPLIER = 5.5;

/**
 * @param {Object} props
 * @param {import('../../../services/sceneCommandSchema').CameraCommand} props.camera
 * @param {string} props.environmentType
 * @param {Object} props.characterPositions - Map of character id -> [x, y, z]
 */
export default function CameraController({ camera, environmentType, characterPositions = {} }) {
  const { mode = 'exploration', focusTargets = [] } = camera || {};
  const preset = CAMERA_PRESETS[mode] || CAMERA_PRESETS.exploration;
  const controlsRef = useRef(null);
  const { camera: threeCamera } = useThree();
  const targetPosRef = useRef(new THREE.Vector3(0, preset.height, preset.distance));
  const targetLookRef = useRef(new THREE.Vector3(0, preset.lookAtHeight, 0));
  const prevModeRef = useRef(mode);
  const prevControlModeRef = useRef(mode);
  const initializedRef = useRef(false);

  const effectiveFocusTargets = useMemo(() => {
    if (focusTargets.length > 0) return focusTargets;
    if (characterPositions.player) return ['player'];
    const [firstTarget] = Object.keys(characterPositions);
    return firstTarget ? [firstTarget] : [];
  }, [focusTargets, characterPositions]);

  const focusCenter = useMemo(() => {
    if (mode === 'exploration') {
      const allPositions = Object.values(characterPositions);
      if (allPositions.length === 0) return [0, 0, 0];

      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      for (const pos of allPositions) {
        if (!pos) continue;
        sumX += pos[0];
        sumZ += pos[2];
        count++;
      }

      if (count === 0) return [0, 0, 0];
      return [sumX / count, 0, sumZ / count];
    }

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
  }, [mode, effectiveFocusTargets, characterPositions]);

  useEffect(() => {
    if (mode !== prevModeRef.current) {
      scene3dDebug.cameraChange(mode, effectiveFocusTargets);
      prevModeRef.current = mode;
    }
  }, [mode, effectiveFocusTargets]);

  useEffect(() => {
    const [cx, , cz] = focusCenter;
    targetLookRef.current.set(cx, preset.lookAtHeight, cz);

    if (mode === 'dialogue') {
      const offsetAngle = Math.PI / 6;
      targetPosRef.current.set(
        cx + Math.sin(offsetAngle) * preset.distance,
        preset.height,
        cz + Math.cos(offsetAngle) * preset.distance
      );
    } else if (mode === 'action_focus') {
      targetPosRef.current.set(
        cx + preset.distance * 0.7,
        preset.height,
        cz + preset.distance * 0.7
      );
    } else {
      targetPosRef.current.set(cx, preset.height, cz + preset.distance);
    }
  }, [mode, focusCenter, preset]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const modeChanged = mode !== prevControlModeRef.current;
    if (!initializedRef.current || modeChanged) {
      threeCamera.position.copy(targetPosRef.current);
      controls.target.copy(targetLookRef.current);
      controls.update();
      initializedRef.current = true;
      prevControlModeRef.current = mode;
    }
  }, [mode, threeCamera]);

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const speed = Math.min(preset.lerpSpeed * delta, 1);
    controls.target.lerp(targetLookRef.current, speed);

    if (preset.orbitEnabled) {
      const elapsed = state.clock.getElapsedTime();
      const desiredDistance = THREE.MathUtils.clamp(
        preset.distance + Math.sin(elapsed * preset.orbitRadiusSpeed * Math.PI * 2) * preset.orbitRadiusAmplitude,
        Math.max(preset.distance * MIN_DISTANCE_FACTOR, 2.5),
        Math.max(preset.distance * MAX_DISTANCE_FACTOR, 6)
      );
      const offset = threeCamera.position.clone().sub(controls.target);
      if (offset.lengthSq() > 0.0001) {
        offset.setLength(THREE.MathUtils.lerp(offset.length(), desiredDistance, speed * 0.75));
        threeCamera.position.copy(controls.target.clone().add(offset));
      }
    }

    threeCamera.fov = THREE.MathUtils.lerp(threeCamera.fov, preset.fov, speed);
    threeCamera.updateProjectionMatrix();
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableRotate
      enableZoom
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={Math.PI / 2 - MAX_PITCH}
      maxPolarAngle={Math.PI / 2 - MIN_PITCH}
      minDistance={Math.max(preset.distance * MIN_DISTANCE_FACTOR, 2.5)}
      maxDistance={Math.max(preset.distance * MAX_DISTANCE_FACTOR, 6)}
      autoRotate={preset.orbitEnabled}
      autoRotateSpeed={preset.orbitAngularSpeed * AUTO_ROTATE_MULTIPLIER}
    />
  );
}
