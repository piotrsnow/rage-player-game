import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const TRANSITION_MS = 3500;
const GLOW_LINGER_MS = 2000;

function nameOf(loc) {
  if (!loc) return null;
  return loc.name || null;
}

export default function LocationChip({ current, previous }) {
  const { t } = useTranslation();
  const [stage, setStage] = useState('idle');
  const [glowing, setGlowing] = useState(false);
  const lastSeenRef = useRef(nameOf(current));

  useEffect(() => {
    const cur = nameOf(current);
    const prev = nameOf(previous);
    const last = lastSeenRef.current;

    if (cur && prev && cur !== prev && cur !== last) {
      setStage('transitioning');
      setGlowing(true);
      lastSeenRef.current = cur;
      const transHandle = setTimeout(() => setStage('idle'), TRANSITION_MS);
      const glowHandle = setTimeout(() => setGlowing(false), TRANSITION_MS + GLOW_LINGER_MS);
      return () => { clearTimeout(transHandle); clearTimeout(glowHandle); };
    }
    lastSeenRef.current = cur;
    setStage('idle');
    return undefined;
  }, [current, previous]);

  const curName = nameOf(current);
  const prevName = nameOf(previous);
  const wandering = !curName && current?.kind === 'wandering';
  const hasLocation = !!curName;

  const pillBase = 'flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all duration-500';
  const pillIdle = 'bg-surface-container-high/60 text-on-surface-variant';
  const pillGlow = 'bg-primary/15 text-primary ring-2 ring-primary/40 shadow-[0_0_12px_rgba(197,154,255,0.35)]';

  if (stage === 'transitioning' && prevName && curName) {
    return (
      <div className={`${pillBase} ${pillGlow} animate-fade-in`}>
        <span className="material-symbols-outlined text-sm text-primary">location_on</span>
        <span className="text-outline/60 line-through text-[10px]">{prevName}</span>
        <span className="material-symbols-outlined text-[10px] text-primary animate-pulse">arrow_forward</span>
        <span className="text-primary font-extrabold">{curName}</span>
      </div>
    );
  }

  return (
    <div className={`${pillBase} ${glowing ? pillGlow : pillIdle}`}>
      <span className={`material-symbols-outlined text-sm ${glowing ? 'text-primary' : ''}`}>location_on</span>
      <span className={wandering ? 'opacity-60 italic' : hasLocation ? '' : 'opacity-40'}>
        {curName || t('locationChip.wandering', 'W drodze')}
      </span>
      {glowing && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
    </div>
  );
}
