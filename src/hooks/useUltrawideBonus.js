import { useState, useEffect } from 'react';

const HD_RATIO = 16 / 9;
const LG_BREAKPOINT = 1024;
const RATIO_STEP = 0.1;
/** Left aside: ~linear in (w/h − 16/9) so landscape / ultrawide gains width clearly. */
const SIDEBAR_PX_PER_DELTA = 170;
const MAX_SIDEBAR_BONUS = 220;
const CHAT_PX_PER_STEP = 1;

const ZERO = { sidebar: 0, chat: 5 };

function compute() {
  if (window.innerWidth < LG_BREAKPOINT) return ZERO;
  const delta = window.innerWidth / window.innerHeight - HD_RATIO;
  if (delta <= 0) return ZERO;
  const steps = Math.floor(delta / RATIO_STEP);
  const sidebar = Math.min(MAX_SIDEBAR_BONUS, Math.floor(delta * SIDEBAR_PX_PER_DELTA));
  return { sidebar, chat: steps * CHAT_PX_PER_STEP };
}

export function useUltrawideBonus() {
  const [bonus, setBonus] = useState(compute);

  useEffect(() => {
    const onResize = () => {
      const next = compute();
      setBonus((prev) => (prev.sidebar === next.sidebar && prev.chat === next.chat) ? prev : next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return bonus;
}
