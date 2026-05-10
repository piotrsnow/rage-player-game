import { useLayoutEffect, useRef, useState, useCallback } from 'react';

const MIN_SCALE = 0.28;
const SAFE_BOTTOM_MARGIN = 8;

function bottomReservePx() {
  if (typeof window === 'undefined') return 0;
  return window.matchMedia('(min-width: 1024px)').matches ? 0 : 96;
}

/**
 * Scales the lobby hero column to fit the viewport vertically.
 * Prefer heroSlotEl.clientHeight — stable vs innerTop when flex centers shrinking content.
 */
export function useLobbyHeroFit({
  isLoggedIn,
  hasCampaigns,
  hasServerAi,
  logoVisible,
  hasRejoinBanner,
  lobbyRootEl,
  heroSlotEl,
}) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [clipHeight, setClipHeight] = useState(null);

  const measure = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;

    inner.style.setProperty('transform', 'scale(1)');
    void inner.offsetHeight;

    const naturalH = inner.scrollHeight;
    if (naturalH <= 0) return;

    let availableY;

    if (heroSlotEl && heroSlotEl.clientHeight > 8) {
      availableY = heroSlotEl.clientHeight - SAFE_BOTTOM_MARGIN;
    } else if (lobbyRootEl) {
      const rb = lobbyRootEl.getBoundingClientRect();
      const innerTop = inner.getBoundingClientRect().top;
      availableY = rb.bottom - innerTop - SAFE_BOTTOM_MARGIN - 24;
    } else {
      const innerTop = inner.getBoundingClientRect().top;
      availableY = window.innerHeight - innerTop - bottomReservePx() - SAFE_BOTTOM_MARGIN;
    }

    availableY = Math.max(40, availableY);

    const raw = availableY / naturalH;
    const safe = Math.min(1, Number.isFinite(raw) ? raw : 1);
    const nextScale = safe < MIN_SCALE
      ? safe
      : Math.max(MIN_SCALE, safe);

    setFitScale(nextScale);
    setClipHeight(Math.max(0, Math.ceil(naturalH * nextScale + 0.5)));
  }, [lobbyRootEl, heroSlotEl]);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return undefined;

    const schedule = () => requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(measure);
    });

    schedule();
    const roInner = new ResizeObserver(schedule);
    roInner.observe(inner);
    window.addEventListener('resize', schedule);

    let roRoot = null;
    let roSlot = null;
    if (lobbyRootEl) {
      roRoot = new ResizeObserver(schedule);
      roRoot.observe(lobbyRootEl);
    }
    if (heroSlotEl) {
      roSlot = new ResizeObserver(schedule);
      roSlot.observe(heroSlotEl);
    }

    return () => {
      roInner.disconnect();
      if (roRoot) roRoot.disconnect();
      if (roSlot) roSlot.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [measure, isLoggedIn, hasCampaigns, hasServerAi, logoVisible, hasRejoinBanner, lobbyRootEl, heroSlotEl]);

  return { outerRef, innerRef, fitScale, clipHeight };
}
