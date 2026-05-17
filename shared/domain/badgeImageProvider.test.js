import { describe, it, expect } from 'vitest';
import { resolveBadgeImageProvider } from './badgeImageProvider.js';

describe('resolveBadgeImageProvider', () => {
  it('returns sceneImageTier when it is a known provider', () => {
    expect(resolveBadgeImageProvider({ sceneImageTier: 'sd-webui' }, {})).toBe('sd-webui');
    expect(resolveBadgeImageProvider({ sceneImageTier: 'gemini' }, {})).toBe('gemini');
  });

  it('returns null when sceneImageTier is none', () => {
    expect(resolveBadgeImageProvider({ sceneImageTier: 'none' }, {})).toBe(null);
  });

  it('falls back to imageProvider when sceneImageTier is absent', () => {
    expect(resolveBadgeImageProvider({ imageProvider: 'stability' }, {})).toBe('stability');
  });

  it('uses sd-webui env fallback before stability', () => {
    expect(resolveBadgeImageProvider({}, { sdWebuiConfigured: true, stabilityConfigured: true }))
      .toBe('sd-webui');
  });

  it('uses stability env fallback when sd-webui is not configured', () => {
    expect(resolveBadgeImageProvider({}, { sdWebuiConfigured: false, stabilityConfigured: true }))
      .toBe('stability');
  });

  it('returns null when no tier and no env fallbacks', () => {
    expect(resolveBadgeImageProvider({}, {})).toBe(null);
    expect(resolveBadgeImageProvider(null, {})).toBe(null);
  });

  it('prefers explicit tier over env fallbacks', () => {
    expect(resolveBadgeImageProvider(
      { sceneImageTier: 'dalle' },
      { sdWebuiConfigured: true },
    )).toBe('dalle');
  });
});
