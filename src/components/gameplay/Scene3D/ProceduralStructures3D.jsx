import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  createSeededRandom,
  createSceneSeed,
  darken,
  lighten,
  pick,
  range,
} from './proceduralSceneUtils';

const STRUCTURE_PRESETS = {
  village: { houses: 5, fences: 6, tents: 0, sideDistance: 7.4, depth: 13 },
  city_street: { houses: 7, fences: 0, tents: 0, sideDistance: 7.8, depth: 13.5 },
  road: { houses: 2, fences: 4, tents: 0, sideDistance: 8.5, depth: 14 },
  camp: { houses: 0, fences: 3, tents: 4, sideDistance: 8.2, depth: 12 },
  market: { houses: 3, fences: 4, tents: 3, sideDistance: 7.6, depth: 12 },
  ruins: { houses: 3, fences: 0, tents: 0, sideDistance: 8.2, depth: 12 },
};

const WALL_COLORS = ['#866247', '#7A5A42', '#927157', '#6C594B'];
const ROOF_COLORS = ['#6C3E2E', '#70483B', '#50322A', '#7A4B35'];

function createStreetSideScatter(random, count, sideDistance, depth) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    result.push({
      position: [
        side * range(random, sideDistance * 0.9, sideDistance * 1.12),
        0,
        range(random, -depth, depth),
      ],
      side,
    });
  }
  return result;
}

