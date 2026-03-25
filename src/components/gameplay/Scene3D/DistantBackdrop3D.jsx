import { useMemo } from 'react';
import * as THREE from 'three';
import {
  createSeededRandom,
  createSceneSeed,
  darken,
  lighten,
  range,
} from './proceduralSceneUtils';

const BACKDROP_COLORS = {
  dawn: '#A07466',
  morning: '#7A8EA5',
  afternoon: '#6B7C8A',
  evening: '#694B56',
  night: '#2A3444',
};

function getBackdropProfile(environmentType) {
  switch (environmentType) {
    case 'forest':
      return { hills: 8, silhouette: 'treeLine', radius: 21, height: [1.5, 4.8] };
    case 'village':
      return { hills: 6, silhouette: 'roofs', radius: 21.5, height: [1.8, 4.2] };
    case 'city_street':
      return { hills: 7, silhouette: 'city', radius: 22, height: [2.2, 6.5] };
    case 'camp':
      return { hills: 7, silhouette: 'tents', radius: 21, height: [1.2, 3.6] };
    case 'road':
      return { hills: 8, silhouette: 'treeLine', radius: 21.5, height: [1.4, 4.5] };
    case 'river':
      return { hills: 7, silhouette: 'bank', radius: 22, height: [1.2, 3.6] };
    case 'mountain':
      return { hills: 9, silhouette: 'mountains', radius: 23, height: [3.5, 8.5] };
    case 'battlefield':
      return { hills: 7, silhouette: 'battlefield', radius: 21.5, height: [1.6, 4.8] };
    case 'swamp':
      return { hills: 8, silhouette: 'marsh', radius: 21, height: [1.2, 3.8] };
    default:
      return { hills: 6, silhouette: 'hills', radius: 21, height: [1.4, 4.2] };
  }
}

