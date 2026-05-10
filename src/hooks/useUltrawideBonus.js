import { useState, useEffect } from 'react';

/** Aspect ratio traktowany jako "zero bonusu" — wszystko powyżej dostaje extra px. */
const HD_RATIO = 16 / 9;
/** Poniżej tego breakpointu (Tailwind `lg`) panele mają stałą szerokość. */
const LG_BREAKPOINT = 1024;
/** Co ile delta aspect-ratio liczymy jeden "step" dla chatu. */
const RATIO_STEP = 0.1;
/** Sidebar: px bonusu za każdą jednostkę delta powyżej 16:9. */
const SIDEBAR_PX_PER_DELTA = 40;
/** Twardy cap bonusu sidebara — nawet na 32:9 nie rośnie powyżej bazy + tego. */
const MAX_SIDEBAR_BONUS = 120;
/** Chat: px bonusu za każdy step (delta / RATIO_STEP). */
const CHAT_PX_PER_STEP = 12;

/** Wartości domyślne gdy ekran ≤ 16:9 lub < LG_BREAKPOINT. */
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
