import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getAnchor, getFacingRotation } from '../../../data/sceneAnchors';
import { getCharacterPrefab } from '../../../data/prefabs';
import { scene3dDebug } from '../../../services/scene3dDebug';
import { getLocalModel } from '../../../services/localModels';
import PlaceholderMesh from './PlaceholderMesh';
import GLBModel from './GLBModel';

const WALK_SPEED = 2.0;
const ROTATION_SPEED = 5.0;
const BOB_FREQUENCY = 4.0;
const BOB_AMPLITUDE = 0.04;
const BREATH_FREQUENCY = 1.5;
const BREATH_AMPLITUDE = 0.015;
const SNAP_DISTANCE = 8.0;
const ENTRANCE_DURATION = 0.6;

/**
 * @param {Object} props
 * @param {import('../../../services/sceneCommandSchema').CharacterCommand} props.command
 * @param {string} props.environmentType
 * @param {Object} [props.meshySettings]
 * @param {Object} [props.allCharacterPositions] - Map of id -> [x,y,z] for facingTarget lookups
 */
export default function Character3D({ command, environmentType, meshySettings = {}, allCharacterPositions = {} }) {
  const groupRef = useRef();
  const [currentAnimation, setCurrentAnimation] = useState(command.animation || 'idle');
  const targetPositionRef = useRef(null);
  const prevAnimation = useRef(command.animation);
  const prevPositionRef = useRef(null);
  const entranceRef = useRef({ active: true, elapsed: 0 });

  const prefab = useMemo(() => getCharacterPrefab(command.archetype), [command.archetype]);

  const modelUrl = useMemo(
    () => getLocalModel(command.id, 'character'),
    [command.id]
  );

  const anchor = useMemo(
    () => getAnchor(environmentType, command.anchor),
    [environmentType, command.anchor]
  );

  const targetRotation = useMemo(() => {
    if (command.facingTarget && allCharacterPositions[command.facingTarget]) {
      const targetPos = allCharacterPositions[command.facingTarget];
      const pos = command.position || anchor.position;
      return Math.atan2(targetPos[0] - pos[0], targetPos[2] - pos[2]);
    }
    if (command.facing) return getFacingRotation(command.facing);
    return getFacingRotation(anchor.facing);
  }, [command.facing, command.facingTarget, anchor, allCharacterPositions]);

  const initialPosition = useMemo(() => {
    const pos = command.position || anchor.position;
    return new THREE.Vector3(pos[0], pos[1] + (prefab?.yOffset || 0), pos[2]);
  }, [command.position, anchor, prefab]);

  useEffect(() => {
    if (command.moveTo) {
      const moveAnchor = command.moveTo.anchor
        ? getAnchor(environmentType, command.moveTo.anchor)
        : null;
      const movePos = command.moveTo.position || moveAnchor?.position;
      if (movePos) {
        targetPositionRef.current = new THREE.Vector3(
          movePos[0],
          movePos[1] + (prefab?.yOffset || 0),
          movePos[2]
        );
        setCurrentAnimation('walk');
      }
    }
  }, [command.moveTo, environmentType, prefab]);

  useEffect(() => {
    if (command.animation !== prevAnimation.current) {
      scene3dDebug.animTransition(command.id, prevAnimation.current, command.animation);
      prevAnimation.current = command.animation;
      if (!targetPositionRef.current) {
        setCurrentAnimation(command.animation || 'idle');
      }
    }
  }, [command.animation, command.id]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    if (!prevPositionRef.current) {
      group.position.copy(initialPosition);
      group.rotation.y = targetRotation;
      prevPositionRef.current = initialPosition.clone();
      entranceRef.current = { active: true, elapsed: 0 };
      scene3dDebug.spawn('character', command.id, command.anchor);
      return;
    }

    const dx = initialPosition.x - prevPositionRef.current.x;
    const dz = initialPosition.z - prevPositionRef.current.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.05) return;

    if (dist > SNAP_DISTANCE) {
      group.position.copy(initialPosition);
      prevPositionRef.current = initialPosition.clone();
      entranceRef.current = { active: true, elapsed: 0 };
    } else {
      targetPositionRef.current = initialPosition.clone();
      setCurrentAnimation('walk');
    }

    prevPositionRef.current = initialPosition.clone();
    scene3dDebug.spawn('character', command.id, command.anchor);
  }, [initialPosition, targetRotation, command.id, command.anchor]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (entranceRef.current.active) {
      entranceRef.current.elapsed += delta;
      const t = Math.min(entranceRef.current.elapsed / ENTRANCE_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      group.scale.setScalar(ease);
      if (t >= 1) {
        entranceRef.current.active = false;
        group.scale.setScalar(1);
      }
      return;
    }

    if (targetPositionRef.current) {
      const target = targetPositionRef.current;
      const dir = target.clone().sub(group.position);
      dir.y = 0;
      const dist = dir.length();

      if (dist > 0.1) {
        dir.normalize();
        const moveAmount = Math.min(WALK_SPEED * delta, dist);
        group.position.add(dir.multiplyScalar(moveAmount));

        const targetRot = Math.atan2(dir.x, dir.z);
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRot, ROTATION_SPEED * delta);

        group.position.y = target.y + Math.sin(Date.now() * 0.001 * BOB_FREQUENCY * Math.PI * 2) * BOB_AMPLITUDE;
      } else {
        group.position.copy(target);
        targetPositionRef.current = null;
        setCurrentAnimation(command.animation || 'idle');
      }
    } else {
      const smoothRot = THREE.MathUtils.lerp(group.rotation.y, targetRotation, ROTATION_SPEED * delta);
      group.rotation.y = smoothRot;

      if (currentAnimation === 'idle' || currentAnimation === 'combat_idle') {
        group.position.y = initialPosition.y + Math.sin(Date.now() * 0.001 * BREATH_FREQUENCY * Math.PI * 2) * BREATH_AMPLITUDE;
      } else if (currentAnimation === 'talk') {
        group.position.y = initialPosition.y + Math.sin(Date.now() * 0.001 * 2 * Math.PI * 2) * BREATH_AMPLITUDE * 1.5;
      } else if (currentAnimation === 'sit') {
        group.position.y = initialPosition.y - (prefab?.yOffset || 0) * 0.3;
      }
    }
  });

  const scale = command.scale || 1;

  return (
    <group ref={groupRef} position={initialPosition.toArray()} rotation={[0, targetRotation, 0]} scale={[0, 0, 0]}>
      <group scale={[scale, scale, scale]}>
        <GLBModel
          url={modelUrl}
          fallback={<PlaceholderMesh prefab={prefab} label={command.name} />}
        />
        {command.highlighted && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(prefab?.yOffset || 0) + 0.02, 0]}>
            <ringGeometry args={[0.35, 0.45, 24]} />
            <meshBasicMaterial color="#C59AFF" transparent opacity={0.6} />
          </mesh>
        )}
      </group>
    </group>
  );
}
