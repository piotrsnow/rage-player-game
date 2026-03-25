import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createScatter,
  createSeededRandom,
  createSceneSeed,
  darken,
  lighten,
  pick,
  range,
} from './proceduralSceneUtils';

const FOLIAGE_PRESETS = {
  forest: {
    treeCount: 18,
    shrubCount: 12,
    stoneCount: 8,
    grassCount: 54,
    treeRadius: [7, 16],
    grassRadius: [4, 15],
    canopyColors: ['#315A2A', '#2F6B32', '#466F34'],
    trunkColors: ['#5C3E27', '#6D4A2C'],
  },
  road: {
    treeCount: 8,
    shrubCount: 9,
    stoneCount: 7,
    grassCount: 38,
    treeRadius: [7, 15],
    grassRadius: [3, 15],
    canopyColors: ['#496F34', '#5A7E3D', '#3D5B2C'],
    trunkColors: ['#68462D', '#5A3D27'],
  },
  village: {
    treeCount: 6,
    shrubCount: 10,
    stoneCount: 8,
    grassCount: 34,
    treeRadius: [8, 15],
    grassRadius: [4, 14],
    canopyColors: ['#557B3F', '#5E7A3A', '#4B6A35'],
    trunkColors: ['#765339', '#6B4D31'],
  },
  camp: {
    treeCount: 9,
    shrubCount: 8,
    stoneCount: 6,
    grassCount: 28,
    treeRadius: [8, 16],
    grassRadius: [5, 15],
    canopyColors: ['#445F2E', '#4F6A34', '#3B522A'],
    trunkColors: ['#6A472B', '#5F4027'],
  },
  river: {
    treeCount: 10,
    shrubCount: 14,
    stoneCount: 7,
    grassCount: 42,
    treeRadius: [8, 16],
    grassRadius: [4, 15],
    canopyColors: ['#4E7A45', '#5F8C51', '#426A3A'],
    trunkColors: ['#6F4B31', '#5F4229'],
  },
  swamp: {
    treeCount: 11,
    shrubCount: 15,
    stoneCount: 5,
    grassCount: 46,
    treeRadius: [7, 15],
    grassRadius: [4, 14],
    canopyColors: ['#415B2A', '#3F6A35', '#4A5A2E'],
    trunkColors: ['#634630', '#5B402C'],
  },
  mountain: {
    treeCount: 6,
    shrubCount: 6,
    stoneCount: 14,
    grassCount: 18,
    treeRadius: [9, 17],
    grassRadius: [5, 14],
    canopyColors: ['#465C39', '#4D6440'],
    trunkColors: ['#5D4737', '#6B5744'],
  },
  ruins: {
    treeCount: 7,
    shrubCount: 11,
    stoneCount: 11,
    grassCount: 24,
    treeRadius: [8, 16],
    grassRadius: [4, 14],
    canopyColors: ['#47623A', '#4F6A39', '#566F3F'],
    trunkColors: ['#62462E', '#58402A'],
  },
  battlefield: {
    treeCount: 4,
    shrubCount: 4,
    stoneCount: 13,
    grassCount: 16,
    treeRadius: [9, 16],
    grassRadius: [5, 15],
    canopyColors: ['#4A6138', '#52663A'],
    trunkColors: ['#6B4730', '#5A3E2B'],
  },
  generic: {
    treeCount: 6,
    shrubCount: 8,
    stoneCount: 6,
    grassCount: 24,
    treeRadius: [8, 15],
    grassRadius: [4, 14],
    canopyColors: ['#557242', '#4A6539'],
    trunkColors: ['#65442B', '#5D3D27'],
  },
};

function createEdgeScatter(random, count, sideDistance, depth) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    result.push({
      position: [
        side * range(random, sideDistance * 0.78, sideDistance * 1.18),
        0,
        range(random, -depth, depth),
      ],
    });
  }
  return result;
}

function getScatterPoints(random, environmentType, count, radiusRange, floorSize) {
  if (['road', 'village', 'city_street'].includes(environmentType)) {
    return createEdgeScatter(random, count, floorSize * 0.22, floorSize * 0.34);
  }

  if (environmentType === 'river') {
    return createEdgeScatter(random, count, floorSize * 0.26, floorSize * 0.3).map((entry, index) => ({
      position: [
        entry.position[0],
        0,
        entry.position[2] + (index % 2 === 0 ? -2 : 2),
      ],
    }));
  }

  return createScatter(random, count, {
    minRadius: radiusRange[0],
    maxRadius: Math.min(radiusRange[1], floorSize * 0.45),
  });
}