export default function ProceduralStructures3D({
  environmentType,
  timeOfDay,
  floorSize,
  seed,
  isIndoor = false,
}) {
  const smokeRefs = useRef([]);
  const preset = STRUCTURE_PRESETS[environmentType];

  const data = useMemo(() => {
    if (isIndoor || !preset) {
      return { houses: [], fences: [], tents: [], smoke: [] };
    }

    const random = createSeededRandom(createSceneSeed(seed, environmentType, 'structures'));
    const houseSpots = createStreetSideScatter(random, preset.houses, preset.sideDistance, Math.min(preset.depth, floorSize * 0.34));
    const fenceSpots = createStreetSideScatter(random, preset.fences, preset.sideDistance - 1.5, Math.min(preset.depth, floorSize * 0.3));
    const tentSpots = createStreetSideScatter(random, preset.tents, preset.sideDistance - 0.8, Math.min(preset.depth, floorSize * 0.28));

    const houses = houseSpots.map((spot, index) => {
      const width = range(random, 2.2, environmentType === 'city_street' ? 3.8 : 3.2);
      const depth = range(random, 1.8, environmentType === 'city_street' ? 2.8 : 2.3);
      const height = range(random, 1.6, environmentType === 'city_street' ? 3.8 : 2.4);
      const roofHeight = range(random, 0.9, 1.4);
      const wallColor = pick(random, WALL_COLORS);
      const roofColor = pick(random, ROOF_COLORS);
      const chimneyHeight = environmentType === 'ruins' ? 0 : range(random, 0.6, 1.2);

      return {
        id: `house-${index}`,
        position: spot.position,
        rotationY: spot.side > 0 ? -Math.PI / 2 : Math.PI / 2,
        width,
        depth,
        height,
        roofHeight,
        roofColor,
        wallColor,
        broken: environmentType === 'ruins' && random() > 0.55,
        doorColor: darken(wallColor, 0.28),
        windowColor: timeOfDay === 'night' ? '#F2C879' : '#AED5E8',
        lanternColor: timeOfDay === 'night' ? '#FFD18B' : '#FFC05D',
        hasLantern: random() > 0.5,
        chimneyHeight,
        smokeCount: chimneyHeight > 0 && random() > 0.38 ? 3 : 0,
        smokePhase: range(random, 0, Math.PI * 2),
      };
    });

    const smoke = houses.flatMap((house, houseIndex) => {
      if (!house.smokeCount) return [];
      return Array.from({ length: house.smokeCount }, (_, smokeIndex) => ({
        id: `smoke-${houseIndex}-${smokeIndex}`,
        basePosition: [
          house.position[0] + (house.rotationY > 0 ? -house.width * 0.12 : house.width * 0.12),
          house.height + house.roofHeight * 0.8 + house.chimneyHeight + smokeIndex * 0.38,
          house.position[2] - house.depth * 0.08,
        ],
        scale: range(random, 0.14, 0.26),
        phase: house.smokePhase + smokeIndex * 0.7,
        speed: range(random, 0.28, 0.46),
      }));
    });

    const fences = fenceSpots.map((spot, index) => ({
      id: `fence-${index}`,
      position: spot.position,
      rotationY: spot.side > 0 ? 0 : Math.PI,
      length: range(random, 2.4, 4.2),
      posts: Math.floor(range(random, 4, 7)),
      color: pick(random, ['#7A5C42', '#6B513A', '#886545']),
    }));

    const tents = tentSpots.map((spot, index) => ({
      id: `tent-${index}`,
      position: [spot.position[0], 0, spot.position[2] + range(random, -1.5, 1.5)],
      rotationY: range(random, 0, Math.PI * 2),
      size: range(random, 1.2, 2.1),
      color: pick(random, ['#705943', '#5F6A4A', '#8A6B54']),
      clothColor: pick(random, ['#6C4F3B', '#4E5842', '#7C6850']),
    }));

    return { houses, fences, tents, smoke };
  }, [environmentType, floorSize, isIndoor, preset, seed, timeOfDay]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    for (let i = 0; i < data.smoke.length; i++) {
      const ref = smokeRefs.current[i];
      const smoke = data.smoke[i];
      if (!ref || !smoke) continue;
      ref.position.x = smoke.basePosition[0] + Math.sin(elapsed * smoke.speed + smoke.phase) * 0.12;
      ref.position.y = smoke.basePosition[1] + ((elapsed * smoke.speed + smoke.phase) % 1.8) * 0.24;
      ref.position.z = smoke.basePosition[2] + Math.cos(elapsed * smoke.speed * 0.75 + smoke.phase) * 0.08;
      const opacity = 0.18 + Math.sin(elapsed * smoke.speed + smoke.phase) * 0.05;
      ref.material.opacity = Math.max(0.08, opacity);
    }
  });

  if (isIndoor || !preset) return null;

  return (
    <group>
      {data.houses.map((house) => (
        <group key={house.id} position={house.position} rotation={[0, house.rotationY, 0]}>
          <mesh castShadow position={[0, house.height * 0.5, 0]}>
            <boxGeometry args={[house.width, house.height, house.depth]} />
            <meshStandardMaterial color={house.wallColor} roughness={0.95} />
          </mesh>
          {!house.broken && (
            <mesh castShadow position={[0, house.height + house.roofHeight * 0.45, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[Math.max(house.width, house.depth) * 0.75, house.roofHeight, 4]} />
              <meshStandardMaterial color={house.roofColor} roughness={0.92} />
            </mesh>
          )}
          {house.broken && (
            <mesh castShadow position={[0.15, house.height + house.roofHeight * 0.22, -0.1]} rotation={[0.2, Math.PI / 3, 0.15]}>
              <boxGeometry args={[house.width * 0.72, 0.18, house.depth * 0.78]} />
              <meshStandardMaterial color={darken(house.roofColor, 0.12)} roughness={1} />
            </mesh>
          )}
          <mesh position={[0, 0.7, house.depth * 0.51]}>
            <boxGeometry args={[house.width * 0.24, 1.1, 0.08]} />
            <meshStandardMaterial color={house.doorColor} roughness={0.98} />
          </mesh>
          <mesh position={[-house.width * 0.26, house.height * 0.56, house.depth * 0.52]}>
            <boxGeometry args={[0.42, 0.42, 0.06]} />
            <meshStandardMaterial
              color={house.windowColor}
              emissive={house.windowColor}
              emissiveIntensity={timeOfDay === 'night' ? 0.35 : 0.06}
              roughness={0.5}
            />
          </mesh>
          <mesh position={[house.width * 0.26, house.height * 0.56, house.depth * 0.52]}>
            <boxGeometry args={[0.42, 0.42, 0.06]} />
            <meshStandardMaterial
              color={house.windowColor}
              emissive={house.windowColor}
              emissiveIntensity={timeOfDay === 'night' ? 0.35 : 0.06}
              roughness={0.5}
            />
          </mesh>
          {house.chimneyHeight > 0 && (
            <mesh castShadow position={[house.width * 0.18, house.height + house.roofHeight + house.chimneyHeight * 0.32, -house.depth * 0.14]}>
              <boxGeometry args={[0.24, house.chimneyHeight, 0.24]} />
              <meshStandardMaterial color={darken(house.wallColor, 0.18)} roughness={1} />
            </mesh>
          )}
          {house.hasLantern && (
            <>
              <mesh position={[house.width * 0.28, 1.2, house.depth * 0.52]}>
                <sphereGeometry args={[0.12, 10, 10]} />
                <meshBasicMaterial color={house.lanternColor} transparent opacity={timeOfDay === 'night' ? 0.85 : 0.35} />
              </mesh>
              {timeOfDay === 'night' && (
                <pointLight
                  color={house.lanternColor}
                  intensity={0.45}
                  position={[house.width * 0.28, 1.2, house.depth * 0.38]}
                  distance={4}
                  decay={2}
                />
              )}
            </>
          )}
        </group>
      ))}

      {data.fences.map((fence) => (
        <group key={fence.id} position={fence.position} rotation={[0, fence.rotationY, 0]}>
          {Array.from({ length: fence.posts }, (_, index) => {
            const offset = (index / Math.max(fence.posts - 1, 1) - 0.5) * fence.length;
            return (
              <group key={`${fence.id}-post-${index}`} position={[offset, 0, 0]}>
                <mesh castShadow position={[0, 0.38, 0]}>
                  <boxGeometry args={[0.08, 0.76, 0.08]} />
                  <meshStandardMaterial color={fence.color} roughness={1} />
                </mesh>
                {index < fence.posts - 1 && (
                  <>
                    <mesh castShadow position={[fence.length / Math.max(fence.posts - 1, 1) * 0.5, 0.52, 0]}>
                      <boxGeometry args={[fence.length / Math.max(fence.posts - 1, 1), 0.08, 0.05]} />
                      <meshStandardMaterial color={lighten(fence.color, 0.05)} roughness={1} />
                    </mesh>
                    <mesh castShadow position={[fence.length / Math.max(fence.posts - 1, 1) * 0.5, 0.28, 0]}>
                      <boxGeometry args={[fence.length / Math.max(fence.posts - 1, 1), 0.08, 0.05]} />
                      <meshStandardMaterial color={fence.color} roughness={1} />
                    </mesh>
                  </>
                )}
              </group>
            );
          })}
        </group>
      ))}

      {data.tents.map((tent) => (
        <group key={tent.id} position={tent.position} rotation={[0, tent.rotationY, 0]}>
          <mesh castShadow position={[0, tent.size * 0.35, 0]}>
            <coneGeometry args={[tent.size, tent.size * 1.1, 4]} />
            <meshStandardMaterial color={tent.color} roughness={0.95} />
          </mesh>
          <mesh position={[0, tent.size * 0.28, tent.size * 0.55]} rotation={[0.28, 0, 0]}>
            <planeGeometry args={[tent.size * 0.7, tent.size * 0.4]} />
            <meshStandardMaterial color={tent.clothColor} roughness={0.98} side={2} />
          </mesh>
        </group>
      ))}

      {data.smoke.map((smoke, index) => (
        <mesh
          key={smoke.id}
          ref={(node) => { smokeRefs.current[index] = node; }}
          position={smoke.basePosition}
        >
          <sphereGeometry args={[smoke.scale, 10, 10]} />
          <meshBasicMaterial color="#B5B7BB" transparent opacity={0.16} />
        </mesh>
      ))}
    </group>
  );
}
