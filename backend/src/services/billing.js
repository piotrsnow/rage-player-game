const BASE_COST_CENTS = 5;

const LEGACY_TTS_COST = { local: 0.02, best: 0.10 };
const LEGACY_IMAGE_COST = { good: 0.10, local: 0.02 };

/**
 * Mirrors frontend `calculateSceneCost` from costTracker.js.
 * Returns cost in integer cents.
 */
export function computeSceneCostCents(userSettings, sceneModelConfig) {
  const ttsTier = userSettings?.sceneTtsTier || 'none';
  const imageTier = userSettings?.sceneImageTier || 'none';

  let ttsDollars = 0;
  if (ttsTier !== 'none') {
    ttsDollars = sceneModelConfig?.tts?.[ttsTier]?.pricePerScene
      ?? LEGACY_TTS_COST[ttsTier]
      ?? 0;
  }

  let imageDollars = 0;
  if (imageTier !== 'none') {
    imageDollars = sceneModelConfig?.image?.[imageTier]?.pricePerScene
      ?? LEGACY_IMAGE_COST[imageTier]
      ?? 0;
  }

  return BASE_COST_CENTS + Math.round(ttsDollars * 100) + Math.round(imageDollars * 100);
}
