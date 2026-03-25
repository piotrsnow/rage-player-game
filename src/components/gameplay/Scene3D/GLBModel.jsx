import { useMemo, useEffect, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

/**
 * Loads and renders a GLB model from a URL.
 * Clones the scene so the same GLB can be used by multiple entities.
 * Falls back to `fallback` on load failure.
 *
 * @param {Object} props
 * @param {string} props.url - Path to the .glb file
 * @param {React.ReactNode} [props.fallback] - Rendered when loading fails
 */
export default function GLBModel({ url, fallback = null }) {
  const [failed, setFailed] = useState(false);
  const [gltf, setGltf] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();

    loader.load(
      url,
      (loaded) => { if (!cancelled) setGltf(loaded); },
      undefined,
      () => { if (!cancelled) setFailed(true); },
    );

    return () => { cancelled = true; };
  }, [url]);

  const cloned = useMemo(() => {
    if (!gltf) return null;
    const clone = gltf.scene.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [gltf]);

  if (failed) return fallback;
  if (!cloned) return fallback;

  return <primitive object={cloned} />;
}
