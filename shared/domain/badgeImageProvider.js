/**
 * Image providers supported for CharacterBadge illustrations.
 * Mirrors FE KNOWN_IMAGE_PROVIDERS in BadgesSection / useImageGeneration.
 */
export const BADGE_IMAGE_PROVIDERS = ['dalle', 'gpt-image', 'stability', 'gemini', 'sd-webui'];

/**
 * Pick which image backend to use for a badge from user settings + env fallbacks.
 *
 * @param {object|null|undefined} userSettings - User.settings JSON
 * @param {object} [env]
 * @param {boolean} [env.sdWebuiConfigured] - SD_WEBUI_URL set on server
 * @param {boolean} [env.stabilityConfigured] - server or user Stability key available
 * @returns {string|null} provider id or null when images should be skipped
 */
export function resolveBadgeImageProvider(userSettings, env = {}) {
  const settings = userSettings && typeof userSettings === 'object' ? userSettings : {};

  const tier = settings.sceneImageTier;
  if (tier === 'none') return null;
  if (BADGE_IMAGE_PROVIDERS.includes(tier)) return tier;

  const legacy = settings.imageProvider;
  if (BADGE_IMAGE_PROVIDERS.includes(legacy)) return legacy;

  if (env.sdWebuiConfigured) return 'sd-webui';
  if (env.stabilityConfigured) return 'stability';

  return null;
}
