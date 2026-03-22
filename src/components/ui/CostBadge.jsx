import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const CATEGORY_ICONS = {
  ai: 'smart_toy',
  image: 'image',
  tts: 'record_voice_over',
  sfx: 'graphic_eq',
  music: 'music_note',
};

function fmt(v) {
  return v < 0.005 ? '<0.01' : v.toFixed(2);
}

export default function CostBadge({ costs }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const { total, breakdown = {} } = costs;
  const categories = Object.entries(breakdown).filter(([, v]) => v > 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="flex items-center gap-1 text-[10px] text-on-surface-variant font-bold hover:text-primary transition-colors cursor-default"
      >
        <span className="material-symbols-outlined text-xs">payments</span>
        ${fmt(total)}
      </button>

      {open && categories.length > 0 && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-surface-container border border-outline-variant/20 rounded-sm shadow-xl p-3 animate-fade-in"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
            {t('costs.totalCost')}
          </p>

          <div className="space-y-1.5">
            {categories.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-on-surface-variant">
                  <span className="material-symbols-outlined text-xs opacity-60">{CATEGORY_ICONS[key]}</span>
                  {t(`costs.${key === 'ai' ? 'aiText' : key === 'image' ? 'images' : key}`)}
                </span>
                <span className="text-[10px] font-mono text-on-surface-variant">${fmt(value)}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-outline-variant/15 flex items-center justify-between">
            <span className="text-[10px] font-bold text-on-surface uppercase tracking-widest">
              {t('costs.totalCost')}
            </span>
            <span className="text-[11px] font-bold font-mono text-primary">${fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
