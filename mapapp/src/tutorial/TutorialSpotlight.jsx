// TutorialSpotlight — draws a glowing ring around the DOM element marked
// with `data-tutorial-id="${activeStep.targetId}"`.
//
// Sky-blue palette (rgb(56 189 248) / tailwind sky-400) so the ring stays
// distinguishable from the app's primary purple (buttons, selected tabs).
//
// Implementation notes:
//   - `position: fixed` overlay, sized via `getBoundingClientRect()` of
//     the target. `pointer-events: none` so it never blocks clicks.
//   - rAF polling (cheap single rect read per frame) because some panels
//     reflow without firing scroll/resize events.

import React, { useEffect, useState } from 'react';
import { useTutorialStore } from './useTutorialStore.js';

const PADDING = 6;
const RING = 'rgb(56 189 248)';
const RING_SOFT = 'rgba(56,189,248,0.22)';
const RING_GLOW = 'rgba(56,189,248,0.5)';

export default function TutorialSpotlight({ tutorialId }) {
  const active = useTutorialStore((s) => s.active);
  const activeId = useTutorialStore((s) => s.tutorialId);
  const stepIdx = useTutorialStore((s) => s.stepIdx);
  const steps = useTutorialStore((s) => s.steps);
  const step = steps[stepIdx];
  const scopeOk = !tutorialId || !activeId || activeId === tutorialId;
  const targetId = active && scopeOk && step && !step.isFinal ? step.targetId : null;

  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!targetId) {
      setRect(null);
      return undefined;
    }

    let rafId = 0;
    let lastSig = '';

    function tick() {
      const el = document.querySelector(`[data-tutorial-id="${targetId}"]`);
      if (!el) {
        if (lastSig !== 'none') {
          lastSig = 'none';
          setRect(null);
        }
      } else {
        const r = el.getBoundingClientRect();
        const sig = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
        if (sig !== lastSig) {
          lastSig = sig;
          setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        }
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    function onResize() { /* rAF loop picks it up */ }
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [targetId]);

  if (!targetId || !rect) return null;

  const style = {
    position: 'fixed',
    left: rect.left - PADDING,
    top: rect.top - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
    pointerEvents: 'none',
    zIndex: 899,
    borderRadius: 8,
    boxShadow:
      `0 0 0 2px ${RING}, 0 0 0 6px ${RING_SOFT}, 0 0 24px ${RING_GLOW}`,
    animation: 'tutorial-pulse 1.8s ease-in-out infinite',
    transition: 'left 180ms ease-out, top 180ms ease-out, width 180ms ease-out, height 180ms ease-out',
  };

  return (
    <>
      <style>{`
        @keyframes tutorial-pulse {
          0%,100% { box-shadow: 0 0 0 2px ${RING}, 0 0 0 6px ${RING_SOFT}, 0 0 24px ${RING_GLOW}; }
          50%     { box-shadow: 0 0 0 2px ${RING}, 0 0 0 10px rgba(56,189,248,0.10), 0 0 30px rgba(56,189,248,0.7); }
        }
      `}</style>
      <div style={style} aria-hidden="true" />
    </>
  );
}