export default function DistantBackdrop3D({
  environmentType,
  timeOfDay,
  floorSize,
  seed,
  isIndoor = false,
}) {
  const backdrop = useMemo(() => {
    if (isIndoor) return { layers: [] };

    const profile = getBackdropProfile(environmentType);
    const random = createSeededRandom(createSceneSeed(seed, environmentType, 'backdrop'));
    const baseColor = BACKDROP_COLORS[timeOfDay] || BACKDROP_COLORS.afternoon;
    const layers = [];

    for (let i = 0; i < profile.hills; i++) {
      const angle = (i / profile.hills) * Math.PI * 2 + range(random, -0.1, 0.1);
      const radius = range(random, Math.max(18, floorSize * 0.48), profile.radius);
      const width = range(random, 4.8, 8.5);
      const height = range(random, profile.height[0], profile.height[1]);
      const depth = range(random, 1.4, 3.4);

      layers.push({
        id: `hill-${i}`,
        kind: 'hill',
        position: [Math.cos(angle) * radius, height * 0.42, Math.sin(angle) * radius],
        rotationY: -angle + Math.PI / 2,
        width,
        height,
        depth,
        color: darken(baseColor, range(random, 0.08, 0.26)),
      });
    }

    for (let i = 0; i < profile.hills; i++) {
      const angle = (i / profile.hills) * Math.PI * 2 + range(random, -0.12, 0.12);
      const radius = profile.radius + range(random, 1.2, 4.5);
      const height = range(random, profile.height[0] * 0.8, profile.height[1] * 1.05);
      const color = darken(baseColor, range(random, 0.22, 0.42));

      layers.push({
        id: `silhouette-${i}`,
        kind: profile.silhouette,
        position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        rotationY: -angle + Math.PI / 2,
        height,
        scale: range(random, 0.8, 1.35),
        color,
      });
    }

    return { layers };
  }, [environmentType, floorSize, isIndoor, seed, timeOfDay]);

  if (isIndoor) return null;

  return (
    <group>
      {backdrop.layers.map((layer) => {
        if (layer.kind === 'hill') {
          return (
            <mesh
              key={layer.id}
              position={layer.position}
              rotation={[0, layer.rotationY, 0]}
              receiveShadow
            >
              <cylinderGeometry args={[layer.depth, layer.width * 0.5, layer.height, 8]} />
              <meshStandardMaterial color={layer.color} roughness={1} transparent opacity={0.95} />
            </mesh>
          );
        }

        if (layer.kind === 'mountains') {
          return (
            <group key={layer.id} position={layer.position} rotation={[0, layer.rotationY, 0]} scale={[layer.scale, layer.scale, layer.scale]}>
              <mesh position={[0, layer.height * 0.45, 0]}>
                <coneGeometry args={[2.2, layer.height, 5]} />
                <meshStandardMaterial color={layer.color} roughness={1} transparent opacity={0.88} />
              </mesh>
              <mesh position={[-2, layer.height * 0.32, -0.4]}>
                <coneGeometry args={[1.5, layer.height * 0.72, 5]} />
                <meshStandardMaterial color={lighten(layer.color, 0.06)} roughness={1} transparent opacity={0.82} />
              </mesh>
              <mesh position={[1.9, layer.height * 0.26, 0.2]}>
                <coneGeometry args={[1.3, layer.height * 0.58, 5]} />
                <meshStandardMaterial color={darken(layer.color, 0.08)} roughness={1} transparent opacity={0.82} />
              </mesh>
            </group>
          );
        }

        if (layer.kind === 'treeLine' || layer.kind === 'marsh') {
          return (
            <group key={layer.id} position={layer.position} rotation={[0, layer.rotationY, 0]} scale={[layer.scale, layer.scale, layer.scale]}>
              <mesh position={[0, layer.height * 0.28, 0]}>
                <cylinderGeometry args={[0.14, 0.2, layer.height * 0.55, 6]} />
                <meshStandardMaterial color={darken(layer.color, 0.18)} roughness={1} transparent opacity={0.7} />
              </mesh>
              <mesh position={[0, layer.height * 0.64, 0]}>
                <coneGeometry args={[1.1, layer.height * 0.9, 6]} />
                <meshStandardMaterial color={layer.color} roughness={1} transparent opacity={0.78} />
              </mesh>
            </group>
          );
        }

        if (layer.kind === 'roofs' || layer.kind === 'city') {
          return (
            <group key={layer.id} position={layer.position} rotation={[0, layer.rotationY, 0]} scale={[layer.scale, layer.scale, layer.scale]}>
              <mesh position={[0, layer.height * 0.3, 0]}>
                <boxGeometry args={[2.8, layer.height * (layer.kind === 'city' ? 0.95 : 0.65), 1.8]} />
                <meshStandardMaterial color={layer.color} roughness={1} transparent opacity={0.74} />
              </mesh>
              <mesh position={[0, layer.height * (layer.kind === 'city' ? 0.86 : 0.56), 0]} rotation={[0, Math.PI / 4, 0]}>
                <coneGeometry args={[1.7, layer.height * 0.44, 4]} />
                <meshStandardMaterial color={darken(layer.color, 0.06)} roughness={1} transparent opacity={0.76} />
              </mesh>
            </group>
          );
        }

        if (layer.kind === 'tents' || layer.kind === 'battlefield') {
          return (
            <group key={layer.id} position={layer.position} rotation={[0, layer.rotationY, 0]} scale={[layer.scale, layer.scale, layer.scale]}>
              <mesh position={[0, layer.height * 0.24, 0]}>
                <coneGeometry args={[1.5, layer.height * 0.65, 4]} />
                <meshStandardMaterial color={layer.color} roughness={1} transparent opacity={0.72} />
              </mesh>
              {layer.kind === 'battlefield' && (
                <mesh position={[1.3, layer.height * 0.32, 0]}>
                  <boxGeometry args={[0.08, layer.height * 0.7, 0.08]} />
                  <meshStandardMaterial color={lighten(layer.color, 0.06)} roughness={1} transparent opacity={0.7} />
                </mesh>
              )}
            </group>
          );
        }

        if (layer.kind === 'bank') {
          return (
            <group key={layer.id} position={layer.position} rotation={[0, layer.rotationY, 0]} scale={[layer.scale, 1, 1]}>
              <mesh position={[0, layer.height * 0.18, 0]}>
                <boxGeometry args={[4.6, layer.height * 0.36, 2.2]} />
                <meshStandardMaterial color={layer.color} roughness={1} transparent opacity={0.76} />
              </mesh>
              <mesh position={[0, 0.1, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[4.8, 1.8]} />
                <meshBasicMaterial color={lighten(layer.color, 0.08)} transparent opacity={0.12} />
              </mesh>
            </group>
          );
        }

        return null;
      })}
    </group>
  );
}
