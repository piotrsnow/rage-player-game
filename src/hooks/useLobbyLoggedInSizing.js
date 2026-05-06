import { useState, useLayoutEffect } from 'react';

/** Reference viewport height (vertical) — layout OK at full scale. */
const VIEWPORT_H_REFERENCE = 1440;
/** Full HD height — badge ~35% smaller than at REFERENCE → scale 1 - 0.35 = 0.65. */
const VIEWPORT_H_FHD = 1080;
const SCALE_AT_FHD = 0.65;
const SCALE_MIN = 0.35;

function readLogoBaseRem() {
  if (typeof window === 'undefined') return 22.5;
  if (window.matchMedia('(min-width: 1024px)').matches) return 35;
  if (window.matchMedia('(min-width: 768px)').matches) return 30;
  return 22.5;
}

/**
 * Linear scale vs viewport height: 1080px → 0.65, 1440px → 1.0, extrapolated below/above with clamp.
 * Exported for tests / reuse.
 */
export function lobbyViewportScale(heightPx) {
  if (heightPx >= VIEWPORT_H_REFERENCE) return 1;
  const slope = (1 - SCALE_AT_FHD) / (VIEWPORT_H_REFERENCE - VIEWPORT_H_FHD);
  const scale = SCALE_AT_FHD + (heightPx - VIEWPORT_H_FHD) * slope;
  return Math.max(SCALE_MIN, Math.min(1, scale));
}

function computeSizing() {
  const h = window.innerHeight;
  const s = lobbyViewportScale(h);
  const baseRem = readLogoBaseRem();
  return {
    logoMaxHeightPx: Math.round(baseRem * 16 * s),
    logoTranslateYPx: Math.round(60 * s),
    badgeOverlapPx: Math.round(100 * s),
  };
}

/**
 * Logged-in lobby: logo + badge column sized from viewport height (1080 vs 1440 reference).
 */
export function useLobbyLoggedInSizing(isLoggedIn) {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined' || !isLoggedIn) {
      return {
        logoMaxHeightPx: null,
        logoTranslateYPx: 60,
        badgeOverlapPx: 100,
      };
    }
    return computeSizing();
  });

  useLayoutEffect(() => {
    if (!isLoggedIn) {
      setState({
        logoMaxHeightPx: null,
        logoTranslateYPx: 60,
        badgeOverlapPx: 100,
      });
      return undefined;
    }

    const run = () => setState(computeSizing());
    run();
    window.addEventListener('resize', run);
    return () => window.removeEventListener('resize', run);
  }, [isLoggedIn]);

  return state;
}
