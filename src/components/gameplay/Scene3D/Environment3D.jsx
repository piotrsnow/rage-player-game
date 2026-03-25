import { useMemo } from 'react';
import * as THREE from 'three';
import { LIGHTING_PRESETS } from './Lighting3D';
import ProceduralFoliage3D from './ProceduralFoliage3D';
import ProceduralStructures3D from './ProceduralStructures3D';
import DistantBackdrop3D from './DistantBackdrop3D';
import { createSceneSeed } from './proceduralSceneUtils';

const GROUND_COLORS = {
  tavern: '#5C3A1E',
  forest: '#2D5A1E',
  dungeon: '#3A3A3A',
  road: '#7A6B5A',
  castle: '#696969',
  market: '#8B7355',
  camp: '#4A6B2A',
  cave: '#4A4A4A',
  village: '#6B8E3A',
  city_street: '#6B6B6B',
  temple: '#8B8B7A',
  swamp: '#3B5323',
  mountain: '#808080',
  river: '#4A7A5A',
  ruins: '#7A7A6A',
  battlefield: '#5A5A3A',
  ship: '#654321',
  generic: '#6B7B5A',
};

const SKY_COLORS = {
  dawn: '#FF7F50',
  morning: '#87CEEB',
  afternoon: '#4A90D9',
  evening: '#FF6347',
  night: '#191970',
};

const FOG_SETTINGS = {
  clear: { enabled: false },
  cloudy: { enabled: true, color: '#C0C0C0', near: 15, far: 40 },
  rain: { enabled: true, color: '#708090', near: 10, far: 30 },
  snow: { enabled: true, color: '#DCDCDC', near: 8, far: 25 },
  fog: { enabled: true, color: '#B0B0B0', near: 3, far: 15 },
  storm: { enabled: true, color: '#4A4A4A', near: 5, far: 20 },
};

const PRACTICAL_LIGHT_TYPES = new Set(['campfire', 'torch', 'lantern', 'fireplace']);

const STAR_LAYOUT = [
  [-18, 20, -25, 0.12],
  [-12, 24, -18, 0.08],
  [-4, 22, -28, 0.09],
  [3, 18, -22, 0.1],
  [10, 25, -18, 0.11],
  [17, 21, -24, 0.09],
  [-20, 16, -12, 0.07],
  [-8, 17, -10, 0.08],
  [1, 23, -12, 0.07],
  [9, 19, -8, 0.08],
  [18, 24, -14, 0.1],
  [-15, 26, -6, 0.08],
];

function blendColors(base, tint, amount) {
  return `#${new THREE.Color(base).lerp(new THREE.Color(tint), amount).getHexString()}`;
}

function getGroundPalette(type, timeOfDay, weather) {
  const base = GROUND_COLORS[type] || GROUND_COLORS.generic;
  const weatherTint = {
    clear: base,
    cloudy: '#8B8F96',
    rain: '#4F5D6A',
    snow: '#DDE6EF',
    fog: '#9AA0A6',
    storm: '#3E434B',
    fire: '#7A4A2A',
  }[weather] || base;
  const timeTint = {
    dawn: '#E9A06B',
    morning: '#9CC9E8',
    afternoon: '#B7D38B',
    evening: '#B36A4A',
    night: '#293752',
  }[timeOfDay] || '#9CC9E8';

  const main = blendColors(blendColors(base, weatherTint, 0.35), timeTint, 0.16);
  const detail = blendColors(main, '#F1E0B0', weather === 'snow' ? 0.2 : 0.08);
  const edge = blendColors(main, '#1F1B18', timeOfDay === 'night' ? 0.25 : 0.14);

  return { main, detail, edge };
}

function getFallbackLightConfig(isIndoor, timeOfDay) {
  if (isIndoor) {
    return {
      kind: 'hanging_lantern',
      position: [0, 2.35, 0],
      color: '#FFD28A',
      intensity: 1.2,
      distance: 9,
      decay: 2,
    };
  }

  return {
    kind: 'lantern_post',
    position: [-3.4, 0, 3.2],
    color: timeOfDay === 'night' ? '#BFD7FF' : '#FFD58A',
    intensity: timeOfDay === 'night' ? 1.1 : 0.75,
    distance: timeOfDay === 'night' ? 8 : 6,
    decay: 2,
  };
}

