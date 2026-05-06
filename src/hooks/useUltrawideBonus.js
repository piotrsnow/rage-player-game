import { useState, useEffect } from 'react';

const HD_RATIO = 16 / 9;
const LG_BREAKPOINT = 1024;
const RATIO_STEP = 0.05;
const SIDEBAR_PX_PER_STEP = 1;
const CHAT_PX_PER_STEP = 5;

const ZERO = { sidebar: 0, chat: 0 };

function compute() {
  if (window.innerWidth < LG_BREAKPOINT) return ZERO;
  const delta = window.innerWidth / window.innerHeight - HD_RATIO;
  if (delta <= 0) return ZERO;
  const steps = Math.floor(delta / RATIO_STEP);
  return { sidebar: steps * SIDEBAR_PX_PER_STEP, chat: steps * CHAT_PX_PER_STEP };
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
