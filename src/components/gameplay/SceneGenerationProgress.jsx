import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function formatSeconds(ms) {
  const s = Math.floor(ms / 1000);
  return `${s}s`;
}

export default function SceneGenerationProgress({ startTime, estimatedMs }) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef(null);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!startTime) return;

    const tick = (now) => {
      if (now - lastUpdateRef.current >= 100) {
        setElapsed(Date.now() - startTime);
        lastUpdateRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startTime]);

  const hasEstimate = estimatedMs && estimatedMs > 0;

  let percent = null;
  if (hasEstimate) {
    const raw = elapsed / estimatedMs;
    const eased = easeOutCubic(Math.min(raw, 1));
    percent = Math.min(95, Math.round(eased * 100));
  }

  const timeDisplay = hasEstimate
    ? `${formatSeconds(elapsed)} / ~${formatSeconds(estimatedMs)}`
    : formatSeconds(elapsed);

  return (
    <div className="flex flex-col items-center gap-3 py-8 animate-fade-in w-full max-w-xs mx-auto">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 relative">
          <div
            className="w-5 h-5 absolute inset-0 border-2 border-primary/20 border-t-primary rounded-full animate-spin"
            style={{ filter: 'drop-shadow(0 0 4px rgba(197, 154, 255, 0.4))' }}
          />
        </div>
        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-label animate-shimmer">
          {t('gameplay.dmWeavesFate')}
        </p>
      </div>

      <div className="w-full space-y-1.5">
        <div className="h-1.5 w-full bg-surface-container-highest overflow-hidden rounded-full">
          {hasEstimate ? (
            <div
              className="h-full bg-gradient-to-r from-primary-dim to-primary rounded-full relative overflow-hidden"
              style={{
                width: `${percent}%`,
                transition: 'width 300ms ease-out',
                boxShadow: '0 0 8px rgba(197, 154, 255, 0.5)',
              }}
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                style={{ animation: 'barShimmer 2s ease-in-out infinite' }}
              />
            </div>
          ) : (
            <div
              className="h-full w-1/3 bg-gradient-to-r from-primary-dim to-primary rounded-full relative overflow-hidden"
              style={{
                animation: 'indeterminateSlide 1.5s ease-in-out infinite',
                boxShadow: '0 0 8px rgba(197, 154, 255, 0.5)',
              }}
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                style={{ animation: 'barShimmer 2s ease-in-out infinite' }}
              />
            </div>
          )}
        </div>

        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
          <span className="text-on-surface-variant tabular-nums">
            {timeDisplay}
          </span>
          {percent !== null && (
            <span className="text-primary tabular-nums">
              {percent}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
