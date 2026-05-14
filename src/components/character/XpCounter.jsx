import { useEffect, useRef, useState } from 'react';
import { playXpTick, playXpFinal } from '../../services/badgeAudio';

/**
 * Animated XP counter that rolls from 0 to `target`, decelerating naturally.
 * Plays papery tick sounds during the roll and a chime at the end.
 */
export default function XpCounter({ target }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const lastTickRef = useRef(0);
  const doneRef = useRef(false);

  const duration = Math.min(2000, 800 + target * 8);

  useEffect(() => {
    if (!target || target <= 0) { setDisplay(0); return; }
    doneRef.current = false;
    startTimeRef.current = null;
    lastTickRef.current = 0;

    const step = (ts) => {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const progress = Math.min(1, elapsed / duration);

      // Ease-out cubic — fast start, slow finish
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * target);
      setDisplay(value);

      // Tick audio — interval grows as we decelerate
      const tickInterval = 30 + progress * 120;
      if (elapsed - lastTickRef.current >= tickInterval && value < target) {
        lastTickRef.current = elapsed;
        playXpTick();
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
        if (!doneRef.current) {
          doneRef.current = true;
          playXpFinal();
        }
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return <span>+{display} XP</span>;
}