function getGroundFeatures(type, floorSize, timeOfDay) {
  const features = [];

  if (type === 'road' || type === 'city_street' || type === 'village') {
    features.push({
      kind: 'strip',
      position: [0, -0.003, 0],
      size: [floorSize * 0.22, floorSize * 0.9],
      rotation: [-Math.PI / 2, 0, 0],
      color: type === 'city_street' ? '#6A6A6A' : '#7A674F',
      opacity: type === 'city_street' ? 0.55 : 0.42,
    });
  }

  if (type === 'river') {
    features.push({
      kind: 'strip',
      position: [0, -0.002, 0],
      size: [floorSize * 0.28, floorSize * 0.96],
      rotation: [-Math.PI / 2, 0.08, 0],
      color: timeOfDay === 'night' ? '#244C66' : '#4E88A8',
      opacity: 0.7,
    });
  }

  if (type === 'camp') {
    features.push({
      kind: 'circle',
      position: [0, -0.001, 0],
      radius: floorSize * 0.12,
      color: '#6A4A2C',
      opacity: 0.38,
    });
  }

  if (type === 'battlefield' || type === 'ruins') {
    features.push({
      kind: 'ring',
      position: [0, -0.002, 0],
      inner: floorSize * 0.16,
      outer: floorSize * 0.33,
      color: '#4E4035',
      opacity: 0.22,
    });
  }

  return features;
}

/**
 * @param {Object} props
 * @param {import('../../../services/sceneCommandSchema').EnvironmentCommand} props.environment
 * @param {import('../../../services/sceneCommandSchema').ObjectCommand[]} [props.objects]
 * @param {string} [props.sceneId]
 */
