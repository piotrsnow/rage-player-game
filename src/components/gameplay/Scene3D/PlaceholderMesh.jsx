import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Fallback mesh for missing 3D assets.
 * Renders a colored primitive geometry based on prefab description.
 *
 * @param {Object} props
 * @param {Object} props.prefab - From prefabs.js: { geometry, color, scale, yOffset }
 * @param {boolean} [props.loading=false] - Pulse animation when asset is generating
 * @param {string} [props.label] - Optional floating label
 */
export default function PlaceholderMesh({ prefab, loading = false, label }) {
  const meshRef = useRef();
  const baseOpacity = loading ? 0.6 : 0.85;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (loading) {
      meshRef.current.material.opacity = baseOpacity + Math.sin(Date.now() * 0.003) * 0.15;
    }
  });

  if (!prefab) {
    return (
      <mesh ref={meshRef}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#666666" transparent opacity={baseOpacity} />
      </mesh>
    );
  }

  const [sx, sy, sz] = prefab.scale || [1, 1, 1];

  const geometryNode = (() => {
    switch (prefab.geometry) {
      case 'capsule':
        return <capsuleGeometry args={[sx, sy, 8, 16]} />;
      case 'cylinder':
        return <cylinderGeometry args={[sx, sx, sy, 16]} />;
      case 'sphere':
        return <sphereGeometry args={[sx, 16, 16]} />;
      case 'cone':
        return <coneGeometry args={[sx, sy, 16]} />;
      case 'plane':
        return <planeGeometry args={[sx, sz]} />;
      case 'box':
      default:
        return <boxGeometry args={[sx, sy, sz]} />;
    }
  })();

  return (
    <group>
      <mesh ref={meshRef}>
        {geometryNode}
        <meshStandardMaterial
          color={prefab.color || '#808080'}
          transparent
          opacity={baseOpacity}
        />
      </mesh>
      {label && (
        <sprite position={[0, sy + 0.3, 0]} scale={[1.2, 0.3, 1]}>
          <spriteMaterial transparent opacity={0.7} color="#000000" />
        </sprite>
      )}
    </group>
  );
}
