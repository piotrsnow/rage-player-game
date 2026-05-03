import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const TRANSITION_MS = 3500;

function nameOf(loc) {
  if (!loc) return null;
  return loc.name || null;
}

export default function LocationChip({ current, previous }) {
  const { t } = useTranslation();
  const [stage, setStage] = useState('idle');
  const lastSeenRef = useRef(nameOf(current));

  useEffect(() => {
    const cur = nameOf(current);
    const prev = nameOf(previous);
    const last = lastSeenRef.current;

    // Trigger transition only when (a) current name actually differs from the
    // previous scene's snapshot AND (b) we haven't already animated this same
    // pair (lastSeenRef catches re-renders that don't change the location).
    if (cur && prev && cur !== prev && cur !== last) {
      setStage('transitioning');
      lastSeenRef.current = cur;
      const handle = setTimeout(() => setStage('idle'), TRANSITION_MS);
      return () => clearTimeout(handle);
    }
    lastSeenRef.current = cur;
    setStage('idle');
    return undefined;
  }, [current, previous]);

  if (!current) return null;
  const curName = nameOf(current);
  const prevName = nameOf(previous);
  const wandering = !curName && current.kind === 'wandering';

  if (stage === 'transitioning' && prevName && curName) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-on-surface-variant font-bold animate-fade-in">
        <span className="material-symbols-outlined text-xs">location_on</span>
        <span className="text-outline opacity-60 line-through">{prevName}</span>
        <span className="material-symbols-outlined text-[10px] text-primary">arrow_forward</span>
        <span className="text-primary">{curName}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-[10px] text-on-surface-variant font-bold">
      <span className="material-symbols-outlined text-xs">location_on</span>
      <span className={wandering ? 'opacity-60 italic' : ''}>
        {curName || t('locationChip.wandering', 'W drodze')}
      </span>
    </div>
  );
}