export default function Environment3D({ environment, objects = [], sceneId = 'scene' }) {
  const {
    type = 'generic',
    variant = 'default',
    timeOfDay = 'afternoon',
    weather = 'clear',
  } = environment || {};

  const skyColor = SKY_COLORS[timeOfDay] || SKY_COLORS.afternoon;
  const fogConfig = FOG_SETTINGS[weather] || FOG_SETTINGS.clear;
  const isIndoor = ['tavern', 'dungeon', 'castle', 'temple'].includes(type);
  const groundPalette = useMemo(() => getGroundPalette(type, timeOfDay, weather), [type, timeOfDay, weather]);
  const floorSize = isIndoor ? 12 : 40;
  const wallHeight = isIndoor ? 3.5 : 0;
  const sceneSeed = useMemo(() => createSceneSeed(sceneId, type, variant), [sceneId, type, variant]);

  const hasPracticalLight = useMemo(
    () => objects.some((obj) => PRACTICAL_LIGHT_TYPES.has(obj?.type)),
    [objects]
  );
  const fallbackLight = useMemo(
    () => (hasPracticalLight ? null : getFallbackLightConfig(isIndoor, timeOfDay)),
    [hasPracticalLight, isIndoor, timeOfDay]
  );
  const groundFeatures = useMemo(
    () => getGroundFeatures(type, floorSize, timeOfDay),
    [type, floorSize, timeOfDay]
  );

  const envObjects = useMemo(() => {
    const objs = [];

    if (type === 'tavern') {
      objs.push(
        { type: 'box', pos: [-2.5, 0.375, -0.25], scale: [1.8, 0.75, 1.2], color: '#6B4226' },
        { type: 'box', pos: [0, 0.5, -4], scale: [4, 1, 0.5], color: '#5C3A1E' },
        { type: 'box', pos: [3.5, 0.6, -2], scale: [1.5, 1.2, 0.5], color: '#696969' },
      );
    } else if (type === 'dungeon') {
      objs.push(
        { type: 'box', pos: [-4, 1.25, 0], scale: [0.3, 2.5, 12], color: '#505050' },
        { type: 'box', pos: [4, 1.25, 0], scale: [0.3, 2.5, 12], color: '#505050' },
      );
    } else if (type === 'camp') {
      objs.push({ type: 'cone', pos: [0, 0.3, 0], scale: [0.4, 0.6, 0.4], color: '#FF4500' });
    } else if (type === 'ruins') {
      objs.push(
        { type: 'box', pos: [-4.2, 1.05, -2.8], scale: [0.55, 2.1, 1.6], color: '#68635A' },
        { type: 'box', pos: [0, 1.2, -5], scale: [3.8, 2.4, 0.4], color: '#71695D' },
      );
    } else if (type === 'mountain') {
      objs.push(
        { type: 'sphere', pos: [4.6, 0.75, -2.2], scale: [1.2, 1.2, 1.2], color: '#7B7F83' },
        { type: 'sphere', pos: [-3.8, 0.55, 2.1], scale: [0.8, 0.8, 0.8], color: '#6A6F75' },
      );
    }

    return objs;
  }, [type]);

  const celestialBody = useMemo(() => {
    if (isIndoor) return null;
    const preset = LIGHTING_PRESETS[timeOfDay] || LIGHTING_PRESETS.afternoon;
    const [x, y, z] = preset.sunPosition || [0, 8, -5];
    if (timeOfDay === 'night') {
      return {
        kind: 'moon',
        position: [x * 3.2, Math.max(12, y * 2.8), z * 5],
        color: '#E6F0FF',
        glow: '#9DB4FF',
        size: 1.25,
      };
    }
    return {
      kind: 'sun',
      position: [x * 3, Math.max(10, y * 2.5), z * 5],
      color: preset.sunColor || '#FFD700',
      glow: '#FFD27F',
      size: timeOfDay === 'afternoon' ? 1.5 : 1.2,
    };
  }, [isIndoor, timeOfDay]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color={groundPalette.main} roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
        <circleGeometry args={[floorSize * 0.34, 48]} />
        <meshStandardMaterial color={groundPalette.detail} roughness={1} transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <ringGeometry args={[floorSize * 0.34, floorSize * 0.5, 64]} />
        <meshStandardMaterial color={groundPalette.edge} roughness={1} transparent opacity={0.28} />
      </mesh>

      {groundFeatures.map((feature, index) => {
        if (feature.kind === 'strip') {
          return (
            <mesh key={`ground-strip-${index}`} rotation={feature.rotation} position={feature.position} receiveShadow>
              <planeGeometry args={feature.size} />
              <meshStandardMaterial color={feature.color} roughness={1} transparent opacity={feature.opacity} />
            </mesh>
          );
        }
        if (feature.kind === 'circle') {
          return (
            <mesh key={`ground-circle-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={feature.position} receiveShadow>
              <circleGeometry args={[feature.radius, 48]} />
              <meshStandardMaterial color={feature.color} roughness={1} transparent opacity={feature.opacity} />
            </mesh>
          );
        }
        if (feature.kind === 'ring') {
          return (
            <mesh key={`ground-ring-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={feature.position} receiveShadow>
              <ringGeometry args={[feature.inner, feature.outer, 48]} />
              <meshStandardMaterial color={feature.color} roughness={1} transparent opacity={feature.opacity} />
            </mesh>
          );
        }
        return null;
      })}

      {!isIndoor && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[50, 16, 16]} />
          <meshBasicMaterial color={skyColor} side={1} />
        </mesh>
      )}

      {!isIndoor && timeOfDay === 'night' && STAR_LAYOUT.map(([x, y, z, size], index) => (
        <mesh key={`star-${index}`} position={[x, y, z]}>
          <sphereGeometry args={[size, 8, 8]} />
          <meshBasicMaterial color={index % 3 === 0 ? '#F4F8FF' : '#D8E6FF'} />
        </mesh>
      ))}

      {!isIndoor && celestialBody && (
        <group position={celestialBody.position}>
          <mesh>
            <sphereGeometry args={[celestialBody.size, 20, 20]} />
            <meshBasicMaterial color={celestialBody.color} />
          </mesh>
          <mesh>
            <sphereGeometry args={[celestialBody.size * 1.8, 20, 20]} />
            <meshBasicMaterial color={celestialBody.glow} transparent opacity={0.12} />
          </mesh>
        </group>
      )}

      {fallbackLight && fallbackLight.kind === 'hanging_lantern' && (
        <group position={fallbackLight.position}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
            <meshStandardMaterial color="#4B3B2A" roughness={0.85} metalness={0.15} />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.34, 0.28]} />
            <meshStandardMaterial color="#8A6738" emissive={fallbackLight.color} emissiveIntensity={0.35} roughness={0.45} metalness={0.2} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshBasicMaterial color={fallbackLight.color} transparent opacity={0.75} />
          </mesh>
          <pointLight
            color={fallbackLight.color}
            intensity={fallbackLight.intensity}
            position={[0, 0, 0]}
            distance={fallbackLight.distance}
            decay={fallbackLight.decay}
          />
        </group>
      )}

      {fallbackLight && fallbackLight.kind === 'lantern_post' && (
        <group position={fallbackLight.position}>
          <mesh position={[0, 1.05, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 2.1, 8]} />
            <meshStandardMaterial color="#5E4934" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.15, 0]} castShadow>
            <boxGeometry args={[0.28, 0.34, 0.28]} />
            <meshStandardMaterial color="#87653B" emissive={fallbackLight.color} emissiveIntensity={0.28} roughness={0.55} metalness={0.1} />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <sphereGeometry args={[0.11, 10, 10]} />
            <meshBasicMaterial color={fallbackLight.color} transparent opacity={0.72} />
          </mesh>
          <pointLight
            color={fallbackLight.color}
            intensity={fallbackLight.intensity}
            position={[0, 2.15, 0]}
            distance={fallbackLight.distance}
            decay={fallbackLight.decay}
          />
        </group>
      )}

      <DistantBackdrop3D
        environmentType={type}
        timeOfDay={timeOfDay}
        floorSize={floorSize}
        seed={sceneSeed}
        isIndoor={isIndoor}
      />

      <ProceduralFoliage3D
        environmentType={type}
        timeOfDay={timeOfDay}
        weather={weather}
        floorSize={floorSize}
        seed={sceneSeed}
        isIndoor={isIndoor}
      />

      <ProceduralStructures3D
        environmentType={type}
        timeOfDay={timeOfDay}
        floorSize={floorSize}
        seed={sceneSeed}
        isIndoor={isIndoor}
      />

      {isIndoor && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, wallHeight, 0]}>
          <planeGeometry args={[floorSize, floorSize]} />
          <meshStandardMaterial color="#3D3D3D" roughness={1} />
        </mesh>
      )}

      {isIndoor && (
        <>
          <mesh position={[0, wallHeight / 2, -floorSize / 2]}>
            <planeGeometry args={[floorSize, wallHeight]} />
            <meshStandardMaterial color="#5A5A5A" roughness={0.8} />
          </mesh>
          <mesh position={[0, wallHeight / 2, floorSize / 2]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[floorSize, wallHeight]} />
            <meshStandardMaterial color="#5A5A5A" roughness={0.8} />
          </mesh>
          <mesh position={[-floorSize / 2, wallHeight / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[floorSize, wallHeight]} />
            <meshStandardMaterial color="#5A5A5A" roughness={0.8} />
          </mesh>
          <mesh position={[floorSize / 2, wallHeight / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[floorSize, wallHeight]} />
            <meshStandardMaterial color="#5A5A5A" roughness={0.8} />
          </mesh>
        </>
      )}

      {envObjects.map((obj, index) => (
        <mesh key={index} position={obj.pos} castShadow>
          {obj.type === 'box' && <boxGeometry args={obj.scale} />}
          {obj.type === 'cone' && <coneGeometry args={[obj.scale[0], obj.scale[1], 8]} />}
          {obj.type === 'cylinder' && <cylinderGeometry args={[obj.scale[0], obj.scale[0], obj.scale[1], 8]} />}
          {obj.type === 'sphere' && <sphereGeometry args={[obj.scale[0], 12, 12]} />}
          <meshStandardMaterial color={obj.color} roughness={0.7} />
        </mesh>
      ))}

      {fogConfig.enabled && <fog attach="fog" color={fogConfig.color} near={fogConfig.near} far={fogConfig.far} />}
    </group>
  );
}
