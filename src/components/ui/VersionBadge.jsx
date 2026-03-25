import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../version';

export default function VersionBadge() {
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

  return (
    <div ref={ref} className="fixed bottom-3 left-3 z-50 pointer-events-auto">
      <button
        onClick={() => setOpen((p) => !p)}
        className="text-[10px] font-mono text-on-surface-variant/40 hover:text-on-surface-variant/80 transition-colors"
      >
        v{APP_VERSION}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 min-w-[200px] bg-surface-container border border-outline-variant/20 rounded-sm shadow-xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-base">info</span>
            <span className="text-xs font-bold text-on-surface tracking-wide">{t('common.appName')}</span>
          </div>
          <div className="space-y-1.5 text-[11px] text-on-surface-variant">
            <div className="flex justify-between">
              <span className="opacity-60">Wersja</span>
              <span className="font-mono font-bold text-primary">{APP_VERSION}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">Stack</span>
              <span>React + Fastify</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-60">System</span>
              <span>WFRP 4e</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
