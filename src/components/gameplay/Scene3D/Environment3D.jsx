import { useMemo } from 'react';
import { LIGHTING_PRESETS } from './Lighting3D';

const GROUND_COLORS = {
  tavern:       '#5C3A1E',
  forest:       '#2D5A1E',
  dungeon:      '#3A3A3A',
  road:         '#7A6B5A',
  castle:       '#696969',
  market:       '#8B7355',
  camp:         '#4A6B2A',
  cave:         '#4A4A4A',
  village:      '#6B8E3A',
  city_street:  '#6B6B6B',
  temple:       '#8B8B7A',
  swamp:        '#3B5323',
  mountain:     '#808080',
  river:        '#4A7A5A',
  ruins:        '#7A7A6A',
  battlefield:  '#5A5A3A',
  ship:         '#654321',
  generic:      '#6B7B5A',
};

const SKY_COLORS = {
  dawn:      '#FF7F50',
  morning:   '#87CEEB',
  afternoon: '#4A90D9',
  evening:   '#FF6347',
  night:     '#191970',
};

const FOG_SETTINGS = {
  clear: { enabled: false },
  cloudy: { enabled: true, color: '#C0C0C0', near: 15, far: 40 },
  rain: { enabled: true, color: '#708090', near: 10, far: 30 },
  snow: { enabled: true, color: '#DCDCDC', near: 8, far: 25 },
  fog: { enabled: true, color: '#B0B0B0', near: 3, far: 15 },
  storm: { enabled: true, color: '#4A4A4A', near: 5, far: 20 },
};

/**
 * @param {Object} props
 * @param {import('../../../services/sceneCommandSchema').EnvironmentCommand} props.environment
 */
export default function Environment3D({ environment }) {
  const { type = 'generic', timeOfDay = 'afternoon', weather = 'clear' } = environment || {};

  const groundColor = GROUND_COLORS[type] || GROUND_COLORS.generic;
  const skyColor = SKY_COLORS[timeOfDay] || SKY_COLORS.afternoon;
  const fogConfig = FOG_SETTINGS[weather] || FOG_SETTINGS.clear;
  const isIndoor = ['tavern', 'dungeon', 'castle', 'temple'].includes(type);

  const floorSize = isIndoor ? 12 : 40;
  const wallHeight = isIndoor ? 3.5 : 0;

  const envObjects = useMemo(() => {
    const objs = [];

    if (type === 'tavern') {
      objs.push(
        { type: 'box', pos: [-2.5, 0.375, -0.25], scale: [1.8, 0.75, 1.2], color: '#6B4226' },
        { type: 'box', pos: [0, 0.5, -4], scale: [4, 1, 0.5], color: '#5C3A1E' },
        { type: 'box', pos: [3.5, 0.6, -2], scale: [1.5, 1.2, 0.5], color: '#696969' },
      );
    } else if (type === 'forest') {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 6 + Math.random() * 4;
        objs.push({
          type: 'cone',
          pos: [Math.cos(angle) * dist, 1.5, Math.sin(angle) * dist],
          scale: [1, 3, 1],
          color: '#1B4D1B',
        });
        objs.push({
          type: 'cylinder',
          pos: [Math.cos(angle) * dist, 0.3, Math.sin(angle) * dist],
          scale: [0.15, 0.6, 0.15],
          color: '#654321',
        });
      }
    } else if (type === 'dungeon') {
      objs.push(
        { type: 'box', pos: [-4, 1.25, 0], scale: [0.3, 2.5, 12], color: '#505050' },
        { type: 'box', pos: [4, 1.25, 0], scale: [0.3, 2.5, 12], color: '#505050' },
      );
    } else if (type === 'camp') {
      objs.push({ type: 'cone', pos: [0, 0.3, 0], scale: [0.4, 0.6, 0.4], color: '#FF4500' });
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
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color={groundColor} roughness={0.9} />
      </mesh>

      {/* Sky dome (outdoor only) */}
      {!isIndoor && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[50, 16, 16]} />
          <meshBasicMaterial color={skyColor} side={1} />
        </mesh>
      )}

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

      {/* Ceiling (indoor) */}
      {isIndoor && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, wallHeight, 0]}>
          <planeGeometry args={[floorSize, floorSize]} />
          <meshStandardMaterial color="#3D3D3D" roughness={1} />
        </mesh>
      )}

      {/* Walls (indoor) */}
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

      {/* Environment-specific objects */}
      {envObjects.map((obj, i) => (
        <mesh key={i} position={obj.pos} castShadow>
          {obj.type === 'box' && <boxGeometry args={obj.scale} />}
          {obj.type === 'cone' && <coneGeometry args={[obj.scale[0], obj.scale[1], 8]} />}
          {obj.type === 'cylinder' && <cylinderGeometry args={[obj.scale[0], obj.scale[0], obj.scale[1], 8]} />}
          {obj.type === 'sphere' && <sphereGeometry args={[obj.scale[0], 12, 12]} />}
          <meshStandardMaterial color={obj.color} roughness={0.7} />
        </mesh>
      ))}

      {/* Fog */}
      {fogConfig.enabled && <fog attach="fog" color={fogConfig.color} near={fogConfig.near} far={fogConfig.far} />}
    </group>
  );
}
