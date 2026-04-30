import { useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';

const MAX_SCENE_IMAGE_REPAIR_ATTEMPTS = 2;
const MAX_SCENE_IMAGE_REPAIRS_PER_SESSION = 20;
const MAX_SCENE_IMAGE_MIGRATION_REPAIRS_PER_PASS = 3;
const MAX_SCENE_IMAGE_MIGRATION_SCAN = 12;
const SCENE_IMAGE_MIGRATION_COOLDOWN_MS = 12000;

function probeSceneImage(rawUrl) {
  const resolved = apiClient.resolveMediaUrl(rawUrl);
  if (!resolved || resolved.startsWith('data:')) return Promise.resolve(Boolean(resolved));
  return new Promise((resolve) => {
    const image = new Image();
    let done = false;
    const settle = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const timeoutId = window.setTimeout(() => settle(false), 5000);
    image.onload = () => {
      window.clearTimeout(timeoutId);
      settle(true);
    };
    image.onerror = () => {
      window.clearTimeout(timeoutId);
      settle(false);
    };
    image.src = resolved;
  });
}

/**
 * Encapsulates scene-image repair queue: tracking, retry caps, migration sweep.
 * Owns all repair-related refs and the three effects that drive automatic repair.
 */
export function useImageRepairQueue({
  scenes,
  currentScene,
  viewedScene,
  campaign,
  isGeneratingImage,
  isGeneratingScene,
  isMultiplayer,
  isHost,
  readOnly,
  sceneVisualization,
  generateImageForScene,
  updateSceneImage,
}) {
  const imageAttemptedRef = useRef(new Set());
  const imageRepairAttemptsRef = useRef(new Map());
  const imageRepairInFlightRef = useRef(new Set());
  const imageRepairsCountRef = useRef(0);
  const imageMigrationRunningRef = useRef(false);
  const imageMigrationLastRunRef = useRef(0);

  const repairSceneImage = useCallback(
    async (sceneId, options = {}) => {
      const {
        reason = 'manual',
        skipAutoSave = false,
        markAttempted = true,
        forceNew = false,
      } = options;

      if (!sceneId || (sceneVisualization || 'image') !== 'image') return false;

      const targetScene = scenes.find((scene) => scene?.id === sceneId);
      if (!targetScene?.narrative) {
        console.warn(`[image-repair] Skipping ${sceneId}: missing narrative (${reason})`);
        return false;
      }

      if (imageRepairInFlightRef.current.has(sceneId)) return false;

      const attempts = imageRepairAttemptsRef.current.get(sceneId) || 0;
      if (attempts >= MAX_SCENE_IMAGE_REPAIR_ATTEMPTS) {
        console.warn(`[image-repair] Skipping ${sceneId}: attempt limit reached (${reason})`);
        return false;
      }

      if (imageRepairsCountRef.current >= MAX_SCENE_IMAGE_REPAIRS_PER_SESSION) {
        console.warn(`[image-repair] Session cap reached, skip ${sceneId}`);
        return false;
      }

      imageRepairAttemptsRef.current.set(sceneId, attempts + 1);
      imageRepairInFlightRef.current.add(sceneId);

      try {
        const result = await generateImageForScene(
          sceneId,
          targetScene.narrative,
          targetScene.imagePrompt,
          isMultiplayer ? { genre: campaign?.genre, tone: campaign?.tone } : undefined,
          { skipAutoSave: readOnly || skipAutoSave, forceNew }
        );
        if (!result?.url) return false;

        imageRepairsCountRef.current += 1;
        if (markAttempted) {
          imageAttemptedRef.current.add(sceneId);
        }
        if (isMultiplayer) {
          updateSceneImage?.(sceneId, result.url, result.fullImagePrompt);
        }
        return true;
      } finally {
        imageRepairInFlightRef.current.delete(sceneId);
      }
    },
    [
      sceneVisualization,
      scenes,
      generateImageForScene,
      isMultiplayer,
      campaign?.genre,
      campaign?.tone,
      readOnly,
      updateSceneImage,
    ]
  );

  const resetImageAttempts = useCallback((sceneId) => {
    if (!sceneId) return;
    imageAttemptedRef.current.delete(sceneId);
    imageRepairAttemptsRef.current.delete(sceneId);
  }, []);

  // Current scene missing image (solo/host)
  useEffect(() => {
    if (readOnly) return;
    if ((sceneVisualization || 'image') !== 'image') return;
    if (
      currentScene &&
      !currentScene.image &&
      !isGeneratingImage &&
      !isGeneratingScene &&
      !imageAttemptedRef.current.has(currentScene.id)
    ) {
      if (isMultiplayer && !isHost) return;
      repairSceneImage(currentScene.id, { reason: 'current-missing' });
    }
  }, [
    readOnly,
    sceneVisualization,
    currentScene,
    isGeneratingImage,
    isGeneratingScene,
    isMultiplayer,
    isHost,
    repairSceneImage,
  ]);

  // Viewer mode: repair viewed scene image if broken
  useEffect(() => {
    if (!readOnly) return;
    if ((sceneVisualization || 'image') !== 'image') return;
    if (
      viewedScene &&
      !viewedScene.image &&
      !isGeneratingImage &&
      !isGeneratingScene &&
      !imageAttemptedRef.current.has(viewedScene.id) &&
      viewedScene.narrative
    ) {
      repairSceneImage(viewedScene.id, { reason: 'viewer-missing', skipAutoSave: true });
    }
  }, [readOnly, sceneVisualization, viewedScene, isGeneratingImage, isGeneratingScene, repairSceneImage]);

  // Background migration sweep (probe older scenes, regenerate broken URLs)
  const migrationGenRef = useRef(0);
  useEffect(() => {
    if ((sceneVisualization || 'image') !== 'image') return;
    if (!scenes?.length) return;
    if (isGeneratingImage || isGeneratingScene) return;
    if (isMultiplayer && !isHost) return;

    const now = Date.now();
    if (now - imageMigrationLastRunRef.current < SCENE_IMAGE_MIGRATION_COOLDOWN_MS) return;
    if (imageMigrationRunningRef.current) return;

    const gen = ++migrationGenRef.current;
    imageMigrationRunningRef.current = true;
    imageMigrationLastRunRef.current = now;

    (async () => {
      let repairsDone = 0;
      for (const scene of scenes.slice(0, MAX_SCENE_IMAGE_MIGRATION_SCAN)) {
        if (gen !== migrationGenRef.current) break;
        if (!scene?.id || !scene.narrative) continue;
        if (repairsDone >= MAX_SCENE_IMAGE_MIGRATION_REPAIRS_PER_PASS) break;
        if (imageRepairInFlightRef.current.has(scene.id)) continue;
        if ((imageRepairAttemptsRef.current.get(scene.id) || 0) >= MAX_SCENE_IMAGE_REPAIR_ATTEMPTS) continue;

        if (!scene.image) {
          const repaired = await repairSceneImage(scene.id, {
            reason: 'migration-missing',
            skipAutoSave: readOnly,
            markAttempted: false,
          });
          if (repaired) repairsDone += 1;
          continue;
        }

        const canLoad = await probeSceneImage(scene.image);
        if (gen !== migrationGenRef.current) break;
        if (!canLoad) {
          const repaired = await repairSceneImage(scene.id, {
            reason: 'migration-broken-url',
            skipAutoSave: readOnly,
            markAttempted: false,
          });
          if (repaired) repairsDone += 1;
        }
      }
    })()
      .finally(() => {
        if (gen === migrationGenRef.current) {
          imageMigrationRunningRef.current = false;
        }
      });

    return () => {
      migrationGenRef.current += 1;
    };
  }, [
    sceneVisualization,
    scenes,
    isGeneratingImage,
    isGeneratingScene,
    isMultiplayer,
    isHost,
    readOnly,
    repairSceneImage,
  ]);

  return { repairSceneImage, resetImageAttempts };
}
