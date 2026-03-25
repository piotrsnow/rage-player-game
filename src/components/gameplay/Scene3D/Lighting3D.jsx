import { useMemo } from 'react';

const LIGHTING_PRESETS = {
  dawn: {
    ambientColor: '#FFE4C4',
    ambientIntensity: 0.4,
    sunColor: '#FF8C42',
    sunIntensity: 0.6,
    sunPosition: [-8, 3, -2],
  },
  morning: {
    ambientColor: '#FFF8DC',
    ambientIntensity: 0.5,
    sunColor: '#FFD700',
    sunIntensity: 0.8,
    sunPosition: [-5, 6, -3],
  },
  afternoon: {
    ambientColor: '#FFFFF0',
    ambientIntensity: 0.6,
    sunColor: '#FFFFFF',
    sunIntensity: 1.0,
    sunPosition: [0, 10, -2],
  },
  evening: {
    ambientColor: '#DEB887',
    ambientIntensity: 0.35,
    sunColor: '#FF6347',
    sunIntensity: 0.5,
    sunPosition: [8, 2, -2],
  },
  night: {
    ambientColor: '#191970',
    ambientIntensity: 0.15,
    sunColor: '#4169E1',
    sunIntensity: 0.2,
    sunPosition: [0, 8, -5],
  },
};

const MOOD_MODIFIERS = {
  calm:       { ambientBoost: 0.1, tint: null },
  tense:      { ambientBoost: -0.1, tint: '#8B0000' },
  mysterious: { ambientBoost: -0.05, tint: '#4B0082' },
  jovial:     { ambientBoost: 0.15, tint: '#FFD700' },
  grim:       { ambientBoost: -0.15, tint: '#2F4F4F' },
  eerie:      { ambientBoost: -0.2, tint: '#006400' },
  solemn:     { ambientBoost: -0.05, tint: '#483D8B' },
};

/**
 * @param {Object} props
 * @param {string} props.timeOfDay
 * @param {string} props.mood
 * @param {string} props.environmentType
 */
export default function Lighting3D({ timeOfDay = 'afternoon', mood = 'calm', environmentType = 'generic' }) {
  const lighting = useMemo(() => {
    const preset = LIGHTING_PRESETS[timeOfDay] || LIGHTING_PRESETS.afternoon;
    const moodMod = MOOD_MODIFIERS[mood] || MOOD_MODIFIERS.calm;

    const isIndoor = ['tavern', 'dungeon', 'castle', 'temple'].includes(environmentType);

    return {
      ambientColor: preset.ambientColor,
      ambientIntensity: Math.max(0.05, (isIndoor ? preset.ambientIntensity * 0.6 : preset.ambientIntensity) + moodMod.ambientBoost),
      sunColor: preset.sunColor,
      sunIntensity: isIndoor ? preset.sunIntensity * 0.3 : preset.sunIntensity,
      sunPosition: preset.sunPosition,
      pointLight: isIndoor,
      pointColor: moodMod.tint || '#FF8C00',
      pointIntensity: isIndoor ? 1.2 : 0,
    };
  }, [timeOfDay, mood, environmentType]);

  return (
    <>
      <ambientLight color={lighting.ambientColor} intensity={lighting.ambientIntensity} />
      <directionalLight
        color={lighting.sunColor}
        intensity={lighting.sunIntensity}
        position={lighting.sunPosition}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
        shadow-camera-near={0.5}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      {lighting.pointLight && (
        <pointLight
          color={lighting.pointColor}
          intensity={lighting.pointIntensity}
          position={[0, 2.5, 0]}
          distance={12}
          decay={2}
        />
      )}
      <hemisphereLight
        color="#87CEEB"
        groundColor="#3D2817"
        intensity={0.15}
      />
    </>
  );
}