export default function ProceduralFoliage3D({
  environmentType,
  timeOfDay,
  weather,
  floorSize,
  seed,
  isIndoor = false,
}) {
  const treeRefs = useRef([]);
  const shrubRefs = useRef([]);
  const grassRef = useRef(null);

  const preset = FOLIAGE_PRESETS[environmentType] || FOLIAGE_PRESETS.generic;
  const windStrength = weather === 'storm' ? 1.8 : weather === 'rain' ? 1.25 : 1;
  const baseSeed = createSceneSeed(seed, environmentType, 'foliage');

  const trees = useMemo(() => {
    if (isIndoor || environmentType === 'city_street') return [];
    const random = createSeededRandom(baseSeed);
    const points = getScatterPoints(random, environmentType, preset.treeCount, preset.treeRadius, floorSize);

    return points.map((point, index) => {
      const trunkHeight = range(random, 1.8, 3.4);
      const canopyType = pick(random, ['sphere', 'cone', 'double']);
      const canopyRadius = range(random, 0.75, 1.35);
      return {
        id: `tree-${index}`,
        position: point.position,
        trunkHeight,
        trunkRadius: range(random, 0.12, 0.2),
        trunkColor: pick(random, preset.trunkColors),
        canopyColor: pick(random, preset.canopyColors),
        canopyType,
        canopyRadius,
        canopyLift: trunkHeight * 0.55,
        leanX: range(random, -0.05, 0.05),
        leanZ: range(random, -0.06, 0.06),
        swayAmplitude: range(random, 0.02, 0.05),
        swaySpeed: range(random, 0.55, 1.05),
        phase: range(random, 0, Math.PI * 2),
      };
    });
  }, [baseSeed, environmentType, floorSize, isIndoor, preset]);

  const shrubs = useMemo(() => {
    if (isIndoor) return [];
    const random = createSeededRandom(createSceneSeed(baseSeed, 'shrubs'));
    const points = getScatterPoints(random, environmentType, preset.shrubCount, preset.grassRadius, floorSize);

    return points.map((point, index) => ({
      id: `shrub-${index}`,
      position: [
        point.position[0] + range(random, -0.6, 0.6),
        0,
        point.position[2] + range(random, -0.6, 0.6),
      ],
      scale: [range(random, 0.4, 0.8), range(random, 0.25, 0.5), range(random, 0.4, 0.8)],
      color: darken(pick(random, preset.canopyColors), range(random, 0.02, 0.18)),
      phase: range(random, 0, Math.PI * 2),
      swayAmplitude: range(random, 0.012, 0.025),
    }));
  }, [baseSeed, environmentType, floorSize, isIndoor, preset]);

  const stones = useMemo(() => {
    if (isIndoor) return [];
    const random = createSeededRandom(createSceneSeed(baseSeed, 'stones'));
    const points = getScatterPoints(random, environmentType, preset.stoneCount, preset.grassRadius, floorSize);

    return points.map((point, index) => ({
      id: `stone-${index}`,
      position: [
        point.position[0] + range(random, -0.8, 0.8),
        range(random, 0.06, 0.14),
        point.position[2] + range(random, -0.8, 0.8),
      ],
      rotation: [range(random, -0.2, 0.2), range(random, 0, Math.PI * 2), range(random, -0.2, 0.2)],
      scale: [range(random, 0.25, 0.6), range(random, 0.16, 0.32), range(random, 0.25, 0.55)],
      color: timeOfDay === 'night' ? '#39414C' : pick(random, ['#73706A', '#8A867A', '#5F625C']),
    }));
  }, [baseSeed, environmentType, floorSize, isIndoor, preset, timeOfDay]);

  const grass = useMemo(() => {
    if (isIndoor || preset.grassCount <= 0) return [];
    const random = createSeededRandom(createSceneSeed(baseSeed, 'grass'));
    const points = getScatterPoints(random, environmentType, preset.grassCount, preset.grassRadius, floorSize);

    return points.map((point, index) => ({
      id: `grass-${index}`,
      position: [
        point.position[0] + range(random, -0.65, 0.65),
        range(random, 0.1, 0.18),
        point.position[2] + range(random, -0.65, 0.65),
      ],
      scale: [range(random, 0.3, 0.65), range(random, 0.9, 1.8), range(random, 0.3, 0.65)],
      rotationY: range(random, 0, Math.PI * 2),
      phase: range(random, 0, Math.PI * 2),
      swayAmplitude: range(random, 0.05, 0.12),
      swaySpeed: range(random, 0.6, 1.35),
    }));
  }, [baseSeed, environmentType, floorSize, isIndoor, preset]);

  useLayoutEffect(() => {
    const mesh = grassRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < grass.length; i++) {
      const blade = grass[i];
      dummy.position.set(...blade.position);
      dummy.rotation.set(0, blade.rotationY, 0);
      dummy.scale.set(...blade.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [grass]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    for (let i = 0; i < trees.length; i++) {
      const ref = treeRefs.current[i];
      const tree = trees[i];
      if (!ref || !tree) continue;
      ref.rotation.x = tree.leanX + Math.sin(elapsed * tree.swaySpeed + tree.phase) * tree.swayAmplitude * windStrength * 0.45;
      ref.rotation.z = tree.leanZ + Math.cos(elapsed * (tree.swaySpeed * 0.85) + tree.phase) * tree.swayAmplitude * windStrength;
    }

    for (let i = 0; i < shrubs.length; i++) {
      const ref = shrubRefs.current[i];
      const shrub = shrubs[i];
      if (!ref || !shrub) continue;
      ref.rotation.z = Math.sin(elapsed * 1.2 + shrub.phase) * shrub.swayAmplitude * windStrength;
    }

    if (grassRef.current) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < grass.length; i++) {
        const blade = grass[i];
        dummy.position.set(...blade.position);
        dummy.rotation.set(
          Math.sin(elapsed * blade.swaySpeed + blade.phase) * blade.swayAmplitude * windStrength,
          blade.rotationY,
          Math.cos(elapsed * (blade.swaySpeed * 0.8) + blade.phase) * blade.swayAmplitude * 0.4 * windStrength
        );
        dummy.scale.set(...blade.scale);
        dummy.updateMatrix();
        grassRef.current.setMatrixAt(i, dummy.matrix);
      }
      grassRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (isIndoor) return null;

  const grassColor = lighten(
    pick(createSeededRandom(createSceneSeed(baseSeed, 'grass-color')), preset.canopyColors) || '#5D7A42',
    weather === 'rain' ? 0.1 : 0.03
  );

  return (
    <group>
      {trees.map((tree, index) => (
        <group
          key={tree.id}
          ref={(node) => { treeRefs.current[index] = node; }}
          position={tree.position}
        >
          <mesh castShadow position={[0, tree.trunkHeight * 0.5, 0]}>
            <cylinderGeometry args={[tree.trunkRadius * 0.7, tree.trunkRadius, tree.trunkHeight, 8]} />
            <meshStandardMaterial color={tree.trunkColor} roughness={0.95} />
          </mesh>
          {tree.canopyType === 'sphere' && (
            <mesh castShadow position={[0, tree.trunkHeight + tree.canopyLift * 0.2, 0]}>
              <sphereGeometry args={[tree.canopyRadius, 10, 10]} />
              <meshStandardMaterial color={tree.canopyColor} roughness={0.92} />
            </mesh>
          )}
          {tree.canopyType === 'cone' && (
            <mesh castShadow position={[0, tree.trunkHeight + tree.canopyLift * 0.15, 0]}>
              <coneGeometry args={[tree.canopyRadius, tree.canopyRadius * 2.6, 8]} />
              <meshStandardMaterial color={tree.canopyColor} roughness={0.92} />
            </mesh>
          )}
          {tree.canopyType === 'double' && (
            <>
              <mesh castShadow position={[0, tree.trunkHeight + tree.canopyLift * 0.05, 0]}>
                <sphereGeometry args={[tree.canopyRadius * 0.92, 10, 10]} />
                <meshStandardMaterial color={tree.canopyColor} roughness={0.92} />
              </mesh>
              <mesh castShadow position={[0.2, tree.trunkHeight + tree.canopyLift * 0.52, -0.1]}>
                <sphereGeometry args={[tree.canopyRadius * 0.66, 10, 10]} />
                <meshStandardMaterial color={lighten(tree.canopyColor, 0.08)} roughness={0.92} />
              </mesh>
            </>
          )}
        </group>
      ))}

      {shrubs.map((shrub, index) => (
        <group
          key={shrub.id}
          ref={(node) => { shrubRefs.current[index] = node; }}
          position={shrub.position}
          scale={shrub.scale}
        >
          <mesh castShadow position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.45, 10, 10]} />
            <meshStandardMaterial color={shrub.color} roughness={0.95} />
          </mesh>
          <mesh castShadow position={[0.18, 0.32, -0.08]} scale={[0.7, 0.85, 0.7]}>
            <sphereGeometry args={[0.4, 9, 9]} />
            <meshStandardMaterial color={lighten(shrub.color, 0.05)} roughness={0.95} />
          </mesh>
        </group>
      ))}

      {stones.map((stone) => (
        <mesh
          key={stone.id}
          castShadow
          position={stone.position}
          rotation={stone.rotation}
          scale={stone.scale}
        >
          <dodecahedronGeometry args={[0.7, 0]} />
          <meshStandardMaterial color={stone.color} roughness={1} />
        </mesh>
      ))}

      {grass.length > 0 && (
        <instancedMesh ref={grassRef} args={[null, null, grass.length]} castShadow>
          <coneGeometry args={[0.18, 0.7, 5]} />
          <meshStandardMaterial color={grassColor} roughness={0.98} />
        </instancedMesh>
      )}
    </group>
  );
}
