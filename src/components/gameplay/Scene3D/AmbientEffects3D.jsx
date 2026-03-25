import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  createSeededRandom,
  createSceneSeed,
  lighten,
  pick,
  range,
} from './proceduralSceneUtils';

function isOutdoor(type) {
  return !['tavern', 'dungeon', 'castle', 'temple', 'cave', 'ship'].includes(type);
}

export default function AmbientEffects3D({ environment, sceneId }) {
  const cloudRefs = useRef([]);
  const glowRefs = useRef([]);
  const birdRefs = useRef([]);
  const emberRefs = useRef([]);

  const {
    type = 'generic',
    timeOfDay = 'afternoon',
    weather = 'clear',
    mood = 'calm',
  } = environment || {};

  const outdoor = isOutdoor(type);
  const effects = useMemo(() => {
    if (!outdoor) {
      return { clouds: [], glows: [], birds: [], embers: [] };
    }

    const random = createSeededRandom(createSceneSeed(sceneId, type, timeOfDay, weather, 'ambient'));

    const clouds = timeOfDay === 'night' && weather === 'clear'
      ? []
      : Array.from({ length: weather === 'storm' ? 6 : 4 }, (_, index) => ({
        id: `cloud-${index}`,
        position: [range(random, -20, 20), range(random, 12, 20), range(random, -26, -14)],
        scale: range(random, 0.9, weather === 'storm' ? 1.9 : 1.55),
        speed: range(random, 0.12, weather === 'storm' ? 0.28 : 0.18),
        phase: range(random, 0, Math.PI * 2),
      }));

    const glowEnabled = timeOfDay === 'night' || mood === 'mysterious' || mood === 'eerie';
    const glowColor = type === 'forest' || type === 'swamp' ? '#8BFFB7' : type === 'camp' ? '#FFB76B' : '#C8D8FF';
    const glows = glowEnabled
      ? Array.from({ length: type === 'forest' || type === 'swamp' ? 14 : 8 }, (_, index) => ({
        id: `glow-${index}`,
        position: [range(random, -8, 8), range(random, 0.3, 2.2), range(random, -8, 8)],
        scale: range(random, 0.05, 0.14),
        speed: range(random, 0.6, 1.4),
        phase: range(random, 0, Math.PI * 2),
        color: glowColor,
      }))
      : [];

    const birdEnabled = timeOfDay !== 'night' && weather !== 'storm' && weather !== 'rain';
    const birds = birdEnabled
      ? Array.from({ length: type === 'city_street' ? 4 : 3 }, (_, index) => ({
        id: `bird-${index}`,
        baseX: range(random, -14, 14),
        baseY: range(random, 10, 16),
        baseZ: range(random, -18, -10),
        wingSpan: range(random, 0.45, 0.7),
        speed: range(random, 0.25, 0.45),
        phase: range(random, 0, Math.PI * 2),
      }))
      : [];

    const emberEnabled = type === 'camp' || type === 'battlefield' || (type === 'village' && timeOfDay === 'night');
    const embers = emberEnabled
      ? Array.from({ length: type === 'camp' ? 12 : 8 }, (_, index) => ({
        id: `ember-${index}`,
        basePosition: [range(random, -1.1, 1.1), range(random, 0.3, 1), range(random, -1.1, 1.1)],
        scale: range(random, 0.03, 0.09),
        speed: range(random, 0.6, 1.2),
        phase: range(random, 0, Math.PI * 2),
        color: pick(random, ['#FFB35B', '#FF7F4D', '#FFD27A']),
      }))
      : [];

    return { clouds, glows, birds, embers };
  }, [mood, outdoor, sceneId, timeOfDay, type, weather]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();

    for (let i = 0; i < effects.clouds.length; i++) {
      const ref = cloudRefs.current[i];
      const cloud = effects.clouds[i];
      if (!ref || !cloud) continue;
      ref.position.x = cloud.position[0] + Math.sin(elapsed * cloud.speed + cloud.phase) * 7;
      ref.position.y = cloud.position[1] + Math.sin(elapsed * cloud.speed * 0.45 + cloud.phase) * 0.35;
      ref.position.z = cloud.position[2] + Math.cos(elapsed * cloud.speed * 0.35 + cloud.phase) * 1.5;
    }

    for (let i = 0; i < effects.glows.length; i++) {
      const ref = glowRefs.current[i];
      const glow = effects.glows[i];
      if (!ref || !glow) continue;
      ref.position.x = glow.position[0] + Math.sin(elapsed * glow.speed + glow.phase) * 0.6;
      ref.position.y = glow.position[1] + Math.sin(elapsed * glow.speed * 1.4 + glow.phase) * 0.28;
      ref.position.z = glow.position[2] + Math.cos(elapsed * glow.speed + glow.phase) * 0.6;
      ref.material.opacity = 0.35 + Math.sin(elapsed * glow.speed * 2 + glow.phase) * 0.18;
    }

    for (let i = 0; i < effects.birds.length; i++) {
      const ref = birdRefs.current[i];
      const bird = effects.birds[i];
      if (!ref || !bird) continue;
      ref.position.x = bird.baseX + Math.sin(elapsed * bird.speed + bird.phase) * 9;
      ref.position.y = bird.baseY + Math.sin(elapsed * bird.speed * 2.2 + bird.phase) * 0.45;
      ref.position.z = bird.baseZ + Math.cos(elapsed * bird.speed * 0.7 + bird.phase) * 2.4;
      ref.rotation.z = Math.sin(elapsed * bird.speed * 8 + bird.phase) * 0.35;
    }

    for (let i = 0; i < effects.embers.length; i++) {
      const ref = emberRefs.current[i];
      const ember = effects.embers[i];
      if (!ref || !ember) continue;
      ref.position.x = ember.basePosition[0] + Math.sin(elapsed * ember.speed + ember.phase) * 0.3;
      ref.position.y = ember.basePosition[1] + ((elapsed * ember.speed + ember.phase) % 2.4) * 0.55;
      ref.position.z = ember.basePosition[2] + Math.cos(elapsed * ember.speed + ember.phase) * 0.3;
      ref.material.opacity = 0.28 + Math.sin(elapsed * ember.speed * 2.1 + ember.phase) * 0.12;
    }
  });

  if (!outdoor) return null;

  const cloudColor = weather === 'storm'
    ? '#808691'
    : weather === 'cloudy'
      ? '#D7DCE4'
      : lighten('#DCE7F3', timeOfDay === 'evening' ? 0.04 : 0.1);

  return (
    <group>
      {effects.clouds.map((cloud, index) => (
        <group
          key={cloud.id}
          ref={(node) => { cloudRefs.current[index] = node; }}
          position={cloud.position}
        >
          <mesh position={[-1.5 * cloud.scale, 0, 0]}>
            <sphereGeometry args={[1.4 * cloud.scale, 10, 10]} />
            <meshBasicMaterial color={cloudColor} transparent opacity={weather === 'storm' ? 0.28 : 0.44} />
          </mesh>
          <mesh position={[0, 0.24 * cloud.scale, 0.18]}>
            <sphereGeometry args={[1.9 * cloud.scale, 10, 10]} />
            <meshBasicMaterial color={cloudColor} transparent opacity={weather === 'storm' ? 0.3 : 0.48} />
          </mesh>
          <mesh position={[1.55 * cloud.scale, 0, -0.1]}>
            <sphereGeometry args={[1.3 * cloud.scale, 10, 10]} />
            <meshBasicMaterial color={lighten(cloudColor, 0.04)} transparent opacity={weather === 'storm' ? 0.26 : 0.42} />
          </mesh>
        </group>
      ))}

      {effects.glows.map((glow, index) => (
        <mesh
          key={glow.id}
          ref={(node) => { glowRefs.current[index] = node; }}
          position={glow.position}
        >
          <sphereGeometry args={[glow.scale, 10, 10]} />
          <meshBasicMaterial color={glow.color} transparent opacity={0.42} />
        </mesh>
      ))}

      {effects.birds.map((bird, index) => (
        <mesh
          key={bird.id}
          ref={(node) => { birdRefs.current[index] = node; }}
          position={[bird.baseX, bird.baseY, bird.baseZ]}
          rotation={[0, 0, 0]}
        >
          <coneGeometry args={[bird.wingSpan, bird.wingSpan * 1.8, 3]} />
          <meshBasicMaterial color="#1D232D" transparent opacity={0.72} />
        </mesh>
      ))}

      {effects.embers.map((ember, index) => (
        <mesh
          key={ember.id}
          ref={(node) => { emberRefs.current[index] = node; }}
          position={ember.basePosition}
        >
          <sphereGeometry args={[ember.scale, 8, 8]} />
          <meshBasicMaterial color={ember.color} transparent opacity={0.34} />
        </mesh>
      ))}
    </group>
  );
}
